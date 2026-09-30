// ============================================================
// E-VISIOCAM - SYSTÈME D'AUTHENTIFICATION ET DE RÔLES
// ============================================================

// ---------- DÉFINITION DES RÔLES ----------
const ROLES = {
    SUPER_ADMIN: 'super_admin',   // 👑 Pouvoir absolu
    MODERATOR: 'moderator',       // 🔵 Modérateur
    MODEL: 'model',               // 🟢 Modèle
    USER: 'user'                  // ⚪ Utilisateur
};

// ---------- HIÉRARCHIE (niveau de pouvoir) ----------
const ROLE_LEVELS = {
    [ROLES.SUPER_ADMIN]: 100,
    [ROLES.MODERATOR]: 50,
    [ROLES.MODEL]: 20,
    [ROLES.USER]: 10
};

// ---------- PERMISSIONS PAR RÔLE ----------
const PERMISSIONS = {
    [ROLES.SUPER_ADMIN]: [
        'view_all_cams',           // Voir toutes les caméras
        'view_offline_cams',       // Voir les cams éteintes
        'access_any_salon',        // Accéder à tous les salons
        'kick_user',               // Expulser un utilisateur
        'ban_user',                // Bannir définitivement
        'unban_user',              // Débannir
        'mute_user',               // Rendre muet
        'delete_message',          // Supprimer message
        'promote_moderator',       // Nommer modérateur
        'revoke_moderator',        // Révoquer modérateur
        'promote_admin',           // Nommer admin
        'revoke_admin',            // Révoquer admin
        'delete_account',          // Supprimer un compte
        'view_reports',            // Voir les signalements
        'manage_reports',          // Traiter les signalements
        'view_logs',               // Voir les logs
        'manage_payments',         // Gérer les paiements
        'manage_credits',          // Gérer les crédits
        'broadcast_global',        // Message global
        'shutdown_site',           // Couper le site
        'access_admin_panel',      // Accès panneau admin
        'access_mod_panel'         // Accès panneau modérateur
    ],
    [ROLES.MODERATOR]: [
        'view_all_cams',
        'view_offline_cams',       // ← Accès cams éteintes (comme demandé)
        'access_any_salon',
        'kick_user',
        'mute_user',
        'delete_message',
        'view_reports',
        'manage_reports',
        'access_mod_panel'
    ],
    [ROLES.MODEL]: [
        'broadcast_cam',
        'manage_own_salon',
        'view_own_stats'
    ],
    [ROLES.USER]: [
        'view_public_cams',
        'chat_public'
    ]
};

// ---------- UTILISATEUR CONNECTÉ (simulation) ----------
// En vrai, ceci vient d'une API backend
let currentUser = {
    id: null,
    username: 'Invité',
    role: ROLES.USER,
    isLoggedIn: false
};

// ---------- LISTE DES UTILISATEURS (simulation) ----------
// En vrai, ceci vient d'une base de données
let allUsers = [
    { id: 1, username: 'SuperBoss', role: ROLES.SUPER_ADMIN, status: 'active', joined: '2024-01-01' },
    { id: 2, username: 'ModSarah',  role: ROLES.MODERATOR,   status: 'active', joined: '2024-03-15' },
    { id: 3, username: 'ModDavid',  role: ROLES.MODERATOR,   status: 'active', joined: '2024-05-20' },
    { id: 4, username: 'Luna',      role: ROLES.MODEL,       status: 'active', joined: '2024-02-10' },
    { id: 5, username: 'Chloé',     role: ROLES.MODEL,       status: 'active', joined: '2024-04-05' },
    { id: 6, username: 'Pseudo123', role: ROLES.USER,        status: 'active', joined: '2024-06-01' },
    { id: 7, username: 'TrollMan',  role: ROLES.USER,        status: 'banned', joined: '2024-06-10' },
];

// ============================================================
// FONCTIONS DE PERMISSIONS
// ============================================================

/**
 * Vérifie si l'utilisateur a une permission donnée
 */
function can(permission) {
    if (!currentUser.isLoggedIn) return false;
    const perms = PERMISSIONS[currentUser.role] || [];
    return perms.includes(permission);
}

/**
 * Vérifie si l'utilisateur a AU MOINS une des permissions
 */
function canAny(...permissions) {
    return permissions.some(p => can(p));
}

