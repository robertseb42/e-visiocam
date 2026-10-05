// Extrait de saligane.html (CSP stricte : plus de script inline dans les pages)
// Mesure de ce qu'apportent les anciens domaines (compteurs anonymes : visite / clic « Entrer » / inscription)
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
    // Une visite par navigateur et par jour
    var cle = 'evc-saligane-vu-' + new Date().toISOString().slice(0, 10);
    var dejaVu = false;
    try { dejaVu = !!localStorage.getItem(cle); localStorage.setItem(cle, '1'); } catch (e) {}
    if (!dejaVu) envoyer('visite');
    document.querySelectorAll('[data-entrer]').forEach(function (a) {
        a.addEventListener('click', function () { envoyer('entree'); });
    });
})();
