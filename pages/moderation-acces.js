// Extrait de moderation.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=moderation.html';
        return;
    }
    if (typeof hasRole !== 'function' || !hasRole('moderator', 'super_admin')) {
        document.documentElement.innerHTML = '<head><title>Accès refusé</title></head><body style="margin:0;"><div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#111113;font-family:Inter,sans-serif;"><div style="background:#1c1c20;border:1px solid #343439;border-radius:24px;padding:40px;text-align:center;max-width:420px;"><h1 style="font-size:22px;font-weight:900;color:#f5f5f6;">Accès refusé</h1><p style="font-size:13px;color:#a6a6b1;">Réservé à l\'équipe de modération.</p><a href="espace-equipe.html" style="display:inline-block;margin:6px;padding:12px 24px;background:#ffe500;color:#111113;font-weight:bold;border-radius:12px;text-decoration:none;">Espace équipe</a><a href="index.html" style="display:inline-block;margin:6px;padding:12px 24px;background:#2a2a30;color:#f5f5f6;font-weight:bold;border-radius:12px;text-decoration:none;">Accueil</a></div></div></body>';
        throw new Error('Accès refusé');
    }
})();
