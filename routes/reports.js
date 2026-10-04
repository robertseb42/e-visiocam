// ============================================================
// ROUTES : /api/reports (signalement par les utilisateurs)
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware');

// ============================================================
// POST /api/reports - Créer un signalement
// ============================================================
router.post('/', authenticate, (req, res) => {
    try {
        const { targetType, targetId, targetUsername, reason, description } = req.body;

        if (!targetType || !reason) {
            return res.status(400).json({ error: 'Champs obligatoires manquants' });
        }

        // Calculer la priorité selon la raison
        const priorities = {
            'contenu_illegal': 5,
            'mineur': 5,
            'violence': 4,
            'harcelement': 4,
            'contenu_sexuel_non_consenti': 4,
            'spam': 2,
            'comportement': 2,
            'autre': 1
        };
        const priority = priorities[reason] || 1;

        // Résoudre l'ID cible si on a un username
        let resolvedTargetId = targetId || null;
        if (!resolvedTargetId && targetUsername) {
            const targetUser = db.getUserByUsername(targetUsername);
            if (targetUser) {
                resolvedTargetId = targetUser.id;
            } else {
                return res.status(404).json({ error: 'Utilisateur introuvable' });
            }
        }

        // Interdire de se signaler soi-même
        if (resolvedTargetId === req.user.id) {
            return res.status(400).json({ error: 'Impossible de se signaler soi-même' });
        }

        const result = db.createModerationReport(
            req.user.id,
            targetType,
            resolvedTargetId,
            targetUsername || null,
            reason,
            description,
            priority
        );

        db.addLog('REPORT_CREATED',
            `${req.user.username} a signalé ${targetUsername || targetType + '#' + resolvedTargetId} (${reason})`,
            req.user.id, resolvedTargetId);

        // Vérifier le seuil de ban automatique
        if (targetType === 'user' && resolvedTargetId) {
            const reportCount = db.countReportsAgainstUser(resolvedTargetId, 7);
            if (reportCount >= 5) {
                const target = db.getUserById(resolvedTargetId);
                if (target && target.role !== 'super_admin' && target.role !== 'moderator') {
                    // Suspension automatique de 3 jours (pas définitive : la modération vérifie les signalements)
                    require('../sanctions').appliquer({ cible: target, auteur: null, type: 'ban', minutes: 3 * 1440,
                        raison: reportCount + ' signalements en 7 jours (suspension automatique)' });
                    db.addLog('AUTO_BAN',
                        `${target.username} suspendu 3 jours automatiquement (${reportCount} signalements en 7 jours)`,
                        null, resolvedTargetId);
                    console.log(`🚫 AUTO-BAN : ${target.username} (${reportCount} signalements)`);
                }
            }
        }

        res.json({
            success: true,
            reportId: result.lastInsertRowid,
            message: 'Signalement envoyé. Notre équipe va examiner votre demande.'
        });
    } catch (err) {
        console.error('Erreur signalement:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/reports/my - Mes signalements
// ============================================================
router.get('/my', authenticate, (req, res) => {
    try {
        const reports = db.db.prepare(`
            SELECT * FROM moderation_reports
            WHERE reporter_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `).all(req.user.id);

        res.json({ reports });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;