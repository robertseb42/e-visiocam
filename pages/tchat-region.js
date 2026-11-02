// ============================================================
// E-VISIOCAM — Pages « Tchat webcam <Région> » (tchat-<region>.html) et tchat-regions.html
// ------------------------------------------------------------
// Bloc « En ligne dans la région » : compteurs réels, sans aucun pseudo.
//   - page d'une région  : GET /api/salons/region/<slug>/stats (cache serveur 30 s)
//   - page des régions   : GET /api/salons/list (champ « online » des salons régionaux)
// Le contenu de la page est en HTML statique : ce script ne fait que remplir les chiffres.
// ============================================================
(function () {
    'use strict';
    var base = typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api';
    var region = document.body.getAttribute('data-region');
    var RAFRAICHIR_MS = 60 * 1000;

    function texte(id, valeur) { var el = document.getElementById(id); if (el) el.textContent = valeur; }
    function nombre(n) { n = Number(n) || 0; return n.toLocaleString('fr-FR'); }
    function lire(chemin) {
        return fetch(base + chemin, { credentials: 'omit' }).then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        });
    }

    // ---------- Page d'une région ----------
    function majRegion() {
        return lire('/salons/region/' + encodeURIComponent(region) + '/stats').then(function (d) {
            texte('statSalon', nombre(d.dansLeSalon));
            texte('statRegion', nombre(d.connectesRegion));
            texte('statMessages', nombre(d.messages24h));
            var calme = !d.dansLeSalon && !d.connectesRegion && !d.messages24h;
            texte('statNote', calme
                ? 'Le salon est calme en ce moment : soyez la première ou le premier à lancer la conversation.'
                : 'Chiffres réels, mis à jour toutes les minutes. Aucun pseudo n’est affiché ici.');
            var bloc = document.getElementById('statsRegion');
            if (bloc) bloc.removeAttribute('aria-busy');
        }).catch(function () {
            texte('statNote', 'Statistiques indisponibles pour le moment.');
        });
    }

    // ---------- Page des régions : nombre de membres présents dans chaque salon régional ----------
    function majCarte() {
        return lire('/salons/list').then(function (d) {
            var total = 0;
            (d.salons || []).forEach(function (s) {
                if (!s.region) return;
                var n = Number(s.online) || 0;
                total += n;
                var el = document.querySelector('[data-enligne="' + s.region + '"]');
                if (el) { el.textContent = n ? '● ' + nombre(n) + ' en ligne' : ''; el.hidden = !n; }
            });
            texte('statTotal', total ? nombre(total) + ' membre' + (total > 1 ? 's' : '') + ' en ce moment dans les salons régionaux' : 'Les salons régionaux sont calmes en ce moment.');
        }).catch(function () { texte('statTotal', ''); });
    }

    var maj = region ? majRegion : (document.querySelector('[data-enligne]') ? majCarte : null);
    if (!maj) return;
    maj();
    setInterval(function () { if (!document.hidden) maj(); }, RAFRAICHIR_MS);
})();
