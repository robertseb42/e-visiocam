// ============================================================
// ROUTES : /api/mod (modération complète)
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate, requireRole, canActOn } = require('../middleware');

// Toutes les routes nécessitent d'être modérateur ou super admin
router.use(authenticate, requireRole('moderator', 'super_admin'));

// ============================================================
// SIGNALEMENTS
// ============================================================
router.get('/reports', (req, res) => {
    const status = req.query.status || 'pending';
    const reports = db.getModerationReports(status, 100);
    res.json({ reports });
});

router.get('/reports/count', (req, res) => {
    const pending = db.getModerationReports('pending').length;
    const resolved = db.getModerationReports('resolved').length;
    const ignored = db.getModerationReports('ignored').length;
    res.json({ pending, resolved, ignored, total: pending + resolved + ignored });
});

router.post('/reports/:id/handle', (req, res) => {
    try {
        const reportId = parseInt(req.params.id);
        const { action, newStatus = 'resolved' } = req.body;

        if (!['resolved', 'ignored', 'escalated'].includes(newStatus)) {
            return res.status(400).json({ error: 'Statut invalide' });
        }

        db.handleModerationReport(reportId, req.user.id, action || 'none', newStatus);
        // 🎁 Signalement utile (une mesure a été prise) : l'auteur du signalement est récompensé
        if (newStatus === 'resolved' && ['warn', 'mute', 'kick', 'ban'].includes(action)) {
            try {
                const rep = db.db.prepare('SELECT reporter_id FROM moderation_reports WHERE id = ?').get(reportId);
                if (rep) require('../recompenses').signalementConfirme(rep.reporter_id);
            } catch (e) {}
        }
        db.addLog('REPORT_HANDLED',
            req.user.username + ' a traité le signalement #' + reportId + ' (' + action + ')',
            req.user.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur handle report:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// MOTS INTERDITS
// ============================================================
router.get('/banned-words', (req, res) => {
    res.json({ words: db.getBannedWords() });
});

router.post('/banned-words', (req, res) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Réservé au Super Admin' });
    }
    const word = String((req.body || {}).word || '').trim().toLowerCase().slice(0, 60);
    const severity = Math.min(5, Math.max(1, parseInt((req.body || {}).severity, 10) || 1));
    if (word.length < 2) return res.status(400).json({ error: 'Mot manquant (2 lettres au moins)' });

    const result = db.addBannedWord(word, severity);
    require('../filtre-mots').invalider();
    if (!result) return res.status(409).json({ error: 'Ce mot existe déjà' });

    db.addLog('BANNED_WORD_ADD',
        req.user.username + ' a ajouté le mot interdit "' + word + '"',
        req.user.id);
    res.json({ success: true });
});

router.delete('/banned-words/:word', (req, res) => {
    if (req.user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Réservé au Super Admin' });
    }
    db.removeBannedWord(req.params.word);
    require('../filtre-mots').invalider();
    db.addLog('BANNED_WORD_DEL',
        req.user.username + ' a supprimé le mot interdit "' + req.params.word + '"',
        req.user.id);
    res.json({ success: true });
});

// POST /api/mod/banned-words/test { text } → ce que le filtre ferait de ce message
router.post('/banned-words/test', (req, res) => {
    const r = require('../filtre-mots').analyser(String((req.body || {}).text || '').slice(0, 500));
    res.json({ gravite: r.gravite, mots: r.trouves, texte: r.texte,
        decision: !r.gravite ? 'envoyé tel quel' : r.gravite <= 2 ? 'envoyé avec le mot masqué' : r.gravite === 3 ? 'bloqué et signalé' : 'bloqué, signalé, auteur muet ' + require('../filtre-mots').AUTO_MUTE_MINUTES + ' min' });
});

// ============================================================
// MESSAGES SIGNALÉS
// ============================================================
router.get('/flagged-messages', (req, res) => {
    const messages = db.getFlaggedMessages(100);
    res.json({ messages });
});

// ============================================================
// UTILISATEURS
// ============================================================
router.get('/users', (req, res) => {
    const users = db.getAllUsers().filter(u =>
        req.user.role === 'super_admin' || u.role !== 'super_admin'
    );
    res.json({ users });
});

// Avertissement
router.post('/users/:id/warn', (req, res) => {
    const targetId = parseInt(req.params.id);
    const { reason = '' } = req.body;
    const target = db.getUserById(targetId);

    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    if (!canActOn(req.user, target)) {
        return res.status(403).json({ error: 'Permission refusée' });
    }

    db.addLog('WARN',
        req.user.username + ' a averti ' + target.username + (reason ? ' - ' + reason : ''),
        req.user.id, targetId);
    try { require('../sanctions-mail').notifierSanction({ cible: target, type: 'warn', raison: reason }); } catch (e) {}
    res.json({ success: true, message: target.username + ' a été averti' });
});

// ---------- Sanctions : kick / ban / mute avec durée au choix ----------
// POST /api/mod/users/:id/sanction { type: 'kick'|'ban'|'mute', minutes: nombre | null (ban définitif), reason }
// POST /api/mod/users/:id/lift     { type }   lever une sanction (ban : Super Admin uniquement)
// GET  /api/mod/users/:id/sanctions             historique
const sanctions = require('../sanctions');
function cibleOk(req, res) {
    const target = db.getUserById(parseInt(req.params.id, 10));
    if (!target) { res.status(404).json({ error: 'Utilisateur introuvable' }); return null; }
    if (!canActOn(req.user, target)) { res.status(403).json({ error: 'Permission refusée' }); return null; }
    return target;
}
function sanctionner(req, res, type, minutes) {
    const target = cibleOk(req, res);
    if (!target) return;
    const r = sanctions.appliquer({ cible: target, auteur: req.user, type, minutes, raison: (req.body || {}).reason });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true, message: r.message, jusqua: r.jusqua, duree: r.duree });
}