/**
 * Vérifie si l'utilisateur a TOUTES les permissions
 */
function canAll(...permissions) {
    return permissions.every(p => can(p));
}

/**
 * Vérifie si user1 est supérieur à user2 (niveau de rôle)
 */
function isHigherThan(role1, role2) {
    return ROLE_LEVELS[role1] > ROLE_LEVELS[role2];
}

/**
 * Vérifie si l'utilisateur courant peut agir sur un autre utilisateur
 */
function canActOn(targetUser) {
    if (!currentUser.isLoggedIn) return false;
    // On ne peut agir que sur quelqu'un de STRICTEMENT inférieur
    return isHigherThan(currentUser.role, targetUser.role);
}

// ============================================================
// CONNEXION / DÉCONNEXION
// ============================================================

/**
 * Simule une connexion (à remplacer par un vrai appel API)
 */
function login(username, password) {
    // ⚠️ SIMULATION - À REMPLACER PAR UN APPEL API SÉCURISÉ
    const user = allUsers.find(u => u.username === username);
    if (!user) {
        return { success: false, error: 'Utilisateur introuvable' };
    }
    if (user.status === 'banned') {
        return { success: false, error: 'Compte banni' };
    }

    currentUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        isLoggedIn: true
    };
    saveSession();
    return { success: true, user: currentUser };
}

/**
 * Déconnexion
 */
function logout() {
    currentUser = { id: null, username: 'Invité', role: ROLES.USER, isLoggedIn: false };
    localStorage.removeItem('evisiocam_session');
    showToast('Déconnecté');
    setTimeout(() => window.location.href = 'index.html', 800);
}

/**
 * Sauvegarde la session (⚠️ pour la démo uniquement, en vrai = cookie HttpOnly)
 */
function saveSession() {
    localStorage.setItem('evisiocam_session', JSON.stringify(currentUser));
}

/**
 * Restaure la session au chargement
 */
function restoreSession() {
    const saved = localStorage.getItem('evisiocam_session');
    if (saved) {
        try {
            currentUser = JSON.parse(saved);
        } catch (e) {
            console.error('Session invalide');
        }
    }
}

// ============================================================
// ACTIONS DE MODÉRATION
// ============================================================

/**
 * Expulser un utilisateur d'un salon
 */
