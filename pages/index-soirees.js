// E-VISIOCAM — Accueil : les prochaines soirées des clubs (agenda du Guide libertin) défilent sous le menu latéral.
// Défilement vertical en boucle, en pause au survol ou au clavier ; arrêté si l'utilisateur préfère moins d'animations.
(function () {
    'use strict';
    var bloc = document.getElementById('sbSoirees'), liste = document.getElementById('sbSoireesListe');
    if (!bloc || !liste || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var BASE = API_URL.replace(/\/api\/?$/, '');
    var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    function quand(s) {
        var d = new Date(s.date + 'T12:00:00Z'), auj = new Date(), dem = new Date(Date.now() + 864e5);
        var iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
        var j = s.date === iso(auj) ? 'Ce soir' : s.date === iso(dem) ? 'Demain' : JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()];
        return j + (s.debut ? ' · ' + s.debut.replace(':', 'h') : '');
    }
    function carte(s) {
        var l = s.lieu || {};
        return '<li><a class="sb-soiree" href="/lieu.html?l=' + encodeURIComponent(l.slug || '') + '">' +
            (s.visuel ? '<img src="' + esc(BASE + s.visuel) + '" alt="" loading="lazy" width="52" height="52">' : '<span class="sb-soiree-ico" aria-hidden="true"><i class="fa-solid fa-champagne-glasses"></i></span>') +
            '<span class="sb-soiree-txt"><small>' + esc(quand(s)) + '</small><b>' + esc(s.titre) + '</b><span>' + esc(l.nom) + (l.ville ? ' · ' + esc(l.ville) : '') + '</span></span></a></li>';
    }
    fetch(API_URL + '/guide/soirees?jours=30').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var s = ((d && d.soirees) || []).slice(0, 12);
        if (!s.length) return;
        var html = s.map(carte).join('');
        bloc.hidden = false;
        // Assez de soirées pour défiler : la liste est doublée pour une boucle sans saut (la copie est masquée aux lecteurs d'écran)
        if (s.length >= 3) {
            liste.innerHTML = html + html.replace(/<li>/g, '<li aria-hidden="true">').replace(/<a /g, '<a tabindex="-1" ');
            liste.classList.add('sb-defile');
            liste.style.setProperty('--sb-duree', (s.length * 4) + 's');
        } else liste.innerHTML = html;
    }).catch(function () {});
})();
