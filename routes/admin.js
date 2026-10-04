// ============================================================
// ROUTES : /api/admin (réservé Super Admin)
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole, canActOn } = require('../middleware');
const maintenance = require('../maintenance');

// Toutes les routes ici nécessitent d'être Super Admin
router.use(authenticate, requireRole('super_admin'));

// ---------- MODE MAINTENANCE ----------
// PUT { enabled: true|false, message?: string } -> bascule le site en maintenance.
router.put('/maintenance', (req, res) => {
    const { enabled, message } = req.body || {};
    if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Paramètre enabled (true ou false) requis' });
    }
    if (message !== undefined && typeof message !== 'string') {
        return res.status(400).json({ error: 'Message invalide' });
    }
    const state = maintenance.set({ enabled, message }, req.user.id);
    try {
        db.addLog('MAINTENANCE', req.user.username + ' a ' + (enabled ? 'activé' : 'désactivé') + ' le mode maintenance', req.user.id);
    } catch (e) { /* le journal ne doit pas bloquer la bascule */ }
    if (global.io) maintenance.kickNonAdmins(global.io);
    res.json(state);
});

// ---------- RÉCOMPENSES ----------
// GET  /api/admin/rewards?days=30        tableau de suivi (par action, meilleurs gagnants, parrainages, alertes)
// PUT  /api/admin/rewards/config         montants, plafonds, programme actif ou non
// POST /api/admin/rewards/users/:id/retirer { montant, raison }   retrait en cas de fraude
router.get('/rewards', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(require('../recompenses').tableauAdmin(req.query.days));
});
router.put('/rewards/config', (req, res) => {
    res.json({ success: true, config: require('../recompenses').reglerConfig(req.body || {}, req.user) });
});
// POST /api/admin/rewards/offrir { username, montant, raison }  offrir des crédits à un membre
router.post('/rewards/offrir', (req, res) => {
    const b = req.body || {};
    const target = db.getUserByUsername(String(b.username || '').trim());
    if (!target) return res.status(404).json({ error: 'Aucun membre avec ce pseudo' });
    const r = require('../recompenses').offrir({ cible: target, auteur: req.user, montant: b.montant, raison: b.raison });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true, offert: r.offert, solde: r.solde, username: target.username });
});
router.post('/rewards/users/:id/retirer', (req, res) => {
    const target = db.getUserById(parseInt(req.params.id, 10));
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const r = require('../recompenses').retirer({ cible: target, auteur: req.user, montant: (req.body || {}).montant, raison: (req.body || {}).raison });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true, retire: r.retire });
});

// ---------- STATISTIQUES ----------
// GET /api/admin/stats?days=30 → inscriptions, membres actifs, pic de connectés, crédits vendus, par jour
router.get('/stats', (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(require('../stats').resume(req.query.days));
    } catch (e) {
        console.error('Statistiques :', e);
        res.status(500).json({ error: 'Statistiques indisponibles' });
    }
});

// ---------- SAUVEGARDES DE LA BASE ----------
// GET  /api/admin/backup           → état (dernière sauvegarde, fichiers gardés, réglages)
// POST /api/admin/backup/run       → sauvegarde immédiate + envoi par email
// GET  /api/admin/backup/download  → télécharge une sauvegarde toute fraîche (chiffrée si BACKUP_PASSWORD)
const backup = require('../backup');
router.get('/backup', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(backup.statut(db.dbPath));
});
router.post('/backup/run', async (req, res) => {
    try {
        const r = await backup.lancer(db.db, db.dbPath, require('../mailer'), { raison: 'admin' });
        try { db.addLog('BACKUP', req.user.username + ' a lancé une sauvegarde (' + r.fichier + ')', req.user.id); } catch (e) {}
        res.json(Object.assign({ ok: true }, r, { statut: backup.statut(db.dbPath) }));
    } catch (e) { res.status(500).json({ error: 'Sauvegarde impossible : ' + e.message }); }
});
router.get('/backup/download', async (req, res) => {
    try {
        const s = await backup.fabriquer(db.db);
        try { db.addLog('BACKUP', req.user.username + ' a téléchargé une sauvegarde', req.user.id); } catch (e) {}
        res.set({
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="' + s.nom + '"',
            'Cache-Control': 'no-store',
            'X-Backup-Encrypted': s.chiffre ? '1' : '0',
            'Access-Control-Expose-Headers': 'Content-Disposition, X-Backup-Encrypted'
        }).send(s.contenu);
    } catch (e) { res.status(500).json({ error: 'Sauvegarde impossible : ' + e.message }); }
});

