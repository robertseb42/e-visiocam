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
    // Diaporama plein cadre générique : items = [{ href, img, alt, haut, bas, badge }]
    function diapo(fen, items) {
        fen.className = 'sb-diapo';
        fen.innerHTML = items.map(function (x, i) {
            return '<a class="sb-diapo-vue' + (i ? '' : ' actif') + '" href="' + esc(x.href) + '"' + (i ? ' tabindex="-1" aria-hidden="true"' : '') + '>' +
                '<img src="' + esc(x.img) + '" alt="' + esc(x.alt) + '"' + (i > 1 ? ' loading="lazy"' : '') + '>' +
                (x.badge ? '<span class="sb-diapo-badge">' + esc(x.badge) + '</span>' : '') +
                '<span class="sb-diapo-info"><small>' + esc(x.haut) + '</small><span>' + esc(x.bas) + '</span></span></a>';
        }).join('') + (items.length > 1 ? '<div class="sb-diapo-points" aria-hidden="true">' + items.map(function (x, i) { return '<i' + (i ? '' : ' class="actif"') + '></i>'; }).join('') + '</div>' : '');
        if (items.length < 2) return;
        var vues = fen.querySelectorAll('.sb-diapo-vue'), pts = fen.querySelectorAll('.sb-diapo-points i'), n = 0, pause = false;
        function aller(k) {
            vues[n].classList.remove('actif'); vues[n].setAttribute('aria-hidden', 'true'); vues[n].tabIndex = -1; pts[n].classList.remove('actif');
            n = (k + vues.length) % vues.length;
            vues[n].classList.add('actif'); vues[n].removeAttribute('aria-hidden'); vues[n].removeAttribute('tabindex'); pts[n].classList.add('actif');
        }
        fen.addEventListener('mouseenter', function () { pause = true; });
        fen.addEventListener('mouseleave', function () { pause = false; });
        var x0 = null;
        fen.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
        fen.addEventListener('touchend', function (e) { if (x0 == null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) aller(n + (dx < 0 ? 1 : -1)); x0 = null; });
        if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) setInterval(function () { if (!pause && !document.hidden) aller(n + 1); }, 4500 + Math.round(Math.random() * 800));
    }
    function diaporama(s) {
        diapo(bloc.querySelector('.sb-soirees-fenetre'), s.map(function (x) {
            var l = x.lieu || {};
            return { href: '/lieu.html?l=' + encodeURIComponent(l.slug || ''), img: BASE + x.visuel, alt: 'Soirée ' + (l.nom || '') + ', ' + quand(x), haut: quand(x), bas: (l.nom || '') + (l.ville ? ' · ' + l.ville : '') };
        }));
        bloc.hidden = false;
    }
    // Love rooms du guide (photo principale) : encart qui pourra accueillir des fiches mises en avant
    var blocLR = document.getElementById('sbLoveRooms');
    if (blocLR) fetch(API_URL + '/guide/lieux?type=loveroom').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var l = ((d && d.lieux) || []).filter(function (x) { return x.photo; });
        if (!l.length) return;
        for (var i = l.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = l[i]; l[i] = l[j]; l[j] = t; }   // ordre varié à chaque visite
        diapo(blocLR.querySelector('.sb-lr-fenetre'), l.slice(0, 12).map(function (x) {
            return { href: x.url || '/lieu.html?l=' + encodeURIComponent(x.slug), img: BASE + x.photo, alt: 'Love room ' + x.nom + ', ' + x.ville, haut: x.ville || '', bas: x.nom, badge: x.prixDes != null ? 'dès ' + x.prixDes + ' €' : '' };
        }));
        blocLR.hidden = false;
    }).catch(function () {});
    fetch(API_URL + '/guide/soirees?jours=30').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        var tout = (d && d.soirees) || [];
        if (!tout.length) return;
        // Soirées avec visuel : diaporama plein cadre (une affiche à la fois, fondu enchaîné)
        var av = tout.filter(function (x) { return x.visuel; }).slice(0, 12);
        if (av.length) return diaporama(av);
        var s = tout.slice(0, 12);
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
