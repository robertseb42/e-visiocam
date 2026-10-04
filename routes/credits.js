// ============================================================
// ROUTES : /api/credits
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware');
const mailer = require('../mailer');
const { resolveSalon, canAccessSalon, salonRoom, emitToSalon } = require('../salon-security');

let stripe = null;
if (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY.startsWith('sk_')) {
    try {
        stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        console.log('✅ Stripe initialisé en mode', process.env.STRIPE_SECRET_KEY.startsWith('sk_test_') ? 'TEST' : 'LIVE');
    } catch (e) {
        console.log('⚠️  Erreur Stripe :', e.message);
    }
} else {
    console.log('🎁 Site gratuit : achat de crédits désactivé');
}

const PACKS = {
    'pack-100': { credits: 100, price: 999, bonus: 0, label: '100 crédits' },
    'pack-250': { credits: 250, price: 1999, bonus: 25, label: '250 crédits + 25 offerts' },
    'pack-500': { credits: 500, price: 3499, bonus: 75, label: '500 crédits + 75 offerts' },
    'pack-1000': { credits: 1000, price: 5999, bonus: 200, label: '1000 crédits + 200 offerts' }
};

// GET /balance
router.get('/balance', authenticate, (req, res) => {
    const balance = db.getBalance(req.user.id);
    res.json({
        balance: balance.balance,
        totalPurchased: balance.total_purchased,
        totalSpent: balance.total_spent
    });
});

// GET /transactions
router.get('/transactions', authenticate, (req, res) => {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    // Les anciens achats (simulation, sans paiement) et leur remise à zéro ne sont plus montrés au membre
    const lignes = db.db.prepare("SELECT * FROM credits_transactions WHERE user_id = ? AND type NOT IN ('purchase', 'reset') ORDER BY created_at DESC, id DESC LIMIT ?").all(req.user.id, limit);
    res.json({ transactions: lignes });
});

// ============================================================
// ACHAT DE CRÉDITS : DÉSACTIVÉ — E-VISIOCAM est entièrement gratuit.
// Les crédits ne s'achètent plus : ils se gagnent sur le site (programme de récompenses).
// Le mode « simulation » (qui créditait sans paiement) est supprimé.
// Le jour où un paiement réel sera voulu : PAYMENTS_ENABLED=1 + STRIPE_SECRET_KEY sur Render.
// ============================================================
const PAIEMENTS = () => process.env.PAYMENTS_ENABLED === '1' && !!stripe;
const GRATUIT = { error: 'E-VISIOCAM est entièrement gratuit : les crédits ne s\'achètent pas, ils se gagnent sur le site.', gratuit: true };

// GET /packs
router.get('/packs', (req, res) => {
    if (!PAIEMENTS()) return res.json({ packs: [], gratuit: true, stripeEnabled: false });
    const packs = Object.entries(PACKS).map(([id, pack]) => ({
        id,
        credits: pack.credits,
        bonus: pack.bonus,
        total: pack.credits + pack.bonus,
        price: pack.price,
        priceEuro: (pack.price / 100).toFixed(2),
        label: pack.label
    }));
    res.json({ packs, gratuit: false, stripeEnabled: true });
});

// POST /checkout
router.post('/checkout', authenticate, async (req, res) => {
    if (!PAIEMENTS()) return res.status(410).json(GRATUIT);
    try {
        const { packId } = req.body;
        const pack = PACKS[packId];
        if (!pack) return res.status(400).json({ error: 'Pack invalide' });
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: { name: pack.label, description: 'Recharge de ' + (pack.credits + pack.bonus) + ' crédits' },
                    unit_amount: pack.price
                },
                quantity: 1
            }],
            mode: 'payment',
            success_url: req.protocol + '://' + req.get('host') + '/credits.html?success=1&session_id={CHECKOUT_SESSION_ID}',
            cancel_url: req.protocol + '://' + req.get('host') + '/credits.html?cancelled=1',
            client_reference_id: req.user.id.toString(),
            metadata: { userId: req.user.id.toString(), packId: packId, credits: (pack.credits + pack.bonus).toString() }
        });
        res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
        console.error('Erreur checkout:', err);
        res.status(500).json({ error: 'Erreur lors de la création du paiement' });
    }
});

