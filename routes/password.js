// ============================================================
// ROUTES : /api/auth (mot de passe oublié / reset)
// ============================================================
const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const db = require('../database');
const mailer = require('../mailer');
const { authenticate } = require('../middleware');
const { generateToken } = require('../auth');

// Règles communes aux nouveaux mots de passe
function validerMotDePasse(mdp) {
    if (!mdp || mdp.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
    if (!/[A-Z]/.test(mdp)) return 'Le mot de passe doit contenir au moins une majuscule';
    if (!/[0-9]/.test(mdp)) return 'Le mot de passe doit contenir au moins un chiffre';
    return null;
}

// Rate limit : 3 demandes par heure
const forgotLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Trop de demandes. Réessayez dans 1 heure.' }
});

// ============================================================
// POST /api/auth/forgot-password
// ============================================================
router.post('/forgot-password', forgotLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email requis' });
        }

        const user = db.getUserByEmail(email.toLowerCase().trim());

        // Sécurité : réponse identique même si l'email n'existe pas
        if (!user || user.status === 'banned') {
            return res.json({
                success: true,
                message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'
            });
        }

        // Générer un token unique et sécurisé
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

        // Sauvegarder en base
        db.createPasswordReset(user.id, token, expiresAt);

        // Envoyer l'email
        await mailer.sendPasswordResetEmail(user, token).catch(err => {
            console.error('Erreur envoi email reset:', err.message);
        });

        db.addLog('PASSWORD_RESET_REQUESTED',
            user.username + ' a demandé une réinitialisation de mot de passe',
            user.id);

        res.json({
            success: true,
            message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé.'
        });
    } catch (err) {
        console.error('Erreur forgot-password:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// POST /api/auth/reset-password
// ============================================================
router.post('/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
        }
        if (!/[A-Z]/.test(newPassword)) {
            return res.status(400).json({ error: 'Le mot de passe doit contenir au moins une majuscule' });
        }
        if (!/[0-9]/.test(newPassword)) {
            return res.status(400).json({ error: 'Le mot de passe doit contenir au moins un chiffre' });
        }

        const resetRequest = db.getPasswordReset(token);
        if (!resetRequest) {
            return res.status(400).json({ error: 'Lien invalide ou expiré. Refaites la demande.' });
        }

        const user = db.getUserById(resetRequest.user_id);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur introuvable' });
        }

        const newHash = await bcrypt.hash(newPassword, 12);
        db.updatePassword(user.id, newHash);
        db.usePasswordReset(token);

        db.addLog('PASSWORD_RESET',
            user.username + ' a réinitialisé son mot de passe',
            user.id);

        res.json({
            success: true,
            message: 'Mot de passe modifié avec succès.'
        });
    } catch (err) {
        console.error('Erreur reset-password:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// GET /api/auth/verify-reset-token/:token
// ============================================================
router.get('/verify-reset-token/:token', (req, res) => {
    try {
        const resetRequest = db.getPasswordReset(req.params.token);
        res.json({ valid: !!resetRequest });
    } catch (err) {
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// POST /api/auth/change-password   (connecté)
// Utilisé après une réinitialisation par un administrateur :
// le membre choisit son nouveau mot de passe, l'obligation est levée.
// ============================================================
router.post('/change-password', authenticate, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body || {};

        const erreur = validerMotDePasse(newPassword);
        if (erreur) return res.status(400).json({ error: erreur });

        const complet = db.getUserByUsername(req.user.username);
        if (!complet) return res.status(401).json({ error: 'Compte introuvable' });
        // Après une réinitialisation par l'admin, le membre vient de se connecter avec le mot de passe
        // temporaire : on ne le lui redemande pas. Sinon, l'ancien mot de passe est obligatoire.
        const obligatoire = Number(complet.must_change_password) === 1;
        if (!obligatoire && !currentPassword) {
            return res.status(400).json({ error: 'Mot de passe actuel requis' });
        }
        if (currentPassword) {
            const ok = await bcrypt.compare(currentPassword, complet.password_hash);
            if (!ok) return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }
        // Le mot de passe temporaire est connu de l'administrateur : il ne peut pas être conservé.
        if (obligatoire && await bcrypt.compare(newPassword, complet.password_hash)) {
            return res.status(400).json({ error: 'Choisissez un mot de passe différent du mot de passe temporaire' });
        }

        const hash = await bcrypt.hash(newPassword, 12);
        db.setPasswordState(req.user.id, hash, 0);

        db.addLog('PASSWORD_CHANGED', req.user.username + ' a choisi un nouveau mot de passe', req.user.id);

        // Nouveau jeton : la session en cours reste valable après le changement
        const frais = db.getUserById(req.user.id);
        // Nouveau jeton (le mot de passe vient de changer) : déposé dans le cookie de session
        if (frais) require('../session').poserSession(res, generateToken(frais));
        res.json({ success: true });
    } catch (err) {
        console.error('Erreur change-password:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;