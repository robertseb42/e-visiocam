// ============================================================
// E-VISIOCAM - PONT ENTRE LE FRONT ET LE BACKEND
// ============================================================

const API_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://api.e-visiocam.com/api';

// ---------- SESSION ----------
// Le jeton de connexion n'est plus gardé dans le navigateur : le serveur le dépose dans un
// cookie sécurisé (HttpOnly) que le JavaScript ne peut pas lire. Ces fonctions restent pour
// les anciens appels, mais ne stockent plus rien ; l'ancien jeton éventuel est effacé.
function saveToken() { clearToken(); }
function getToken() { return null; }
function clearToken() { try { localStorage.removeItem('evisiocam_token'); } catch (e) {} }
clearToken();

// Toutes les requêtes vers l'API emportent le cookie de session (même pour un fetch écrit à la main)
(function () {
    if (typeof window === 'undefined' || !window.fetch || window.fetch._evcSession) return;
    var base = API_URL.replace(/\/api\/?$/, '');
    var natif = window.fetch.bind(window);
    var enveloppe = function (input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.indexOf(base) === 0 || url.indexOf('https://api.e-visiocam.com') === 0) {
            init = Object.assign({}, init || {}, { credentials: 'include' });
        }
        return natif(input, init);
    };
    enveloppe._evcSession = true;
    window.fetch = enveloppe;
})();

// ---------- PHOTO DE PROFIL ----------
// Adresse complète d'une photo validée (« /api/avatars/12?v=… » → https://api…/api/avatars/12?v=…), sinon null
function urlAvatar(chemin) {
    if (typeof chemin !== 'string' || !/^\/api\/avatars\/\d+\?v=[\w-]+$/.test(chemin)) return null;
    return API_URL.replace(/\/api\/?$/, '') + chemin;
}

// ---------- UTILISATEUR ----------
function saveUser(user) { localStorage.setItem('evisiocam_user', JSON.stringify(user)); }
function getCurrentUser() {
    const raw = localStorage.getItem('evisiocam_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}
function clearUser() { localStorage.removeItem('evisiocam_user'); }

// ---------- MENU MOBILE ----------
function toggleMobileSidebar() {
    var sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('flex');
    sidebar.classList.toggle('absolute');
    sidebar.classList.toggle('z-30');
    sidebar.classList.toggle('bg-slate-100');
    sidebar.classList.toggle('p-4');
}

// ---------- VÉRIFICATIONS ----------
function isLoggedIn() { return !!getCurrentUser(); }
function hasRole() {
    const roles = Array.from(arguments);
    const user = getCurrentUser();
    if (!user) return false;
    return roles.includes(user.role);
}
function isSuperAdmin() { return hasRole('super_admin'); }
function isModerator() { return hasRole('moderator', 'super_admin'); }
function isModel() { return hasRole('model'); }

// ---------- APPEL API ----------
async function apiCall(endpoint, options) {
    options = options || {};
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    const response = await fetch(API_URL + endpoint, Object.assign({}, options, { headers: headers, credentials: 'include' }));
    const data = await response.json();
    if (response.status === 503 && data && data.maintenance && window.EvcMaintenance) {
        window.EvcMaintenance.show(data);
    }
    if (response.status === 401) {
        clearToken(); clearUser();
        throw new Error(data.error || 'Session expirée');
    }
    if (!response.ok) {
        const err = new Error(data.error || 'Erreur');
        err.status = response.status; err.data = data;   // ex. data.needVerification à la connexion
        throw err;
    }
    return data;
}

// ---------- AUTH ----------
async function login(username, password) {
    const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: username, password: password })
    });
    saveToken(data.token);
    saveUser(data.user);
    return data.user;
}

async function register(username, email, password, parrain, departement) {
    const corps = { username: username, email: email, password: password };
    if (parrain) corps.parrain = String(parrain).slice(0, 30);
    if (departement) corps.departement = String(departement).slice(0, 3);
    const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify(corps)
    });
    // Adresse à confirmer : pas encore de session, le lien est envoyé par e-mail
    if (data.needVerification) return { needVerification: true, email: data.email, username: data.user && data.user.username };
    saveToken(data.token);
    saveUser(data.user);
    return data.user;
}

