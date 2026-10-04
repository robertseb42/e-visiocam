// ============================================================
// ROUTES : modèles, recherche et favoris — E-VISIOCAM
// ------------------------------------------------------------
//  Public (connexion facultative)
//    GET    /api/models?q=&sort=live|new|name     annuaire des modèles (en direct d'abord)
//    GET    /api/models/search?q=                 suggestions de la barre de recherche (modèles + salons)
//  Membre connecté
//    GET    /api/favorites                        mes modèles et salons favoris (+ qui est en direct)
//    PUT    /api/favorites/:type/:key  { notify? } ajouter (type = model | salon) / régler l'alerte email
//    DELETE /api/favorites/:type/:key             retirer
//  Alertes : quand un modèle suivi lance un live PUBLIC, ses abonnés reçoivent
//    - une notification en direct sur le site (événement socket « favori:live »)
//    - un email (au plus un toutes les 6 h par modèle et par abonné, désactivable)
// ============================================================
const express = require('express');
const database = require('../database');
const { db } = database;
const { authenticate, optionalAuthenticate } = require('../middleware');

const EMAIL_PAUSE_H = 6;

db.exec(`
    CREATE TABLE IF NOT EXISTS favorites (
        user_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,          -- 'model' | 'salon'
        target_key TEXT NOT NULL,           -- id du modèle ou slug du salon
        notify_email INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, target_type, target_key),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_favorites_target ON favorites(target_type, target_key);
    CREATE TABLE IF NOT EXISTS favorite_alerts (
        user_id INTEGER NOT NULL,
        model_id INTEGER NOT NULL,
        sent_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, model_id)
    );
`);

// ---------- Qui est en direct (lives publics uniquement) ----------
function livesPublics() {
    const parModele = new Map();
    if (global.liveStreams) {
        global.liveStreams.forEach(s => {
            if (s.isPrivate || s.isBroadcasting === false) return;
            if (!parModele.has(s.broadcasterId)) parModele.set(s.broadcasterId, { salon: s.salon, viewers: (s.viewers || []).length, startedAt: s.startedAt });
        });
    }
    return parModele;
}

const nettoyer = q => String(q || '').trim().slice(0, 40);
const motif = q => '%' + q.replace(/[\\%_]/g, c => '\\' + c) + '%';

function lignesModeles(q, userId) {
    const params = [];
    let where = "u.role = 'model' AND u.status = 'active'";
    if (q) { where += " AND u.username LIKE ? ESCAPE '\\'"; params.push(motif(q)); }
    return db.prepare(`
        SELECT u.id, u.username, u.bio, u.gender, u.created_at,
               (SELECT COUNT(*) FROM favorites f WHERE f.target_type = 'model' AND f.target_key = CAST(u.id AS TEXT)) AS followers,
               ${userId ? "(SELECT 1 FROM favorites f WHERE f.user_id = ? AND f.target_type = 'model' AND f.target_key = CAST(u.id AS TEXT))" : 'NULL'} AS fav
        FROM users u WHERE ${where} LIMIT 200`).all(...(userId ? [userId] : []), ...params);
}

function formeModele(r, lives) {
    const live = lives.get(r.id);
    return {
        id: r.id, username: r.username, bio: (r.bio || '').slice(0, 160), gender: r.gender || '',
        createdAt: r.created_at, followers: r.followers || 0, isFavorite: !!r.fav,
        isLive: !!live, liveSalon: live ? live.salon : null, viewers: live ? live.viewers : 0
    };
}

// ============================================================
// /api/models
// ============================================================
const models = express.Router();

models.get('/', optionalAuthenticate, (req, res) => {
    const q = nettoyer(req.query.q);
    const lives = livesPublics();
    const liste = lignesModeles(q, req.user && req.user.id).map(r => formeModele(r, lives));
    const sort = ['live', 'new', 'name', 'popular'].includes(req.query.sort) ? req.query.sort : 'live';
    const parNom = (a, b) => a.username.localeCompare(b.username, 'fr', { sensitivity: 'base' });
    liste.sort((a, b) => {
        if (sort === 'name') return parNom(a, b);
        if (sort === 'new') return String(b.createdAt).localeCompare(String(a.createdAt));
        if (sort === 'popular') return b.followers - a.followers || parNom(a, b);
        // en direct d'abord (les plus regardés en tête), puis les plus suivis
        return (b.isLive - a.isLive) || (b.viewers - a.viewers) || (b.followers - a.followers) || parNom(a, b);
    });
    res.set('Cache-Control', 'no-store');
    res.json({ models: liste, total: liste.length });
});

models.get('/search', optionalAuthenticate, (req, res) => {
    const q = nettoyer(req.query.q);
    if (q.length < 2) return res.json({ models: [], salons: [] });
    const lives = livesPublics();
    const mods = lignesModeles(q, req.user && req.user.id).map(r => formeModele(r, lives))
        .sort((a, b) => (b.isLive - a.isLive) || (b.followers - a.followers)).slice(0, 6);
    let salons = [];
    try {
        salons = db.prepare("SELECT slug, name, icon, is_private FROM salons WHERE is_hidden = 0 AND name LIKE ? ESCAPE '\\' ORDER BY name LIMIT 4")
            .all(motif(q)).map(s => ({ slug: s.slug, name: s.name, icon: s.icon || '💬', isPrivate: !!s.is_private }));
    } catch (e) { /* table des salons absente : pas de suggestion de salon */ }
    res.set('Cache-Control', 'no-store');
    res.json({ models: mods, salons });
});

