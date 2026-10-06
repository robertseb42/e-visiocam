// Extrait de chat.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        // On conserve le salon demandé pour y revenir après connexion
        window.location.href = 'login.html?redirect=' + encodeURIComponent('chat.html' + window.location.search);
        return;
    }
})();
