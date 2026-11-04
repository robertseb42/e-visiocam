// E-VISIOCAM — Accueil : « Nos membres » (les derniers inscrits)
//   Visiteur : les compteurs et une mosaïque de masques (aucun pseudo dévoilé), avec un bouton pour rejoindre.
//   Membre connecté : les derniers inscrits (photo validée, sinon masque vénitien), clic = mini-fiche.
//   Ceux qui ont choisi de ne pas apparaître dans la galerie ne sont jamais affichés.
(function () {
    'use strict';
    var zone = document.getElementById('quiEstLa'), liste = document.getElementById('quiListe');
    if (!zone || !liste || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var nombre = function (n) { return Number(n || 0).toLocaleString('fr-FR'); };
    var masque = function (g, s) { return typeof evcMasque === 'function' ? evcMasque(g, s) : ''; };
    var nomDep = function (d) { return d && window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[d] ? window.EVC_DEPARTEMENTS[d] : (d || ''); };

    function charger() {
        fetch(API_URL + '/models/inscrits', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d || !d.total) { zone.hidden = true; return; }
            zone.hidden = false;
            document.getElementById('quiNombre').innerHTML = '<b>' + nombre(d.total) + '</b> membre' + (d.total > 1 ? 's' : '') + ' inscrit' + (d.total > 1 ? 's' : '') +
                (d.semaine ? ' <span class="evm-sep">·</span> <b>+' + nombre(d.semaine) + '</b> cette semaine' : '');
            var lien = document.getElementById('quiLien');
            if (!d.connecte) {
                // Visiteur : une mosaïque de masques (décor) et l'invitation à rejoindre — aucun membre dévoilé
                var genres = ['couple', 'femme', 'homme', 'femme', 'couple', 'homme', '', 'femme', 'homme', 'couple'];
                var mosaique = genres.map(function (g, i) { return '<span class="evm-avatar" aria-hidden="true">' + masque(g, 'visiteur' + i) + '</span>'; }).join('');
                liste.innerHTML = '<div class="evm-invite"><div class="evm-mosaique">' + mosaique + '</div>' +
                    '<div class="evm-invite-txt"><p>Couples, femmes et hommes : <b>' + nombre(d.total) + ' membres</b> ont déjà rejoint la communauté. Pseudo, masque ou photo : vous choisissez ce que vous montrez.</p>' +
                    '<a class="ev-btn" href="register.html">Rejoindre gratuitement <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></a></div></div>';
                if (lien) lien.hidden = true;
                return;
            }
            if (lien) lien.hidden = false;
            var html = d.membres.map(function (m) {
                var photo = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
                return '<button type="button" class="ev-qui-m evm-m" data-fiche="' + Number(m.id) + '" title="' + esc(m.username + (m.departement ? ' · ' + nomDep(m.departement) : '')) + '">' +
                    '<span class="ev-qui-photo evm-avatar">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : masque(m.genre, m.id)) + '</span>' +
                    '<span class="ev-qui-nom">' + esc(m.moi ? 'Vous' : m.username) + '</span>' +
                    (m.departement ? '<span class="evm-dep">' + esc(m.departement) + '</span>' : '') + '</button>';
            }).join('');
            var autres = d.total - d.membres.length;
            if (autres > 0) html += '<a href="modeles.html" class="ev-qui-m evm-m evm-plus"><span class="ev-qui-photo">+' + nombre(autres) + '</span><span class="ev-qui-nom">membres</span></a>';
            liste.innerHTML = html;
        }).catch(function () { /* la section reste cachée */ });
    }
    charger();
    setInterval(charger, 5 * 60000);
})();
