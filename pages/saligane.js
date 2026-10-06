// Extrait de saligane.html (CSP stricte : plus de script inline dans les pages)
// Mesure de ce qu'apportent les anciens domaines (compteurs anonymes : visite / clic « Entrer » / inscription)
// et page vivante : membres connectés, caméras en direct, salons du moment (chiffres réels uniquement).
(function () {
    var d = '';
    try { d = (new URLSearchParams(location.search).get('d') || '').toLowerCase(); } catch (e) {}
    var source = d === 'com' ? 'saligane-com' : d === 'org' ? 'saligane-org' : 'saligane';
    try { localStorage.setItem('evc-source', JSON.stringify({ s: source, t: Date.now() })); } catch (e) {}
    var api = typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api';
    function envoyer(evenement) {
        try {
            return fetch(api + '/acquisition', { method: 'POST', keepalive: true, credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: source, evenement: evenement }) }).catch(function () {});
        } catch (e) {}
    }

    // ---------- Une visite par navigateur et par jour, robots exclus ----------
    // Les robots (moteurs de recherche, surveillance des noms de domaine…) chargent la page sans jamais
    // la toucher : une visite n'est comptée qu'au premier geste humain (défilement, souris, toucher, clavier).
    var ROBOT = /bot|crawl|spider|slurp|preview|headless|lighthouse|monitor|uptime|python|curl|wget|httpclient|facebookexternalhit|embedly/i;
    var robot = !!navigator.webdriver || ROBOT.test(navigator.userAgent || '');
    var cle = 'evc-saligane-vu-' + new Date().toISOString().slice(0, 10);
    var compte = false;
    function compterVisite() {
        if (compte || robot) return;
        compte = true;
        var dejaVu = false;
        try { dejaVu = !!localStorage.getItem(cle); localStorage.setItem(cle, '1'); } catch (e) {}
        if (!dejaVu) envoyer('visite');
    }
    ['scroll', 'pointermove', 'pointerdown', 'touchstart', 'keydown'].forEach(function (t) {
        window.addEventListener(t, compterVisite, { once: true, passive: true });
    });

    // Clic vers le site (y compris sur les salons ajoutés plus bas) : écouté sur toute la page
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-entrer]')) { compterVisite(); envoyer('entree'); }
    });

    // ---------- Le tchat en direct ----------
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function lire(chemin) {
        return fetch(api + chemin, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    }

    // Membres connectés et caméras en direct : affichés seulement s'il y a du monde (jamais « 0 connecté »)
    Promise.all([lire('/models/online'), lire('/streams')]).then(function (res) {
        var connectes = (res[0] && Number(res[0].total)) || 0;
        var cams = (res[1] && res[1].streams && res[1].streams.length) || 0;
        var morceaux = [];
        if (connectes > 0) morceaux.push('<span><span class="pt" aria-hidden="true"></span>' + connectes + (connectes > 1 ? ' membres connectés' : ' membre connecté') + '</span>');
        if (cams > 0) morceaux.push('<span>🎥 ' + cams + (cams > 1 ? ' caméras en direct' : ' caméra en direct') + '</span>');
        if (!morceaux.length) return;
        var zone = document.getElementById('salDirect');
        zone.innerHTML = morceaux.join('');
        zone.hidden = false;
    });

    // « Voir le tchat en direct » seulement s'il y a de vrais échanges : un aperçu où seul l'animateur parle
    // donnerait l'impression d'un site vide. Sinon le bouton reste « Visiter d'abord » (accueil).
    var SEUIL_MESSAGES_MEMBRES = 5;
    lire('/salons/apercu').then(function (data) {
        var n = 0;
        ((data && data.salons) || []).forEach(function (s) {
            (s.messages || []).forEach(function (m) { if (!m.animateur) n++; });
        });
        if (n < SEUIL_MESSAGES_MEMBRES) return;
        var b = document.getElementById('salBtnApercu');
        if (!b) return;
        b.href = 'apercu.html';
        b.innerHTML = '<i class="fa-solid fa-eye"></i> Voir le tchat en direct';
    });

    // Salons du moment (ceux choisis dans « Gestion des salons »), avec la même image qu'à l'accueil
    var COUVERTURES = ['img/ambiance-lounge.jpg', 'img/ambiance-musique.jpg', 'img/ambiance-rencontres.jpg'];
    var base = api.replace(/\/api\/?$/, '');
    function couverture(s) {
        if (s.coverUrl) return base + s.coverUrl;
        if (s.slug === 'musique') return COUVERTURES[1];
        var h = 0; String(s.slug).split('').forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; });
        return [COUVERTURES[0], COUVERTURES[2]][h % 2];
    }
    lire('/salons/home').then(function (data) {
        var salons = (data && data.salons) || [];
        if (!salons.length) return;
        document.getElementById('salSalonsListe').innerHTML = salons.slice(0, 3).map(function (s) {
            var lien = s.isPrivate ? 'salons.html' : 'chat.html?theme=' + encodeURIComponent(s.slug);
            return '<article class="sal-salon">' +
                '<img src="' + esc(couverture(s)) + '" alt="" loading="lazy" width="320" height="120">' +
                '<div class="sal-salon-txt"><h3>' + esc(s.name) + (s.isPrivate ? ' 🔒' : '') + '</h3>' +
                '<p>' + esc(s.description || '') + '</p>' +
                '<a class="sal-btn" data-entrer="" href="' + esc(lien) + '"><i class="fa-solid ' + (s.isPrivate ? 'fa-lock' : 'fa-user-group') + '"></i> ' +
                (s.isPrivate ? 'Demander l’accès' : 'Rejoindre') + '</a></div></article>';
        }).join('');
        document.getElementById('salSalons').hidden = false;
    });
})();
