// Extrait de live.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=live.html';
        return;
    }
})();
