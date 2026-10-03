// ============================================================
// E-VISIOCAM - Barre de recherche de l'en-tête
// ------------------------------------------------------------
// Suggestions en direct (modèles + salons) sous le champ, navigation au clavier,
// Entrée = page Modèles filtrée. Se branche sur .cam-search input ou [data-site-search].
// ============================================================
(function () {
    'use strict';
    var champ = document.querySelector('[data-site-search]') || document.querySelector('.cam-search input');
    if (!champ || typeof apiCall !== 'function') return;

    var boite = champ.closest('.cam-search') || champ.parentNode;
    boite.style.position = 'relative';
    var liste = document.createElement('div');
    liste.className = 'ev-suggest';
    liste.id = 'evSuggest';
    liste.setAttribute('role', 'listbox');
    liste.hidden = true;
    boite.appendChild(liste);
    champ.setAttribute('role', 'combobox');
    champ.setAttribute('aria-autocomplete', 'list');
    champ.setAttribute('aria-controls', 'evSuggest');
    champ.setAttribute('aria-expanded', 'false');

    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var attente = null, actif = -1, derniere = '';

    function fermer() { liste.hidden = true; champ.setAttribute('aria-expanded', 'false'); actif = -1; }
    function items() { return Array.prototype.slice.call(liste.querySelectorAll('a')); }
    function surligner(n) {
        var it = items(); if (!it.length) return;
        actif = (n + it.length) % it.length;
        it.forEach(function (a, i) { a.classList.toggle('is-active', i === actif); a.setAttribute('aria-selected', i === actif ? 'true' : 'false'); });
    }

    async function chercher(q) {
        derniere = q;
        if (q.length < 2) { fermer(); return; }
        var d;
        try { d = await apiCall('/models/search?q=' + encodeURIComponent(q)); } catch (e) { return; }
        if (q !== derniere) return;
        var html = '';
        (d.models || []).forEach(function (m) {
            html += '<a role="option" href="' + (m.isLive ? 'live.html' : 'modeles.html?q=' + encodeURIComponent(m.username)) + '">' +
                '<span class="ev-suggest-ico">' + esc(m.username.charAt(0).toUpperCase()) + '</span>' +
                '<span class="ev-suggest-txt"><b>' + esc(m.username) + '</b><small>' + (m.isLive ? '● En direct · ' + esc(m.liveSalon) : 'Modèle') + '</small></span></a>';
        });
        (d.salons || []).forEach(function (s) {
            html += '<a role="option" href="' + (s.isPrivate ? 'salons.html' : 'chat.html?theme=' + encodeURIComponent(s.slug)) + '">' +
                '<span class="ev-suggest-ico">' + esc(s.icon) + '</span>' +
                '<span class="ev-suggest-txt"><b>' + esc(s.name) + '</b><small>Salon' + (s.isPrivate ? ' VIP' : '') + '</small></span></a>';
        });
        html += '<a role="option" class="ev-suggest-all" href="modeles.html?q=' + encodeURIComponent(q) + '">Voir tous les résultats pour « ' + esc(q) + ' »</a>';
        liste.innerHTML = html;
        liste.hidden = false;
        champ.setAttribute('aria-expanded', 'true');
        actif = -1;
    }

    champ.addEventListener('input', function () { clearTimeout(attente); var q = champ.value.trim(); attente = setTimeout(function () { chercher(q); }, 200); });
    champ.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (liste.hidden) chercher(champ.value.trim()); else surligner(actif + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); surligner(actif - 1); }
        else if (e.key === 'Escape') { fermer(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            var it = items();
            if (actif >= 0 && it[actif]) { window.location.href = it[actif].href; return; }
            var q = champ.value.trim();
            if (q) window.location.href = 'modeles.html?q=' + encodeURIComponent(q);
        }
    });
    document.addEventListener('click', function (e) { if (!boite.contains(e.target)) fermer(); });
})();
