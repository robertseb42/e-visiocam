// Extrait de dashboard.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=dashboard.html';
        return;
    }
    if (!hasRole('model', 'moderator', 'super_admin')) {
        document.documentElement.innerHTML = '<body style="margin:0;"><div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;font-family:Inter,sans-serif;"><div style="background:white;border-radius:24px;padding:40px;text-align:center;max-width:420px;box-shadow:0 20px 60px rgba(0,0,0,0.15);"><h1 style="font-size:22px;font-weight:900;color:#0f172a;margin:0 0 8px;">Accès refusé</h1><p style="font-size:13px;color:#64748b;margin:0 0 24px;">Page réservée aux modèles.</p><a href="index.html" style="display:inline-block;padding:12px 24px;background:#e91e63;color:white;font-weight:bold;border-radius:12px;text-decoration:none;">Retour</a></div></div></body>';
        throw new Error('Accès refusé');
    }
})();
