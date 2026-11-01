// Profil d'un membre : réservé aux membres connectés (CSP stricte : pas de script inline dans la page)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=' + encodeURIComponent('membre.html' + window.location.search);
    }
})();
