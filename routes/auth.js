// ============================================================
// ROUTES : /api/auth
// ============================================================
const express = require('express');
const rateLimit = require('express-rate-limit');
const maintenance = require('../maintenance');
const router = express.Router();
const { poserSession, effacerSession } = require('../session');
const db = require('../database');
const {
    hashPassword,
    verifyPassword,
    generateToken,
    validateUsername,
    validateEmail,
    validatePassword
} = require('../auth');
const { authenticate, optionalAuthenticate } = require('../middleware');
const verif = require('../email-verif');

// ---------- RATE LIMITING (anti brute-force) ----------
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 10,                   // 10 tentatives max
    message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { error: 'Trop d\'inscriptions. Réessayez plus tard.' }
});

const verifLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }
});

// ============================================================
// POST /api/auth/verify-email { token } → confirme l'adresse (lien reçu par e-mail)
// ============================================================
router.post('/verify-email', verifLimiter, (req, res) => {
    const r = verif.confirmer((req.body || {}).token);
    if (r.erreur) return res.status(r.code || 400).json({ error: r.erreur, expire: !!r.expire });
    res.json({ success: true, username: r.username, purpose: r.purpose, deja: !!r.deja });
});

// ============================================================
// POST /api/auth/resend-verification { login } → renvoie le lien (réponse identique dans tous les cas)
// ============================================================
router.post('/resend-verification', verifLimiter, (req, res) => {
    const login = String((req.body || {}).login || '').trim();
    const generique = { success: true, message: 'Si un compte non confirmé correspond, un nouveau lien vient d\'être envoyé. Pensez à vérifier vos courriers indésirables.' };
    if (!login) return res.status(400).json({ error: 'Indiquez votre pseudo ou votre adresse e-mail' });
    const user = db.getUserByUsername(login) || db.getUserByEmail(login.toLowerCase());
    if (!user || verif.estConfirme(user)) return res.json(generique);
    const r = verif.envoyerLien(user, 'signup');
    if (r.tropTot) return res.status(429).json({ error: 'Un lien vient d\'être envoyé. Patientez 2 minutes avant d\'en demander un autre.' });
    res.json(generique);
});

// ============================================================
// POST /api/auth/register
// ============================================================
router.post('/register', registerLimiter, async (req, res) => {
    try {
        const { username, email, password, parrain } = req.body;

        // Validations
        const errU = validateUsername(username);
        if (errU) return res.status(400).json({ error: errU });

        const errE = validateEmail(email);
        if (errE) return res.status(400).json({ error: errE });

        const errP = validatePassword(password);
        if (errP) return res.status(400).json({ error: errP });

        // Comptes jamais confirmés depuis plus de 7 jours : supprimés (pseudo et e-mail libérés)
        verif.purger();

        // Vérifier unicité
        if (db.getUserByUsername(username)) {
            return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
        }
        if (db.getUserByEmail(email)) {
            return res.status(409).json({ error: 'Cet email est déjà utilisé' });
        }

        // Créer l'utilisateur
        const hash = await hashPassword(password);
        const userId = db.createUser(username, email, hash, 'user');

        db.addLog('REGISTER', `Nouvel utilisateur : ${username} (adresse à confirmer)`, userId);

        // 🤝 Parrainage : le pseudo du parrain vient du lien d'invitation (register.html?parrain=…)
        try { require('../recompenses').enregistrerParrain(userId, parrain, req.ip); } catch (e) {}
        const user = db.getUserById(userId);
        if (!verif.ACTIVE()) {   // confirmation désactivée (EMAIL_VERIFICATION=0) : connexion directe
            require('../mailer').sendWelcomeEmail({ username, email }).catch(console.error);
            poserSession(res, generateToken(user));
            return res.status(201).json({ user });
        }
        // ✉️ Compte à activer : lien de confirmation envoyé par e-mail (le mail de bienvenue suit la confirmation)
        verif.marquerNonConfirme(userId);
        verif.envoyerLien(user, 'signup');

        res.status(201).json({ needVerification: true, email: verif.masquer(email), user: { username: user.username } });
    } catch (err) {
        console.error('Erreur inscription:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// ============================================================
// POST /api/auth/login
// ============================================================
router.post('/login', loginLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Veuillez remplir tous les champs' });
        }

        // Chercher par username OU par email
        let user = db.getUserByUsername(username);
        if (!user) {
            user = db.getUserByEmail(username);
        }

        // ❌ Compte inexistant
        if (!user) {
            return res.status(404).json({
                error: 'Aucun compte trouvé avec ce pseudo ou cet email'
            });
        }

        // ❌ Compte banni (définitif ou temporaire) ou exclu pour un temps
        const sanction = require('../sanctions').etat(user);
        if (sanction.bloque) {
            return res.status(403).json({ error: require('../sanctions').message(sanction), sanction: sanction.type, jusqua: sanction.jusqua });
        }
        if (user.status === 'banned') user.status = 'active';   // bannissement temporaire expiré

        // ❌ Mot de passe incorrect
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({
                error: 'Mot de passe incorrect'
            });
        }

        // ✉️ Adresse e-mail pas encore confirmée
        if (!verif.estConfirme(user)) {
            return res.status(403).json({
                error: 'Confirmez d\'abord votre adresse e-mail : cliquez sur le lien reçu à ' + verif.masquer(user.email) + '.',
                needVerification: true, email: verif.masquer(user.email)
            });
        }

        // 🛠️ Maintenance : seul le super admin peut se connecter
        if (maintenance.blocksLogin(user)) {
            const m = maintenance.get();
            return res.status(503).json({ error: m.message, maintenance: true, message: m.message, since: m.since });
        }

        // ✅ Connexion réussie
        db.updateLastLogin(user.id);
        try { require('../stats').noterPresence(user.id); } catch (e) {}
        try { require('../recompenses').connexion(user.id, req.ip); } catch (e) {}
        db.addLog('LOGIN', user.username + ' s\'est connecté', user.id);

        const token = generateToken(user);
        const { password_hash, ...safeUser } = user;

        poserSession(res, token);
        res.json({ user: safeUser });
    } catch (err) {
        console.error('Erreur connexion:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});
// ============================================================
// POST /api/auth/logout
// ============================================================
// Toujours efface le cookie, même si la session a déjà expiré
router.post('/logout', optionalAuthenticate, (req, res) => {
    const token = require('../session').tokenFrom(req);
    if (token && req.user) {
        try { db.revokeToken(token); } catch (e) {}
        db.addLog('LOGOUT', `${req.user.username} s'est déconnecté`, req.user.id);
    }
    effacerSession(res);
    res.json({ success: true });
});

// ============================================================
// GET /api/auth/me
// ============================================================
router.get('/me', authenticate, (req, res) => {
    res.json({ user: req.user });
});

// NB : le changement de mot de passe (dont celui imposé après une réinitialisation par l'admin)
// est géré par routes/password.js : POST /api/auth/change-password.

module.exports = router;