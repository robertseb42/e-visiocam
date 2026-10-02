// ============================================================
// E-VISIOCAM - Thème clair / sombre, UN SEUL réglage pour toutes les pages
// ------------------------------------------------------------
// À charger dans le <head>, AVANT la feuille de style (pas d'éclair de la mauvaise couleur).
// Le choix est gardé dans le navigateur (clé « evc-theme ») : changer sur l'accueil
// change toutes les pages, y compris celles déjà ouvertes dans d'autres onglets.
// Tout bouton portant l'attribut data-theme-toggle bascule le thème.
// ============================================================
(function () {
    'use strict';
    var KEY = 'evc-theme';

    function lire() {
        try { return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; }
    }

    function majBoutons(t) {
        var boutons = document.querySelectorAll('[data-theme-toggle]');
        for (var i = 0; i < boutons.length; i++) {
            var b = boutons[i], clair = t === 'light';
            b.textContent = clair ? '🌙' : '☀️';
            b.title = clair ? 'Passer en thème sombre' : 'Passer en thème clair';
            b.setAttribute('aria-label', b.title);
            b.setAttribute('aria-pressed', clair ? 'true' : 'false');
        }
    }

    function appliquer(t) {
        document.documentElement.setAttribute('data-theme', t);
        majBoutons(t);
    }

    function choisir(t) {
        t = t === 'light' ? 'light' : 'dark';
        try { localStorage.setItem(KEY, t); } catch (e) { /* navigation privée stricte : le choix vaut pour cette page */ }
        appliquer(t);
    }

    function basculer() { choisir(document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }

    appliquer(lire());   // tout de suite, depuis le <head>

    document.addEventListener('DOMContentLoaded', function () { majBoutons(document.documentElement.getAttribute('data-theme') || lire()); });
    document.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-theme-toggle]') : null;
        if (b) basculer();
    });
    // Un autre onglet change de thème : celui-ci suit
    window.addEventListener('storage', function (e) { if (e.key === KEY) appliquer(lire()); });

    window.EvcTheme = { get: lire, set: choisir, toggle: basculer };
})();
