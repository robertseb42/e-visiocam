// Extrait de moderation.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=moderation.html';
        return;
    }
    if (typeof hasRole !== 'function' || !hasRole('moderator', 'super_admin')) {
        document.documentElement.innerHTML = '<head><title>Acces refuse</title></head><body style="margin:0;"><div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f1f5f9;font-family:Inter,sans-serif;"><div style="background:white;border-radius:24px;padding:40px;text-align:center;max-width:420px;"><h1 style="font-size:22px;font-weight:900;color:#0f172a;">Acces refuse</h1><p style="font-size:13px;color:#64748b;">Reserve aux moderateurs.</p><a href="index.html" style="display:inline-block;padding:12px 24px;background:#e91e63;color:white;font-weight:bold;border-radius:12px;text-decoration:none;">Retour</a></div></div></body>';
        throw new Error('Acces refuse');
    }
})();