// ---------- LISTE DES UTILISATEURS ----------
router.get('/users', (req, res) => {
    res.json({ users: db.getAllUsers() });
});

// ---------- LOGS ----------
router.get('/logs', (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 200, 1000);
    res.json({ logs: db.getLogs(limit) });
});

// ---------- SIGNALEMENTS ----------
router.get('/reports', (req, res) => {
    res.json({ reports: db.getPendingReports() });
});

// ============================================================
// PROMOTION / RÉVOCATION
// ============================================================
router.post('/users/:id/role', (req, res) => {
    const { role } = req.body;
    const targetId = parseInt(req.params.id);
    const target = db.getUserById(targetId);

    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    // Vérifier qu'on peut agir sur cette cible
    if (!canActOn(req.user, target)) {
        return res.status(403).json({ error: 'Impossible de modifier un utilisateur de rang supérieur ou égal' });
    }

    const allowedRoles = ['user', 'model', 'moderator', 'super_admin'];
    if (!allowedRoles.includes(role)) {
        return res.status(400).json({ error: 'Rôle invalide' });
    }

    db.updateUserRole(targetId, role);
    db.addLog('ROLE_CHANGE', `${req.user.username} a changé le rôle de ${target.username} → ${role}`, req.user.id, targetId);

    res.json({ success: true, user: db.getUserById(targetId) });
});

// ============================================================
// BAN / UNBAN
// ============================================================
router.post('/users/:id/ban', (req, res) => {
    const targetId = parseInt(req.params.id);
    const { reason, minutes } = req.body || {};
    const target = db.getUserById(targetId);
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!canActOn(req.user, target)) return res.status(403).json({ error: 'Permission refusée' });
    // minutes absent ou null : bannissement définitif
    const r = require('../sanctions').appliquer({ cible: target, auteur: req.user, type: 'ban', minutes: minutes === undefined ? null : minutes, raison: reason });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true, message: r.message });
});

router.post('/users/:id/unban', (req, res) => {
    const target = db.getUserById(parseInt(req.params.id));
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    require('../sanctions').lever({ cible: target, auteur: req.user, type: 'ban' });
    res.json({ success: true });
});

// ============================================================
// SUPPRESSION DE COMPTE
// ============================================================
router.delete('/users/:id', (req, res) => {
    const targetId = parseInt(req.params.id);
    const target = db.getUserById(targetId);

    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

    if (!canActOn(req.user, target)) {
        return res.status(403).json({ error: 'Permission refusée' });
    }

    db.addLog('DELETE_ACCOUNT', `${req.user.username} a supprimé le compte de ${target.username}`, req.user.id, targetId);
    db.deleteUser(targetId);

    res.json({ success: true });
});

// ============================================================
// RÉINITIALISER UN MOT DE PASSE (n'importe quel compte)
// L'administrateur reçoit un mot de passe temporaire à transmettre.
// À la connexion suivante, le membre doit obligatoirement en choisir un autre,
// et les sessions déjà ouvertes sont déconnectées.
// ============================================================
function motDePasseTemporaire() {
    const debut = ['Evisio', 'CamLive', 'Studio', 'Direct'][crypto.randomInt(0, 4)];
    const lettre = 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(0, 24)];
    const chiffres = crypto.randomInt(1000, 9999);
    return debut + lettre + chiffres + '!';
}

router.post('/users/:id/reset-password', async (req, res) => {
    try {
        const targetId = parseInt(req.params.id, 10);
        const target = db.getUserById(targetId);
        if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });

        const tempPassword = motDePasseTemporaire();
        const hash = await bcrypt.hash(tempPassword, 12);

        db.setPasswordState(targetId, hash, 1);
        db.touchTokensValidFrom(targetId);
        db.addLog('PASSWORD_RESET_ADMIN',
            `${req.user.username} a réinitialisé le mot de passe de ${target.username}`,
            req.user.id, targetId);

        res.json({ success: true, username: target.username, tempPassword });
    } catch (err) {
        console.error('Erreur réinitialisation mot de passe:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;