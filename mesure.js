// E-VISIOCAM — mesure d'audience anonyme (sans cookie, sans identifiant, sans adresse IP enregistrée).
// Chaque page envoie : son nom, la fiche ou la région du guide consultée, et pour la 1re page de la visite
// la provenance (Google, réseaux sociaux…) et le type d'appareil. Les clics sur téléphone / site / itinéraire
// d'une fiche du guide sont aussi comptés. Les résultats sont dans l'espace équipe du guide (« Fréquentation »).
(function () {
    'use strict';
    if (navigator.webdriver || /bot|crawl|spider|preview|headless|lighthouse/i.test(navigator.userAgent || '')) return;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
    var API = (typeof API_URL === 'string' && API_URL) || 'https://api.e-visiocam.com/api';
    var ss = { get: function (k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
               set: function (k, v) { try { sessionStorage.setItem(k, v); } catch (e) { /* navigation privée */ } } };
    function envoyer(d) {
        try { fetch(API + '/guide/vue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d), keepalive: true, credentials: 'omit' }).catch(function () {}); } catch (e) { /* rien */ }
    }
    var chemin = location.pathname.replace(/^\/+/, '');
    // Le cadre radio (app-shell) n'est pas une page : il garde seulement la provenance d'origine pour la page affichée dedans
    if (/^app-shell(\.html)?$/.test(chemin)) { if (!ss.get('evm_ref')) ss.set('evm_ref', document.referrer || '-'); return; }

    var q = new URLSearchParams(location.search), d = { page: chemin.replace(/\.html$/, '') || 'index' };
    if (/^club-libertin\//.test(chemin)) {
        // Pages Google du guide : /club-libertin/<ville>/<lieu>/ (fiche) ou /club-libertin/<ville|region>/ (liste)
        var fiche = document.querySelector('[data-slug]');
        d.page = 'club-libertin/' + (fiche ? 'fiche' : 'liste');
        if (fiche) d.fiche = fiche.getAttribute('data-slug');
    }
    if (d.page === 'lieu' && q.get('l')) d.fiche = q.get('l');
    if (d.page === 'guide' && q.get('region')) d.region = q.get('region');
    if (!ss.get('evm_debut')) {
        ss.set('evm_debut', '1');
        var ref = ss.get('evm_ref');
        d.debut = true; d.ref = ref && ref !== '-' ? ref : (ref === '-' ? '' : document.referrer);
        d.mobile = window.matchMedia && matchMedia('(max-width: 820px), (pointer: coarse)').matches;
    }
    // Attendre le chargement (le slug des pages fixes du guide est dans la page)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () {
        if (!d.fiche && /^club-libertin\//.test(chemin)) { var f = document.querySelector('[data-slug]'); if (f) { d.page = 'club-libertin/fiche'; d.fiche = f.getAttribute('data-slug'); } }
        envoyer(d);
    }); else envoyer(d);

    // Clics de contact sur une fiche du guide
    document.addEventListener('click', function (e) {
        var a = e.target.closest && e.target.closest('a[href]'); if (!a) return;
        var el = document.querySelector('[data-slug]'), slug = d.fiche || (el && el.getAttribute('data-slug'));
        if (!slug) return;
        var h = a.getAttribute('href') || '', quoi = '';
        if (/^tel:/i.test(h)) quoi = 'tel';
        else if (/^mailto:/i.test(h)) quoi = 'email';
        else if (/google\.[a-z.]+\/maps|maps\.apple|waze\.com|openstreetmap\.org\/directions/i.test(h)) quoi = 'itineraire';
        else if (/facebook|instagram|twitter|x\.com|tiktok/i.test(h)) quoi = 'reseau';
        else if (/^https?:\/\//i.test(h) && !/e-visiocam\.com/i.test(h)) quoi = 'site';
        if (quoi) envoyer({ clic: slug + '|' + quoi });
    }, true);
})();
