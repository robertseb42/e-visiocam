// Aperçu du tchat sans compte (apercu.html) : messages des salons publics en lecture seule,
// pseudos masqués par le serveur, mis à jour toutes les 15 secondes.
(function () {
    'use strict';
    var api = typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api';
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var onglets = document.getElementById('apcOnglets');
    var fil = document.getElementById('apcFil');
    var salons = [], choisi = null, dernierId = null;

    // Dates du serveur en UTC (« 2026-10-07 20:15:03 ») → heure locale
    function heure(d) {
        var t = new Date(String(d || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z'));
        return isNaN(t) ? '' : t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    function presents(s) { return s.presents > 0 ? s.presents + (s.presents > 1 ? ' présents' : ' présent') : ''; }

    // Par défaut : le salon où les VRAIS membres parlent le plus (pas celui où l'animateur a parlé
    // en dernier), puis le plus récent entre membres, puis le plus fréquenté
    function salonParDefaut() {
        function membres(s) { return s.messages.filter(function (m) { return !m.animateur; }); }
        function dernierMembre(s) { var m = membres(s); return m.length ? m[m.length - 1].id : 0; }
        var tri = salons.slice().sort(function (a, b) {
            return (membres(b).length - membres(a).length) || (dernierMembre(b) - dernierMembre(a)) ||
                (b.presents - a.presents) || (b.messages.length - a.messages.length);
        });
        return tri[0] ? tri[0].slug : null;
    }

    function afficherOnglets() {
        onglets.innerHTML = salons.map(function (s) {
            var info = presents(s);
            return '<button type="button" class="apc-onglet" data-slug="' + esc(s.slug) + '" aria-pressed="' + (s.slug === choisi) + '">' +
                esc(s.icon) + ' ' + esc(s.name) + (info ? ' <small>· ' + esc(info) + '</small>' : '') + '</button>';
        }).join('');
    }

    function afficherSalon(forcerDefilement) {
        var s = salons.find(function (x) { return x.slug === choisi; });
        if (!s) return;
        document.getElementById('apcNom').textContent = s.icon + ' ' + s.name;
        var info = presents(s);
        document.getElementById('apcPresents').innerHTML = info ? '<span class="apc-pt" aria-hidden="true"></span>' + esc(info) + ' en ce moment' : '';
        var enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60;
        if (!s.messages.length) {
            fil.innerHTML = '<p class="apc-vide">Ce salon est calme en ce moment.<br>Créez votre compte et lancez la conversation : les membres connectés vous verront arriver.</p>';
        } else {
            fil.innerHTML = s.messages.map(function (m) {
                return '<div class="apc-msg' + (m.animateur ? ' anim' : '') + '"><b>' + (m.animateur ? '🤖 ' : '') + esc(m.auteur) + '</b>' +
                    '<time>' + esc(heure(m.date)) + '</time><p>' + esc(m.texte) + '</p></div>';
            }).join('');
        }
        var dernier = s.messages.length ? s.messages[s.messages.length - 1].id : null;
        if (forcerDefilement || enBas || dernier !== dernierId) fil.scrollTop = fil.scrollHeight;
        dernierId = dernier;
    }

    function charger(premiere) {
        return fetch(api + '/salons/apercu', { credentials: 'omit' })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(); })
            .then(function (d) {
                salons = (d && d.salons) || [];
                if (!salons.length) throw new Error('vide');
                if (!choisi || !salons.some(function (s) { return s.slug === choisi; })) choisi = salonParDefaut();
                afficherOnglets();
                afficherSalon(premiere);
            })
            .catch(function () {
                if (!premiere) return;   // une mise à jour ratée : on garde l'affichage actuel
                document.getElementById('apcNom').textContent = 'Aperçu indisponible';
                fil.innerHTML = '<p class="apc-vide">Impossible d’afficher les salons pour le moment.<br>Créez votre compte pour les découvrir de l’intérieur.</p>';
            });
    }

    onglets.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-slug]');
        if (!b) return;
        choisi = b.dataset.slug; dernierId = null;
        afficherOnglets();
        afficherSalon(true);
    });

    charger(true);
    setInterval(function () { if (document.visibilityState === 'visible') charger(false); }, 15000);
})();