function kickUser(userId, reason = '') {
    if (!can('kick_user')) {
        showToast('❌ Permission refusée', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    if (!canActOn(user)) {
        showToast('❌ Impossible d\'expulser un utilisateur de rang supérieur ou égal', 'error');
        return false;
    }

    addLog('KICK', `${currentUser.username} a expulsé ${user.username}. Raison: ${reason || 'non spécifiée'}`);
    showToast(`✅ ${user.username} a été expulsé`);
    return true;
}

/**
 * Bannir un utilisateur
 */
function banUser(userId, reason = '') {
    if (!can('ban_user')) {
        showToast('❌ Permission refusée', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    if (!canActOn(user)) {
        showToast('❌ Impossible de bannir un utilisateur de rang supérieur ou égal', 'error');
        return false;
    }

    user.status = 'banned';
    addLog('BAN', `${currentUser.username} a banni ${user.username}. Raison: ${reason || 'non spécifiée'}`);
    showToast(`🔨 ${user.username} a été banni définitivement`, 'warning');
    return true;
}

/**
 * Débannir un utilisateur
 */
function unbanUser(userId) {
    if (!can('unban_user')) return false;
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    user.status = 'active';
    addLog('UNBAN', `${currentUser.username} a débanni ${user.username}`);
    showToast(`✅ ${user.username} a été débanni`);
    return true;
}

/**
 * Rendre muet
 */
function muteUser(userId, duration = 60) {
    if (!can('mute_user')) {
        showToast('❌ Permission refusée', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    if (!canActOn(user)) {
        showToast('❌ Impossible de muter un utilisateur de rang supérieur ou égal', 'error');
        return false;
    }
    addLog('MUTE', `${currentUser.username} a rendu muet ${user.username} (${duration}s)`);
    showToast(`🔇 ${user.username} est muet pendant ${duration}s`);
    return true;
}

// ============================================================
// GESTION DES RÔLES (SUPER ADMIN UNIQUEMENT)
// ============================================================

/**
 * Nommer un utilisateur modérateur
 */
function promoteToModerator(userId) {
    if (!can('promote_moderator')) {
        showToast('❌ Seul un super admin peut nommer un modérateur', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    if (user.role === ROLES.SUPER_ADMIN) {
        showToast('❌ Impossible de modifier un super admin', 'error');
        return false;
    }

    user.role = ROLES.MODERATOR;
    addLog('PROMOTE_MOD', `${currentUser.username} a nommé ${user.username} modérateur`);
    showToast(`🔵 ${user.username} est maintenant modérateur !`);
    return true;
}

/**
 * Révoquer un modérateur
 */
function revokeModerator(userId) {
    if (!can('revoke_moderator')) {
        showToast('❌ Permission refusée', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;

    user.role = ROLES.USER;
    addLog('REVOKE_MOD', `${currentUser.username} a révoqué ${user.username} de son rôle de modérateur`);
    showToast(`⚠️ ${user.username} n'est plus modérateur`, 'warning');
    return true;
}

/**
 * Nommer un admin (super admin)
 */
function promoteToAdmin(userId) {
    if (!can('promote_admin')) {
        showToast('❌ Seul un super admin peut nommer un admin', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;

    user.role = ROLES.SUPER_ADMIN;
    addLog('PROMOTE_ADMIN', `${currentUser.username} a nommé ${user.username} super admin`);
    showToast(`👑 ${user.username} est maintenant SUPER ADMIN !`);
    return true;
}

/**
 * Révoquer un admin
 */
function revokeAdmin(userId) {
    if (!can('revoke_admin')) {
        showToast('❌ Permission refusée', 'error');
        return false;
    }
    if (userId === currentUser.id) {
        showToast('❌ Vous ne pouvez pas vous révoquer vous-même', 'error');
        return false;
    }
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;

    user.role = ROLES.MODERATOR;
    addLog('REVOKE_ADMIN', `${currentUser.username} a rétrogradé ${user.username} au rang de modérateur`);
    showToast(`⚠️ ${user.username} n'est plus super admin`, 'warning');
    return true;
}

/**
 * Supprimer un compte
 */
function deleteAccount(userId) {
    if (!can('delete_account')) return false;
    const user = allUsers.find(u => u.id === userId);
    if (!user) return false;
    if (!canActOn(user)) {
        showToast('❌ Impossible de supprimer un compte de rang supérieur ou égal', 'error');
        return false;
    }
    if (!confirm(`⚠️ Supprimer définitivement le compte de ${user.username} ?`)) return false;

    allUsers = allUsers.filter(u => u.id !== userId);
    addLog('DELETE_ACCOUNT', `${currentUser.username} a supprimé le compte de ${user.username}`);
    showToast(`🗑️ Compte supprimé`, 'warning');
    return true;
}

// ============================================================
// LOGS (traçabilité des actions)
// ============================================================

let activityLogs = [];

function addLog(type, message) {
    activityLogs.push({
        id: Date.now(),
        type,
        message,
        date: new Date().toISOString(),
        author: currentUser.username
    });
    // En vrai, envoyer au backend
}

function getLogs() {
    if (!can('view_logs')) {
        showToast('❌ Permission refusée', 'error');
        return [];
    }
    return activityLogs;
}

// ============================================================
// INITIALISATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    restoreSession();

    // Afficher le nom d'utilisateur dans la navbar
    const userBadge = document.getElementById('userBadge');
    if (userBadge) {
        const roleIcons = {
            [ROLES.SUPER_ADMIN]: '👑',
            [ROLES.MODERATOR]: '🔵',
            [ROLES.MODEL]: '🟢',
            [ROLES.USER]: '⚪'
        };
        userBadge.innerText = `${roleIcons[currentUser.role]} ${currentUser.username}`;
    }

    // Afficher les liens d'admin si autorisé
    if (can('access_admin_panel')) {
        document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    }
    if (can('access_mod_panel')) {
        document.querySelectorAll('.moderator-only').forEach(el => el.classList.remove('hidden'));
    }
});

// Raccourci global
window.EVISIO = {
    can, canAny, canAll, canActOn,
    login, logout,
    kickUser, banUser, unbanUser, muteUser,
    promoteToModerator, revokeModerator,
    promoteToAdmin, revokeAdmin,
    deleteAccount,
    getLogs, addLog,
    allUsers, currentUser,
    ROLES
};