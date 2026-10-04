// ============================================================
// ROUTES : /api/users (profil de l'utilisateur connecté)
// ============================================================
const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticate } = require('../middleware');
const { hashPassword, verifyPassword, validatePassword, validateEmail } = require('../auth');

// Toutes les routes nécessitent d'être connecté
router.use(authenticate);

// ============================================================
// GET /api/users/me - Récupérer son profil
// ============================================================
router.get('/me', (req, res) => {
    const user = db.getUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
});

// ============================================================
// PUT /api/users/me - Modifier son profil (bio, email, birthdate, gender)
// ============================================================
router.put('/me', (req, res) => {
    const { bio, email, birthdate, gender } = req.body;

    // Valider l'email s'il est fourni
    if (email) {
        const errE = validateEmail(email);
        if (errE) return res.status(400).json({ error: errE });

        const existing = db.getUserByEmail(email);
        if (existing && existing.id !== req.user.id) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }
    }

    // Nettoyer la bio (max 300 caractères)
    const cleanBio = (bio || '').substring(0, 300);

    // Valider le genre
    const validGenders = ['homme', 'femme', 'autre', ''];
    const cleanGender = validGenders.includes(gender) ? (gender || '') : '';

    // ✉️ Nouvelle adresse e-mail : enregistrée seulement après clic sur le lien envoyé à cette adresse
    let message = null;
    const actuel = db.getUserById(req.user.id);
    const nouvelle = email ? String(email).trim().toLowerCase() : null;
    if (nouvelle && actuel && nouvelle !== String(actuel.email || '').toLowerCase()) {
        const verif = require('../email-verif');
        const r = verif.envoyerLien(actuel, 'change', nouvelle);
        if (r.tropTot) return res.status(429).json({ error: 'Un lien vient d\'être envoyé. Patientez 2 minutes avant d\'en demander un autre.' });
        try { db.db.prepare('UPDATE users SET pending_email = ? WHERE id = ?').run(nouvelle, req.user.id); } catch (e) {}
        message = 'Un lien de confirmation a été envoyé à ' + nouvelle + '. Votre adresse sera modifiée après votre clic sur ce lien.';
    }

    db.updateUserProfile(req.user.id, {
        bio: cleanBio,
        birthdate: birthdate || null,
        email: null,          // l'adresse ne change qu'après confirmation (voir ci-dessus)
        gender: cleanGender
    });

    db.addLog('PROFILE_UPDATE',
        `${req.user.username} a mis à jour son profil`,
        req.user.id);

    res.json({
        success: true,
        message,
        user: db.getUserById(req.user.id)
    });
});

// ============================================================
// POST /api/users/me/password - Changer son mot de passe
// ============================================================
router.post('/me/password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ error: 'Tous les champs sont requis' });
        }

        const user = db.getUserByUsername(req.user.username);
        if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

        const valid = await verifyPassword(currentPassword, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
        }

        const errP = validatePassword(newPassword);
        if (errP) return res.status(400).json({ error: errP });

        const newHash = await hashPassword(newPassword);
        db.updatePassword(user.id, newHash);

        db.addLog('PASSWORD_CHANGE',
            `${user.username} a changé son mot de passe`,
            user.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur changement mot de passe:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// DELETE /api/users/me - Supprimer son propre compte
// ============================================================
router.delete('/me', async (req, res) => {
    try {
        const { password } = req.body;

        if (req.user.role === 'super_admin') {
            return res.status(403).json({
                error: 'Un Super Admin ne peut pas supprimer son compte depuis cette page'
            });
        }

        const user = db.getUserByUsername(req.user.username);
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Mot de passe incorrect' });
        }

        db.addLog('DELETE_SELF',
            `${req.user.username} a supprimé son propre compte`,
            req.user.id);

        db.deleteUser(req.user.id);

        res.json({ success: true });
    } catch (err) {
        console.error('Erreur suppression compte:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

module.exports = router;
