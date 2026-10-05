// ============================================================
// MIDDLEWARES - Permissions & authentification
// ============================================================
const { verifyToken } = require('./auth');
const db = require('./database');
const { tokenFrom } = require('./session');

// ---------- HIÉRARCHIE DES RÔLES ----------
const ROLE_LEVELS = {
    'super_admin': 100,
    'moderator': 50,
    'model': 20,
    'user': 10
};

// ---------- PERMISSIONS ----------
const PERMISSIONS = {
    'super_admin': [
        'view_all_cams', 'view_offline_cams', 'access_any_salon',
        'kick_user', 'ban_user', 'unban_user', 'mute_user',
        'delete_message', 'promote_moderator', 'revoke_moderator',
        'promote_admin', 'revoke_admin', 'delete_account',
        'view_reports', 'manage_reports', 'view_logs',
        'manage_payments', 'manage_credits', 'broadcast_global',
        'shutdown_site', 'access_admin_panel', 'access_mod_panel'
    ],
    'moderator': [
        'view_all_cams', 'view_offline_cams', 'access_any_salon',
        'kick_user', 'mute_user', 'delete_message',
        'view_reports', 'manage_reports', 'access_mod_panel'
    ],
    'model': ['broadcast_cam', 'manage_own_salon', 'view_own_stats'],
    'user': ['view_public_cams', 'chat_public']
};

// ============================================================
// AUTHENTIFICATION
// ============================================================
function authenticate(req, res, next) {
    // Jeton : cookie de session HttpOnly (ou en-tête Authorization, pour la transition)
    const token = tokenFrom(req);
    if (!token) {
        return res.status(401).json({ error: 'Token manquant' });
    }

    // Vérifier si le token a été révoqué
    if (db.isTokenRevoked(token)) {
        return res.status(401).json({ error: 'Token révoqué' });
    }

    const payload = verifyToken(token);
    if (!payload) {
        return res.status(401).json({ error: 'Token invalide ou expiré' });
    }

    // Récupérer l'utilisateur en base (au cas où il aurait été supprimé/banni)
    const user = db.getUserById(payload.id);
    if (!user) {
        return res.status(401).json({ error: 'Utilisateur introuvable' });
    }
    // Bannissement (définitif ou temporaire) ou exclusion en cours ; une sanction expirée est levée ici
    const sanction = require('./sanctions').etat(user);
    if (sanction.bloque) {
        return res.status(403).json({ error: require('./sanctions').message(sanction), sanction: sanction.type, jusqua: sanction.jusqua });
    }
    if (user.status === 'banned') user.status = 'active';

    // Un mot de passe a été réinitialisé par un administrateur : les sessions
    // ouvertes avant doivent se reconnecter avec le nouveau mot de passe.
    if (typeof db.isTokenOutdated === 'function' && db.isTokenOutdated(user, payload.iat)) {
        return res.status(401).json({ error: 'Mot de passe réinitialisé : reconnectez-vous' });
    }

    req.user = user;
    req.token = token;
    // Présence : toute page ouverte interroge l'API au moins toutes les 30 s (compteur de messages),
    // donc « vu il y a moins de 2 minutes » = connecté, même sans connexion temps réel sur la page
    try { (global.evcDerniereVue || (global.evcDerniereVue = new Map())).set(user.id, Date.now()); } catch (e) {}
    next();
}

// ============================================================
// AUTHENTIFICATION FACULTATIVE (pages publiques : liste des salons)
// Si un jeton valide est fourni, req.user est renseigné — sinon on continue.
// ============================================================
function optionalAuthenticate(req, res, next) {
    const token = tokenFrom(req);
    if (!token) return next();
    try {
        if (db.isTokenRevoked(token)) return next();
        const payload = verifyToken(token);
        if (!payload) return next();
        const user = db.getUserById(payload.id);
        if (user && !require('./sanctions').etat(user).bloque) { if (user.status === 'banned') user.status = 'active'; req.user = user;
            try { (global.evcDerniereVue || (global.evcDerniereVue = new Map())).set(user.id, Date.now()); } catch (e) {} }
    } catch (e) {}
    next();
}

// ============================================================
// VÉRIFICATION DE RÔLE
// ============================================================
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Accès refusé' });
        }
        next();
    };
}

// ============================================================
// VÉRIFICATION DE PERMISSION
// ============================================================
function requirePermission(...permissions) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Non authentifié' });
        }
        const userPerms = PERMISSIONS[req.user.role] || [];
        const hasAll = permissions.every(p => userPerms.includes(p));
        if (!hasAll) {
            return res.status(403).json({ error: 'Permission refusée' });
        }
        next();
    };
}

// ============================================================
// VÉRIF : PEUT-ON AGIR SUR CET UTILISATEUR ?
// ============================================================
function canActOn(actor, target) {
    if (!actor || !target) return false;
    if (actor.id === target.id) return false; // On ne s'auto-modère pas
    return ROLE_LEVELS[actor.role] > ROLE_LEVELS[target.role];
}

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireRole,
    requirePermission,
    canActOn,
    ROLE_LEVELS,
    PERMISSIONS
};