router.post('/users/:id/sanction', (req, res) => {
    const { type, minutes } = req.body || {};
    sanctionner(req, res, type, minutes === undefined ? 0 : minutes);
});

router.post('/users/:id/lift', (req, res) => {
    const type = (req.body || {}).type;
    if (type === 'ban' && req.user.role !== 'super_admin') return res.status(403).json({ error: 'Réservé au Super Admin' });
    const target = cibleOk(req, res);
    if (!target) return;
    const r = sanctions.lever({ cible: target, auteur: req.user, type });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true });
});

router.get('/users/:id/sanctions', (req, res) => {
    const target = db.getUserById(parseInt(req.params.id, 10));
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ etat: sanctions.etat(target), historique: sanctions.historique(target.id) });
});

// ---------- Contestations des sanctions ----------
// GET  /api/mod/appeals?status=pending|accepted|rejected
// GET  /api/mod/appeals/count
// POST /api/mod/appeals/:id/decide { decision: 'accepted'|'rejected', note }
const appels = require('../sanctions-mail');
router.get('/appeals/count', (req, res) => res.json({ pending: appels.compterEnAttente() }));
router.get('/appeals', (req, res) => {
    const st = ['pending', 'accepted', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    res.json({ appeals: appels.lister(st) });
});
router.post('/appeals/:id/decide', (req, res) => {
    const { decision, note } = req.body || {};
    const r = appels.decider({ id: parseInt(req.params.id, 10), auteur: req.user, decision, note });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true });
});

// Anciennes routes (gardées pour les pages déjà ouvertes)
router.post('/users/:id/mute', (req, res) => sanctionner(req, res, 'mute', Math.max(1, Math.round((Number((req.body || {}).duration) || 300) / 60))));
router.post('/users/:id/kick', (req, res) => sanctionner(req, res, 'kick', (req.body || {}).minutes || 0));
router.post('/users/:id/ban', (req, res) => {
    const b = req.body || {};
    // Sans durée : définitif pour le Super Admin, 7 jours pour un modérateur
    const minutes = b.minutes !== undefined ? b.minutes : (req.user.role === 'super_admin' ? null : 7 * 1440);
    sanctionner(req, res, 'ban', minutes);
});
router.post('/users/:id/unban', (req, res) => {
    if (req.user.role !== 'super_admin') return res.status(403).json({ error: 'Réservé au Super Admin' });
    const target = db.getUserById(parseInt(req.params.id, 10));
    if (!target) return res.status(404).json({ error: 'Utilisateur introuvable' });
    sanctions.lever({ cible: target, auteur: req.user, type: 'ban' });
    res.json({ success: true });
});

// ============================================================
// SURVEILLANCE LIVE (Modérateurs)
// ============================================================

