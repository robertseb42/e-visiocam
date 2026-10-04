// ============================================================
// ROUTES : /api/rewards — programme de récompenses (site gratuit)
//   GET /api/rewards/me          mon tableau : gains du jour, série, niveau, badges, parrainage
//   GET /api/rewards/classement  classements du mois (modèles les plus gâtés, membres les plus actifs)
// ============================================================
const express = require('express');
const db = require('../database');
const { authenticate } = require('../middleware');
const recompenses = require('../recompenses');
const router = express.Router();

router.get('/me', authenticate, (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(Object.assign(recompenses.resumeMembre(req.user.id), { solde: db.getBalance(req.user.id).balance }));
});

router.get('/classement', (req, res) => {
    const mois = recompenses.jourParis().slice(0, 7);
    const debut = mois + '-01';
    const modeles = db.db.prepare(`SELECT u.username, SUM(c.price) AS credits, COUNT(*) AS cadeaux
        FROM gifts_sent g JOIN gifts_catalog c ON c.id = g.gift_id JOIN users u ON u.id = g.receiver_id
        WHERE u.role = 'model' AND u.status = 'active' AND g.created_at >= ? GROUP BY u.id ORDER BY credits DESC LIMIT 10`).all(debut);
    const membres = db.db.prepare(`SELECT u.username, SUM(r.amount) AS credits FROM reward_counters r JOIN users u ON u.id = r.user_id
        WHERE r.day >= ? AND r.action IN ('quotidien', 'actif', 'live') AND u.status = 'active' GROUP BY u.id ORDER BY credits DESC LIMIT 10`).all(debut);
    res.set('Cache-Control', 'no-cache');
    res.json({ mois, modeles, membres });
});

module.exports = router;