// POST /confirm
router.post('/confirm', authenticate, async (req, res) => {
    if (!PAIEMENTS()) return res.status(410).json(GRATUIT);
    try {
        const { sessionId } = req.body;
        if (!sessionId) return res.status(400).json({ error: 'Paramètres manquants' });
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.payment_status !== 'paid') return res.status(400).json({ error: 'Paiement non complété' });
        if (session.client_reference_id !== String(req.user.id)) return res.status(403).json({ error: 'Paiement d\'un autre compte' });
        const existing = db.db.prepare('SELECT id FROM credits_transactions WHERE stripe_session_id = ?').get(sessionId);
        if (existing) return res.json({ success: true, alreadyProcessed: true });
        const credits = parseInt(session.metadata.credits) || 0;
        db.addCredits(req.user.id, credits, 'purchase', 'Achat via Stripe', sessionId, { packId: session.metadata.packId });
        db.addLog('CREDITS_PURCHASE', req.user.username + ' a acheté ' + credits + ' crédits via Stripe', req.user.id);
        const user = db.getUserById(req.user.id);
        if (user && user.email) {
            const amount = session.amount_total ? (session.amount_total / 100).toFixed(2) + ' €' : '';
            mailer.sendCreditsPurchaseEmail(user, credits, amount).catch(console.error);
        }
        res.json({ success: true, credits });
    } catch (err) {
        console.error('Erreur confirmation:', err);
        res.status(500).json({ error: 'Erreur de confirmation' });
    }
});

// POST /spend
router.post('/spend', authenticate, (req, res) => {
    try {
        const { amount, description } = req.body;
        const spendAmount = Math.abs(parseInt(amount));
        if (!spendAmount || spendAmount <= 0) return res.status(400).json({ error: 'Montant invalide' });

        const balance = db.getBalance(req.user.id);
        if (balance.balance < spendAmount) return res.status(400).json({ error: 'Crédits insuffisants' });

        const newBalance = db.addCredits(req.user.id, -spendAmount, 'spend', description || 'Dépense', null, null);
        res.json({ success: true, balance: newBalance.balance });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// CADEAUX
// ============================================================
router.get('/gifts', (req, res) => {
    try { res.json({ gifts: db.getGifts() }); }
    catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/gifts/send', authenticate, (req, res) => {
    try {
        const { giftId, receiverUsername, salon = 'general', message = '' } = req.body || {};
        if (!Number.isSafeInteger(giftId) || giftId <= 0 || typeof message !== 'string' || message.length > 500 ||
            (receiverUsername != null && (typeof receiverUsername !== 'string' || receiverUsername.length > 20))) {
            return res.status(400).json({ error: 'Cadeau ou message invalide' });
        }
        const row = resolveSalon(salon);
        if (!row || !canAccessSalon(req.user, row.slug)) return res.status(403).json({ error: 'Accès au salon refusé' });
        const room = salonRoom(row.slug);
        const present = global.io && [...global.io.sockets.sockets.values()].some(s => s.user?.id === req.user.id && s.rooms.has(room));
        if (!present) return res.status(403).json({ error: 'Rejoignez le salon avant d’envoyer un cadeau' });
        const gift = db.getGiftById(giftId);
        if (!gift || !gift.active || !Number.isSafeInteger(gift.price) || gift.price <= 0) {
            return res.status(404).json({ error: 'Cadeau introuvable' });
        }
        let receiverId = null;
        let receiverUser = null;
        if (receiverUsername) {
            receiverUser = db.getUserByUsername(receiverUsername);
            if (!receiverUser || receiverUser.status === 'banned') return res.status(404).json({ error: 'Destinataire introuvable' });
            receiverId = receiverUser.id;
        }
        // Journal, solde et cadeau : tout est validé ou tout est annulé.
        const result = db.db.transaction(() => {
            const balance = db.getBalance(req.user.id);
            if (balance.balance < gift.price) return null;
            const updated = db.addCredits(req.user.id, -gift.price, 'spend',
                'Cadeau envoyé : ' + gift.name, null, { giftId, receiverId });
            const giftSentId = db.sendGift(req.user.id, receiverId, giftId, row.name, message);
            db.addLog('GIFT_SENT', req.user.username + ' a envoyé ' + gift.name, req.user.id, receiverId);
            return { giftSentId, newBalance: updated.balance };
        })();
        if (!result) return res.status(400).json({ error: 'Crédits insuffisants.' });
        const { giftSentId, newBalance } = result;
        try { require('../recompenses').activite(req.user.id); } catch (e) {}
        emitToSalon(global.io, row.slug, 'gift', {
            giftSentId, username: req.user.username, gift: gift.emoji, giftName: gift.name,
            color: gift.color, receiver: receiverUser ? receiverUser.username : null, message
        });

        if (receiverUser && receiverUser.email) {
            mailer.sendGiftNotificationEmail(
                receiverUser,
                { name: gift.name, emoji: gift.emoji, price: gift.price },
                req.user.username,
                message
            ).catch(console.error);
        }

        res.json({
            success: true,
            gift: { id: gift.id, name: gift.name, emoji: gift.emoji, color: gift.color, price: gift.price },
            newBalance,
            giftSentId
        });
    } catch (err) {
        console.error('Erreur envoi cadeau:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

router.get('/gifts/recent', (req, res) => {
    try { res.json({ gifts: db.getRecentGifts(20) }); }
    catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
module.exports.PACKS = PACKS;   // utilisé par les statistiques (prix des packs)
