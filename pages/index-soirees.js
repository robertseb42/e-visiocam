// E-VISIOCAM — Accueil : soirées des clubs (agenda du Guide libertin) et love rooms à la une,
// en rangées de cartes qui défilent horizontalement (flèches, glisser, molette).
// Membre connecté avec un département : les lieux de chez lui d'abord, puis sa région, puis le reste.
(function () {
    'use strict';
    if (typeof API_URL === 'undefined') return;
    var $ = function (id) { return document.getElementById(id); };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var BASE = API_URL.replace(/\/api\/?$/, '');

    // ---- « Près de chez vous » ----
    var moi = (typeof getCurrentUser === 'function' && getCurrentUser()) || null;
    var monDep = moi && moi.departement ? String(moi.departement).toUpperCase() : '';
    function rang(dep) { var p = monDep && window.evcProximite ? window.evcProximite(monDep, dep) : ''; return p === 'departement' ? 0 : p === 'region' ? 1 : 2; }
    function trierProches(liste, depDe) {   // tri stable : département, puis région, puis le reste
        if (!monDep) return liste;
        return liste.map(function (x, i) { return { x: x, i: i, r: rang(depDe(x)) }; }).sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (o) { return o.x; });
    }
    function mentionProche(el, liste, depDe) {
        if (!el) return;
        var html = '';
        if (monDep && liste.some(function (x) { return rang(depDe(x)) < 2; })) {
            var nom = (window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[monDep]) || monDep;
            html = '<i class="fa-solid fa-location-dot" aria-hidden="true"></i> Près de chez vous : ' + esc(nom) + ' d\'abord';
        } else if (moi && !monDep) html = '<a href="compte.html"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Indiquez votre département pour voir les lieux près de chez vous</a>';
        el.innerHTML = html; el.hidden = !html;
    }

    // ---- Dates ----
    var MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var JOURS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];
    function quand(s) {
        var d = new Date(s.date + 'T12:00:00Z'), auj = new Date(), dem = new Date(Date.now() + 864e5);
        var iso = function (x) { return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
        var j = s.date === iso(auj) ? 'Ce soir' : s.date === iso(dem) ? 'Demain' : JOURS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MOIS[d.getUTCMonth()];
        return j + (s.debut ? ' · ' + s.debut.replace(':', 'h') : '');
    }

    // ---- Rangée qui défile : flèches + glisser au doigt (défilement natif) ----
    function rangee(bloc) {
        var ul = bloc.querySelector('.evx-rangee'), prec = bloc.querySelector('.evx-prec'), suiv = bloc.querySelector('.evx-suiv');
        function etat() {
            var max = ul.scrollWidth - ul.clientWidth - 2;
            if (prec) prec.hidden = ul.scrollLeft <= 2;
            if (suiv) suiv.hidden = ul.scrollLeft >= max;
        }
        function pas() { var li = ul.querySelector('li'); return li ? (li.getBoundingClientRect().width + 16) * Math.max(1, Math.floor(ul.clientWidth / (li.getBoundingClientRect().width + 16))) : ul.clientWidth; }
        if (prec) prec.onclick = function () { ul.scrollBy({ left: -pas(), behavior: 'smooth' }); };
        if (suiv) suiv.onclick = function () { ul.scrollBy({ left: pas(), behavior: 'smooth' }); };
        ul.addEventListener('scroll', etat, { passive: true });
        window.addEventListener('resize', etat);
        etat(); setTimeout(etat, 600);
    }

    // ---- Filtres « Tous / Événements E-VISIOCAM / Soirées des clubs » ----
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-evx-filtre]'); if (!b) return;
        var f = b.getAttribute('data-evx-filtre');
        document.querySelectorAll('[data-evx-filtre]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        document.querySelectorAll('[data-evx-groupe]').forEach(function (g) {
            var vide = g.getAttribute('data-vide') === '1';
            g.hidden = vide || !(f === 'tous' || g.getAttribute('data-evx-groupe') === f);
        });
        var c = $('clubsSoirees'); if (c && !c.hidden) rangee(c);
    });

    // ---- Soirées des clubs ----
    var blocClubs = $('clubsSoirees');
    if (blocClubs) fetch(API_URL + '/guide/soirees?jours=30').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var depS = function (x) { return (x.lieu || {}).dep; };
        var s = trierProches((d && d.soirees) || [], depS).slice(0, 16);
        if (!s.length) { blocClubs.setAttribute('data-vide', '1'); return; }
        $('clubsRangee').innerHTML = s.map(function (x) {
            var l = x.lieu || {};
            return '<li><a class="evx-carte evx-club" href="/lieu.html?l=' + encodeURIComponent(l.slug || '') + '">' +
                '<span class="evx-visuel">' + (x.visuel ? '<img src="' + esc(BASE + x.visuel) + '" alt="" loading="lazy">' : '<i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i>') +
                '</span>' +
                '<span class="evx-corps"><small>' + esc(quand(x)) + '</small><b>' + esc(x.titre) + '</b><span>' + esc(l.nom || '') + (l.ville ? ' · ' + esc(l.ville) : '') + '</span>' +
                '<span class="evx-jv" data-jv="' + Number(x.id) + '_' + esc(x.date) + '" hidden></span>' +
                '<em class="evx-cta"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> Voir la soirée · J\u2019y vais</em></span></a></li>';
        }).join('');
        // 🙋 « J'y vais » : combien de membres y vont (membres connectés ; le bouton est sur la fiche du lieu)
        if (moi) {
            var cles = s.map(function (x) { return Number(x.id) + '_' + x.date; }).join(',');
            fetch(API_URL + '/guide/participations?cles=' + encodeURIComponent(cles), { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (p) {
                if (!p) return;
                document.querySelectorAll('#clubsRangee [data-jv]').forEach(function (el) {
                    var i = p[el.getAttribute('data-jv')]; if (!i || !i.nb) return;
                    el.textContent = '🙋 ' + i.nb + ' membre' + (i.nb > 1 ? 's y vont' : ' y va') + (i.moi ? ' · vous aussi' : '');
                    el.hidden = false;
                });
            }).catch(function () {});
        }
        mentionProche($('clubsPres'), s, depS);
        var bouton = document.querySelector('[data-evx-filtre="clubs"]'); if (bouton) bouton.hidden = false;
        var actif = document.querySelector('[data-evx-filtre][aria-pressed="true"]');
        var f = actif ? actif.getAttribute('data-evx-filtre') : 'tous';
        blocClubs.hidden = !(f === 'tous' || f === 'clubs');
        rangee(blocClubs);
    }).catch(function () {});

    // ---- Love rooms à la une (photo principale) : futur emplacement des fiches mises en avant ----
    var blocLove = $('loveUne');
    if (blocLove) fetch(API_URL + '/guide/lieux?type=loveroom').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var l = ((d && d.lieux) || []).filter(function (x) { return x.photo; });
        if (!l.length) return;
        for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }   // ordre varié à chaque visite
        var depL = function (x) { return x.dep; };
        l = trierProches(l, depL).slice(0, 16);
        $('loveRangee').innerHTML = l.map(function (x) {
            return '<li><a class="evx-carte evx-lr" href="' + esc(x.url || '/lieu.html?l=' + encodeURIComponent(x.slug)) + '">' +
                '<span class="evx-visuel"><img src="' + esc(BASE + x.photo) + '" alt="' + esc('Love room ' + x.nom + ', ' + x.ville) + '" loading="lazy">' +
                (x.prixDes != null ? '<span class="evx-prix">dès ' + x.prixDes + ' €</span>' : '') + '</span>' +
                '<span class="evx-corps"><b>' + esc(x.nom) + '</b><span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + esc(x.ville || '') + '</span>' +
                '<em class="evx-cta">Voir la fiche <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></em></span></a></li>';
        }).join('');
        mentionProche($('lovePres'), l, depL);
        blocLove.hidden = false;
        rangee(blocLove);
    }).catch(function () {});
})();
