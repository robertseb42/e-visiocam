// ============================================================
// ROUTES PUBLIQUES : contestation d'une sanction (lien personnel reçu par e-mail)
//   GET  /api/appeals/:token   → résumé de la sanction et état de la contestation
//   POST /api/appeals/:token   { message, contact? } → dépôt de la contestation
// Aucune connexion requise : un membre banni ne peut plus se connecter, le lien secret suffit.
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const appels = require('../sanctions-mail');
const router = express.Router();

const limiteur = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { error: 'Trop de tentatives, réessayez plus tard.' } });
router.use(limiteur);

router.get('/:token', (req, res) => {
    const s = appels.sanctionParJeton(req.params.token);
    if (!s) return res.status(404).json({ error: 'Lien de contestation invalide ou expiré' });
    res.set('Cache-Control', 'no-store');
    res.json(appels.resumePublic(s));
});

router.post('/:token', (req, res) => {
    const message = String((req.body || {}).message || '').trim();
    let contact = String((req.body || {}).contact || '').trim().slice(0, 200);
    if (message.length < 20) return res.status(400).json({ error: 'Expliquez votre contestation (20 caractères au moins)' });
    if (message.length > 3000) return res.status(400).json({ error: 'Message trop long (3 000 caractères au plus)' });
    if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return res.status(400).json({ error: 'Adresse e-mail de contact invalide' });
    const r = appels.deposer(req.params.token, message, contact);
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur });
    res.json({ success: true });
});

module.exports = router;