// Renvoie le lien de confirmation de l'adresse e-mail (pseudo ou adresse)
async function renvoyerConfirmation(login) {
    return apiCall('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ login: login }) });
}

async function logout() {
    try { await apiCall('/auth/logout', { method: 'POST' }); } catch (e) {}
    clearToken(); clearUser();
    window.location.href = 'index.html';
}

// ---------- REDIRECTION ----------
function redirectByRole(user) {
    if (user.role === 'super_admin') window.location.href = 'admin.html';
    else if (user.role === 'moderator') window.location.href = 'moderation.html';
    else if (user.role === 'model') window.location.href = 'dashboard.html';
    else window.location.href = 'index.html';
}

// ---------- GUARD ----------
function requireAuth(allowedRoles) {
    if (!isLoggedIn()) {
        window.location.href = 'login.html';
        return false;
    }
    if (allowedRoles && !hasRole.apply(null, allowedRoles)) {
        showToast('Accès refusé', 'error');
        setTimeout(function() { window.location.href = 'index.html'; }, 1500);
        return false;
    }
    return true;
}

// ---------- TOAST ----------
function showToast(msg, type) {
    type = type || 'success';
    let toast = document.getElementById('evisio-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'evisio-toast';
        toast.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#0f172a;color:#fff;padding:14px 20px;border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,0.3);font-family:Inter,sans-serif;font-size:13px;z-index:9999;display:flex;align-items:center;gap:10px;transform:translateY(100px);opacity:0;transition:all 0.3s ease;';
        document.body.appendChild(toast);
    }
    const colors = { success: '#10b981', error: '#e11d48', info: '#3b82f6', warning: '#f59e0b' };
    const icon = document.createElement('div');
    icon.style.cssText = 'width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;';
    icon.style.background = colors[type] || colors.success;
    icon.textContent = '✓';
    const text = document.createElement('span');
    text.textContent = String(msg == null ? '' : msg);
    toast.replaceChildren(icon, text);
    setTimeout(function() { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; }, 10);
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function() {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
    }, 3000);
}

// ============================================================
// REDIRECTIONS RAPIDES (NOUVEAU)
// ============================================================
function goLive() {
    console.log('goLive() appelée');
    if (isLoggedIn()) {
        window.location.href = 'live.html';
    } else {
        window.location.href = 'login.html?redirect=live.html';
    }
}

function goModels() { window.location.href = 'modeles.html'; }
function goSalons() { window.location.href = 'salons.html'; }

function goMessages() {
    if (isLoggedIn()) { window.location.href = 'messages.html'; }
    else { window.location.href = 'login.html?redirect=messages.html'; }
}

function goCredits() {
    if (isLoggedIn()) { window.location.href = 'credits.html'; }
    else { window.location.href = 'login.html?redirect=credits.html'; }
}

function goRegister() { window.location.href = 'register.html'; }
function goLogin() { window.location.href = 'login.html'; }

function goProfile() {
    if (isLoggedIn()) {
        redirectByRole(getCurrentUser());
    } else {
        window.location.href = 'login.html';
    }
}

// ============================================================
// MOT DE PASSE RÉINITIALISÉ PAR UN ADMINISTRATEUR
// Tant que le membre n'a pas choisi un nouveau mot de passe, on l'y oblige.
// ============================================================
(function() {
    try {
        var page = (window.location.pathname.split('/').pop() || 'index.html').toLowerCase();
        var libres = ['nouveau-mdp.html', 'login.html', 'register.html', 'forgot-password.html', 'reset-password.html'];
        if (libres.indexOf(page) !== -1) return;
        var user = getCurrentUser();
        if (user && Number(user.must_change_password) === 1) {
            window.location.replace('nouveau-mdp.html');
        }
    } catch (e) {}
})();
