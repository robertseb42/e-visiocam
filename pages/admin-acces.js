// Extrait de admin.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=admin.html';
        return;
    }
    if (!hasRole('super_admin')) {
        document.documentElement.innerHTML = '<head><title>Acces refuse</title></head><body style="margin:0;"><div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#111113;font-family:Inter,sans-serif;"><div style="background:#1c1c20;border:1px solid #343439;border-radius:24px;padding:40px;text-align:center;max-width:420px;"><h1 style="font-size:22px;font-weight:900;color:#f5f5f6;">Acces refuse</h1><p style="font-size:13px;color:#a6a6b1;">Reserve aux Super Admins.</p><a href="index.html" style="display:inline-block;padding:12px 24px;background:#ffe500;color:#111113;font-weight:bold;border-radius:12px;text-decoration:none;">Retour</a></div></div></body>';
        throw new Error('Acces refuse');
    }
})();