// GET /api/mod/streams/all - Tous les streams actifs
// (les lives, et aussi les caméras allumées hors live : surveillance équipe)
router.get('/streams/all', (req, res) => {
    try {
        const streams = [];
        if (global.liveStreams) {
            global.liveStreams.forEach((stream, streamId) => {
                if (!stream.isBroadcasting && !stream.isCameraOn) return;
                streams.push({
                    streamId: streamId,
                    broadcasterId: stream.broadcasterId,
                    broadcasterUsername: stream.broadcasterUsername,
                    salon: stream.salon,
                    isCameraOff: stream.isCameraOff,
                    isMicMuted: stream.isMicMuted,
                    isBroadcasting: !!stream.isBroadcasting,
                    moderationOnly: !stream.isBroadcasting,
                    viewers: stream.viewers.length,
                    startedAt: stream.startedAt
                });
            });
        }
        res.json({ streams, total: streams.length });
    } catch (err) {
        console.error('Erreur streams mod:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/mod/streams/:streamId/watch - Regarder une caméra (loggé)
router.post('/streams/:streamId/watch', (req, res) => {
    try {
        const streamId = req.params.streamId;
        const { reason = 'Surveillance de routine' } = req.body;
        const stream = global.liveStreams ? global.liveStreams.get(streamId) : null;

        if (!stream) {
            return res.status(404).json({ error: 'Stream introuvable' });
        }

        // Log de la surveillance (RGPD)
        db.logModerationView(
            req.user.id,
            req.user.username,
            stream.broadcasterId,
            stream.broadcasterUsername,
            streamId,
            'watch',
            reason
        );

        db.addLog('MOD_WATCH',
            req.user.username + ' surveille le live de ' + stream.broadcasterUsername + ' (' + stream.salon + ')',
            req.user.id,
            stream.broadcasterId);

        res.json({
            success: true,
            stream: {
                streamId: streamId,
                broadcasterId: stream.broadcasterId,
                broadcasterUsername: stream.broadcasterUsername,
                salon: stream.salon,
                isCameraOff: stream.isCameraOff,
                isMicMuted: stream.isMicMuted
            }
        });
    } catch (err) {
        console.error('Erreur surveillance:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// POST /api/mod/streams/:streamId/stop - Forcer l'arrêt d'un stream
router.post('/streams/:streamId/stop', (req, res) => {
    try {
        const streamId = req.params.streamId;
        const { reason = 'Violation des CGU' } = req.body;

        const stream = global.liveStreams ? global.liveStreams.get(streamId) : null;
        if (!stream) {
            return res.status(404).json({ error: 'Stream introuvable' });
        }

        // Log
        db.logModerationView(
            req.user.id,
            req.user.username,
            stream.broadcasterId,
            stream.broadcasterUsername,
            streamId,
            'force_stop',
            reason
        );

        db.addLog('MOD_STOP_STREAM',
            req.user.username + ' a forcé l\'arrêt du live de ' + stream.broadcasterUsername + '. Raison: ' + reason,
            req.user.id,
            stream.broadcasterId);

        // Notifier tous les viewers et le broadcaster via socket
        if (global.io) {
            global.io.to('stream:' + streamId).emit('live:force-stopped', {
                reason: reason,
                moderator: req.user.username
            });
        }

        res.json({ success: true, message: 'Stream arrêté' });
    } catch (err) {
        console.error('Erreur stop stream:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// GET /api/mod/view-logs - Historique des surveillances
// 🎁 Offrir des crédits à un membre (modérateurs : plafonds réglés par le Super Admin)
//   GET  /api/mod/rewards/quota     ce qu'il me reste à offrir aujourd'hui
//   POST /api/mod/rewards/offrir    { username, montant, raison }
router.get('/rewards/quota', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const R = require('../recompenses');
    res.json(req.user.role === 'super_admin' ? { illimite: true, parEnvoi: 5000 } : R.quotaModo(req.user.id));
});
router.post('/rewards/offrir', (req, res) => {
    const b = req.body || {};
    const target = db.getUserByUsername(String(b.username || '').trim());
    if (!target) return res.status(404).json({ error: 'Aucun membre avec ce pseudo' });
    const r = require('../recompenses').offrir({ cible: target, auteur: req.user, montant: b.montant, raison: b.raison });
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true, offert: r.offert, solde: r.solde, username: target.username, quota: r.quota });
});

router.get('/view-logs', (req, res) => {
    try {
        const logs = db.getModerationViewLogs(100);
        res.json({ logs });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;