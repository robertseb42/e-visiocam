// ============================================================
// SANCTIONS : expulsion (kick), bannissement, mise en sourdine (mute) — E-VISIOCAM
// ------------------------------------------------------------
//  kick : déconnexion immédiate ; le membre ne peut pas revenir pendant la durée choisie
//         (0 = simple expulsion, il peut revenir tout de suite)
//  ban  : compte bloqué pendant N jours, ou définitivement (durée vide)
//  mute : le membre reste connecté mais ne peut plus écrire (salon et messages privés)
// Les durées sont choisies à chaque sanction. Une sanction temporaire se lève toute seule.
// Seul le super administrateur peut bannir définitivement ou lever un bannissement.
// ============================================================
const database = require('./database');
const { db } = database;

const MAX_MOD_MINUTES = 30 * 24 * 60;     // un modérateur : 30 jours au plus

// ---------- Migrations ----------
function migrer() {
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    [['banned_until', 'TEXT'], ['kicked_until', 'TEXT'], ['muted_until', 'TEXT'], ['ban_reason', 'TEXT']].forEach(([c, t]) => {
        if (!cols.includes(c)) db.prepare('ALTER TABLE users ADD COLUMN ' + c + ' ' + t).run();
    });
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_sanctions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,                -- kick | ban | mute
            minutes INTEGER,                   -- NULL = définitif (ban)
            until TEXT,                        -- fin (ISO) ; NULL = définitif ou expulsion simple
            reason TEXT,
            by_id INTEGER,
            by_name TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            lifted_at TEXT,
            lifted_by TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sanctions_user ON user_sanctions(user_id, created_at);
    `);
}
let pret = false;
try { migrer(); pret = true; } catch (e) { /* base simulée (tests) : on retombe sur le simple statut « banni » */ }

let lireSanctionsStmt = null;
const lireSanctions = { get: id => (lireSanctionsStmt || (lireSanctionsStmt = db.prepare('SELECT id, username, role, status, banned_until, kicked_until, muted_until, ban_reason FROM users WHERE id = ?'))).get(id) };
const futur = t => !!t && Date.parse(t) > Date.now();

// ---------- État d'un membre (lève au passage ce qui a expiré) ----------
function etat(userOuId) {
    if (!pret) {   // base indisponible : seul le statut compte
        const u = typeof userOuId === 'object' ? userOuId : null;
        return u && u.status === 'banned' ? { bloque: true, type: 'ban', definitif: true, jusqua: null, raison: '', muet: false } : { bloque: false, muet: false };
    }
    const id = typeof userOuId === 'object' && userOuId ? userOuId.id : userOuId;
    const u = id ? lireSanctions.get(id) : null;
    if (!u) return { bloque: false, muet: false };
    if (u.status === 'banned' && u.banned_until && !futur(u.banned_until)) {
        db.prepare("UPDATE users SET status = 'active', banned_until = NULL, ban_reason = NULL WHERE id = ?").run(u.id);
        try { database.addLog('UNBAN_AUTO', u.username + ' : fin du bannissement temporaire', null, u.id); } catch (e) {}
        u.status = 'active'; u.banned_until = null;
    }
    if (u.kicked_until && !futur(u.kicked_until)) {
        db.prepare('UPDATE users SET kicked_until = NULL WHERE id = ?').run(u.id);
        u.kicked_until = null;
    }
    const muet = futur(u.muted_until);
    if (u.status === 'banned') return { bloque: true, type: 'ban', definitif: !u.banned_until, jusqua: u.banned_until || null, raison: u.ban_reason || '', muet };
    if (u.kicked_until) return { bloque: true, type: 'kick', definitif: false, jusqua: u.kicked_until, raison: '', muet };
    return { bloque: false, muet, muetJusqua: muet ? u.muted_until : null };
}

const dateFr = iso => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');

// Phrase montrée au membre bloqué
function message(e) {
    if (!e || !e.bloque) return '';
    if (e.type === 'ban') return e.definitif ? 'Ce compte a été banni définitivement.' + (e.raison ? ' Motif : ' + e.raison : '')
        : 'Ce compte est suspendu jusqu\'au ' + dateFr(e.jusqua) + '.' + (e.raison ? ' Motif : ' + e.raison : '');
    return 'Vous avez été exclu du site jusqu\'au ' + dateFr(e.jusqua) + '.';
}

// ---------- Effet immédiat : prévenir puis déconnecter toutes ses connexions ----------
function prevenirEtDeconnecter(userId, info, deconnecter) {
    const io = global.io;
    if (!io) return;
    for (const s of io.sockets.sockets.values()) {
        if (!s.user || s.user.id !== userId) continue;
        s.emit('moderation:sanction', info);
        if (deconnecter) setTimeout(() => { try { s.disconnect(true); } catch (e) {} }, 400);
    }
}

// ---------- Appliquer une sanction ----------
// minutes : nombre de minutes ; null = définitif (ban uniquement) ; 0 = expulsion simple (kick)
function appliquer({ cible, auteur, type, minutes, raison }) {
    if (!['kick', 'ban', 'mute'].includes(type)) return { erreur: 'Sanction inconnue', code: 400 };
    raison = String(raison || '').trim().slice(0, 300);
    const superAdmin = auteur && auteur.role === 'super_admin';
    if (minutes === null || minutes === undefined || minutes === '') minutes = null;
    else {
        minutes = Math.round(Number(minutes));
        if (!Number.isFinite(minutes) || minutes < 0) return { erreur: 'Durée invalide', code: 400 };
        minutes = Math.min(minutes, 3650 * 24 * 60);   // 10 ans au plus
    }
    if (minutes === null && type !== 'ban') return { erreur: 'Choisissez une durée', code: 400 };
    if (type !== 'kick' && minutes === 0) return { erreur: 'Choisissez une durée', code: 400 };
    // Modérateur stagiaire (3 premières semaines) : pas de bannissement, 60 minutes au plus
    let stagiaire = false;
    try { stagiaire = !!auteur && !superAdmin && require('./routes/equipe').estStagiaire(auteur.id); } catch (e) {}
    if (stagiaire) {
        const max = require('./routes/equipe').STAGE_MAX_MINUTES;
        if (type === 'ban') return { erreur: 'Pendant votre stage, le bannissement est réservé aux modérateurs confirmés. Expulsez la personne et signalez le cas à l’équipe.', code: 403 };
        if (minutes === null || minutes > max) return { erreur: 'Pendant votre stage, une sanction dure ' + max + ' minutes au plus.', code: 403 };
    }
    if (!superAdmin) {
        if (minutes === null) return { erreur: 'Le bannissement définitif est réservé au Super Admin', code: 403 };
        if (minutes > MAX_MOD_MINUTES) return { erreur: 'Un modérateur peut sanctionner 30 jours au plus', code: 403 };
    }

    const jusqua = minutes ? new Date(Date.now() + minutes * 60000).toISOString() : null;
    if (type === 'ban') {
        db.prepare("UPDATE users SET status = 'banned', banned_until = ?, ban_reason = ? WHERE id = ?").run(jusqua, raison || null, cible.id);
    } else if (type === 'kick') {
        db.prepare('UPDATE users SET kicked_until = ? WHERE id = ?').run(jusqua, cible.id);
    } else {
        db.prepare('UPDATE users SET muted_until = ? WHERE id = ?').run(jusqua, cible.id);
    }
    const ins = db.prepare('INSERT INTO user_sanctions (user_id, type, minutes, until, reason, by_id, by_name) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(cible.id, type, minutes, jusqua, raison || null, auteur ? auteur.id : null, auteur ? auteur.username : 'automatique');
    // ✉️ E-mail explicatif au membre, avec un lien personnel pour contester
    try { require('./sanctions-mail').notifierSanction({ sanctionId: ins.lastInsertRowid, cible, type, minutes, jusqua, raison, auto: !auteur }); }
    catch (e) { console.error('E-mail de sanction :', e.message); }

    const duree = libelleDuree(type, minutes);
    const verbe = { kick: 'a expulsé', ban: 'a banni', mute: 'a rendu muet' }[type];
    try {
        database.addLog(type.toUpperCase(), (auteur ? auteur.username : 'Le filtre automatique') + ' ' + verbe + ' ' + cible.username + ' (' + duree + ')' + (raison ? ' - ' + raison : ''),
            auteur ? auteur.id : null, cible.id);
    } catch (e) {}

    const info = { type, minutes, jusqua, definitif: type === 'ban' && minutes === null, raison, duree };
    if (type === 'mute') prevenirEtDeconnecter(cible.id, info, false);
    else prevenirEtDeconnecter(cible.id, Object.assign(info, { message: type === 'kick' && !minutes ? 'Vous avez été expulsé par la modération.' : message(etat(cible.id)) }), true);
    return { ok: true, type, minutes, jusqua, duree, message: cible.username + ' : ' + { kick: 'expulsé', ban: 'banni', mute: 'muet' }[type] + ' (' + duree + ')' };
}

function libelleDuree(type, minutes) {
    if (minutes === null) return 'définitif';
    if (!minutes) return type === 'kick' ? 'expulsion simple' : '—';
    if (minutes % 1440 === 0) return (minutes / 1440) + ' jour' + (minutes >= 2880 ? 's' : '');
    if (minutes % 60 === 0) return (minutes / 60) + ' h';
    return minutes + ' min';
}

// ---------- Lever une sanction ----------
function lever({ cible, auteur, type, silencieux }) {
    if (type === 'ban') {
        db.prepare("UPDATE users SET status = 'active', banned_until = NULL, ban_reason = NULL WHERE id = ?").run(cible.id);
    } else if (type === 'kick') {
        db.prepare('UPDATE users SET kicked_until = NULL WHERE id = ?').run(cible.id);
    } else if (type === 'mute') {
        db.prepare('UPDATE users SET muted_until = NULL WHERE id = ?').run(cible.id);
        prevenirEtDeconnecter(cible.id, { type: 'unmute' }, false);
    } else return { erreur: 'Sanction inconnue', code: 400 };
    db.prepare(`UPDATE user_sanctions SET lifted_at = CURRENT_TIMESTAMP, lifted_by = ?
                WHERE user_id = ? AND type = ? AND lifted_at IS NULL`).run(auteur ? auteur.username : null, cible.id, type);
    try { database.addLog({ ban: 'UNBAN', kick: 'UNKICK', mute: 'UNMUTE' }[type], auteur.username + ' a levé la sanction (' + type + ') de ' + cible.username, auteur.id, cible.id); } catch (e) {}
    if (!silencieux) { try { require('./sanctions-mail').notifierLevee(cible.id, type); } catch (e) {} }
    return { ok: true };
}

function historique(userId, limite = 20) {
    return db.prepare('SELECT type, minutes, until, reason, by_name, created_at, lifted_at, lifted_by FROM user_sanctions WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limite);
}

module.exports = { etat, message, appliquer, lever, historique, libelleDuree, MAX_MOD_MINUTES };