// ============================================================
// /api/favorites
// ============================================================
const favorites = express.Router();
favorites.use(authenticate);

function cible(req) {
    const type = req.params.type, key = String(req.params.key || '').slice(0, 60);
    if (type === 'model') {
        const u = database.getUserById(parseInt(key, 10));
        if (!u || u.role !== 'model') return { error: 'Modèle introuvable' };
        if (u.id === req.user.id) return { error: 'Impossible de vous suivre vous-même' };
        return { type, key: String(u.id) };
    }
    if (type === 'salon') {
        let s = null;
        try { s = db.prepare('SELECT slug FROM salons WHERE slug = ? AND is_hidden = 0').get(key); } catch (e) {}
        if (!s) return { error: 'Salon introuvable' };
        return { type, key: s.slug };
    }
    return { error: 'Type de favori inconnu' };
}

favorites.get('/', (req, res) => {
    const rows = db.prepare('SELECT target_type, target_key, notify_email, created_at FROM favorites WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
    const lives = livesPublics();
    const out = { models: [], salons: [] };
    rows.forEach(r => {
        if (r.target_type === 'model') {
            const u = database.getUserById(parseInt(r.target_key, 10));
            if (!u || u.role !== 'model' || u.status !== 'active') return;
            const live = lives.get(u.id);
            out.models.push({ id: u.id, username: u.username, bio: (u.bio || '').slice(0, 160), notify: !!r.notify_email,
                isLive: !!live, liveSalon: live ? live.salon : null, viewers: live ? live.viewers : 0, since: r.created_at });
        } else if (r.target_type === 'salon') {
            let s = null;
            try { s = db.prepare('SELECT slug, name, icon, description, is_private FROM salons WHERE slug = ? AND is_hidden = 0').get(r.target_key); } catch (e) {}
            if (s) out.salons.push({ slug: s.slug, name: s.name, icon: s.icon || '💬', description: s.description || '', isPrivate: !!s.is_private, since: r.created_at });
        }
    });
    out.models.sort((a, b) => b.isLive - a.isLive);
    res.set('Cache-Control', 'no-store');
    res.json(out);
});

favorites.put('/:type/:key', (req, res) => {
    const c = cible(req);
    if (c.error) return res.status(c.error.includes('introuvable') ? 404 : 400).json({ error: c.error });
    const notify = !(req.body && req.body.notify === false);
    db.prepare(`INSERT INTO favorites (user_id, target_type, target_key, notify_email) VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, target_type, target_key) DO UPDATE SET notify_email = excluded.notify_email`)
        .run(req.user.id, c.type, c.key, notify ? 1 : 0);
    res.json({ ok: true, favorite: true, notify });
});

favorites.delete('/:type/:key', (req, res) => {
    const type = req.params.type, key = String(req.params.key || '').slice(0, 60);
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND target_type = ? AND target_key = ?').run(req.user.id, type, key);
    res.json({ ok: true, favorite: false });
});

// ============================================================
// Alerte « un modèle suivi est en direct » (appelée par socket.js)
// ============================================================
const pauseOk = db.prepare(`SELECT 1 FROM favorite_alerts WHERE user_id = ? AND model_id = ? AND sent_at > datetime('now', ?)`);
const noterEnvoi = db.prepare(`INSERT INTO favorite_alerts (user_id, model_id, sent_at) VALUES (?, ?, datetime('now'))
                               ON CONFLICT(user_id, model_id) DO UPDATE SET sent_at = excluded.sent_at`);

function prevenirAbonnes(io, stream) {
    if (!stream || stream.isPrivate) return 0;
    const abonnes = db.prepare(`SELECT f.user_id, f.notify_email, u.email, u.username, u.status
                                FROM favorites f JOIN users u ON u.id = f.user_id
                                WHERE f.target_type = 'model' AND f.target_key = ?`).all(String(stream.broadcasterId));
    if (!abonnes.length) return 0;
    const info = { modelId: stream.broadcasterId, username: stream.broadcasterUsername, salon: stream.salon, streamId: stream.streamId };
    let mailer = null;
    try { mailer = require('../mailer'); } catch (e) {}
    const site = process.env.SITE_URL || 'https://www.e-visiocam.com';
    abonnes.forEach(a => {
        if (a.status !== 'active') return;
        if (io) io.to('user:' + a.user_id).emit('favori:live', info);
        if (!a.notify_email || !a.email || !mailer) return;
        if (pauseOk.get(a.user_id, stream.broadcasterId, '-' + EMAIL_PAUSE_H + ' hours')) return;
        noterEnvoi.run(a.user_id, stream.broadcasterId);
        const esc = t => String(t || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        mailer.sendMail({
            to: a.email,
            subject: '🔴 ' + stream.broadcasterUsername + ' est en direct sur E-VISIOCAM',
            html: mailer.emailTemplate(esc(stream.broadcasterUsername) + ' est en direct',
                '<p>Bonjour ' + esc(a.username) + ',</p><p><strong>' + esc(stream.broadcasterUsername) + '</strong>, que vous suivez, vient de lancer un live dans <strong>' + esc(stream.salon) + '</strong>.</p>' +
                '<p style="font-size:13px;color:#64748b">Vous recevez cet email car ce modèle est dans vos favoris. Vous pouvez couper ces alertes dans « Mes favoris ».</p>',
                'Regarder le live', site + '/live.html'),
            text: stream.broadcasterUsername + ' est en direct sur E-VISIOCAM : ' + site + '/live.html'
        }).catch(() => {});
    });
    return abonnes.length;
}

module.exports = { models, favorites, prevenirAbonnes, livesPublics };
