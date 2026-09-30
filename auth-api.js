// ============================================================
// E-VISIOCAM - PONT ENTRE LE FRONT ET LE BACKEND
// ============================================================

const API_URL = 'http://localhost:3000/api';

// ---------- TOKEN ----------
function saveToken(token) { localStorage.setItem('evisiocam_token', token); }
function getToken() { return localStorage.getItem('evisiocam_token'); }
function clearToken() { localStorage.removeItem('evisiocam_token'); }

// ---------- UTILISATEUR ----------
function saveUser(user) { localStorage.setItem('evisiocam_user', JSON.stringify(user)); }
function getCurrentUser() {
    const raw = localStorage.getItem('evisiocam_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
}
function clearUser() { localStorage.removeItem('evisiocam_user'); }

// ---------- VÉRIFICATIONS ----------
function isLoggedIn() { return !!getToken() && !!getCurrentUser(); }
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
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': 'Bearer ' + token }),
        ...options.headers
    };
    const response = await fetch(API_URL + endpoint, Object.assign({}, options, { headers: headers }));
    const data = await response.json();
    if (response.status === 401) {
        clearToken(); clearUser();
        throw new Error(data.error || 'Session expirée');
    }
    if (!response.ok) throw new Error(data.error || 'Erreur');
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

async function register(username, email, password) {
    const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username: username, email: email, password: password })
    });
    saveToken(data.token);
    saveUser(data.user);
    return data.user;
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
    toast.innerHTML = '<div style="width:24px;height:24px;border-radius:50%;background:' + (colors[type] || colors.success) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-weight:bold;">✓</div><span>' + msg + '</span>';
    setTimeout(function() { toast.style.transform = 'translateY(0)'; toast.style.opacity = '1'; }, 10);
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function() {
        toast.style.transform = 'translateY(100px)';
        toast.style.opacity = '0';
    }, 3000);
}