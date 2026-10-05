// Extrait de aide.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// CENTRE D'AIDE — recherche instantanée, surlignage, liens directs vers une question
// ============================================================
(function () {
    var q = document.getElementById('aideQ'), effacer = document.getElementById('aideEffacer');
    var fiches = [].slice.call(document.querySelectorAll('.aide details'));
    var total = fiches.length;
    var norm = function (s) { return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    var origine = fiches.map(function (d) { return d.querySelector('.q').textContent; });

    function surligner(d, i, mots) {
        var el = d.querySelector('.q'), t = origine[i];
        if (!mots.length) { el.textContent = t; return; }
        // repère les positions sur le texte sans accents, puis entoure le texte d'origine
        var n = norm(t), marques = [];
        mots.forEach(function (m) { var p = n.indexOf(m); while (p !== -1) { marques.push([p, p + m.length]); p = n.indexOf(m, p + m.length); } });
        if (!marques.length) { el.textContent = t; return; }
        marques.sort(function (a, b) { return a[0] - b[0]; });
        el.textContent = '';
        var pos = 0;
        marques.forEach(function (m) {
            if (m[0] < pos) return;
            el.appendChild(document.createTextNode(t.slice(pos, m[0])));
            var k = document.createElement('mark'); k.textContent = t.slice(m[0], m[1]); el.appendChild(k);
            pos = m[1];
        });
        el.appendChild(document.createTextNode(t.slice(pos)));
    }

    function filtrer() {
        var mots = norm(q.value).trim().split(/\s+/).filter(function (m) { return m.length > 1; });
        var n = 0;
        fiches.forEach(function (d, i) {
            var ok = mots.every(function (m) { return d.dataset.search.indexOf(m) !== -1; });
            d.hidden = !ok; if (ok) n++;
            surligner(d, i, ok ? mots : []);
            if (mots.length && ok && n <= 2) d.open = true;      // ouvre les meilleures réponses
            if (!mots.length) d.open = false;
        });
        document.querySelectorAll('.aide-section').forEach(function (s) { s.hidden = !s.querySelector('details:not([hidden])'); });
        document.querySelector('.aide-cartes').hidden = mots.length > 0;
        document.getElementById('aideVide').hidden = n !== 0;
        effacer.hidden = !q.value;
        document.getElementById('aideCompte').textContent = mots.length
            ? n + ' réponse' + (n > 1 ? 's' : '') + ' trouvée' + (n > 1 ? 's' : '')
            : total + ' réponses pour vous accompagner.';
    }
    var t = null;
    q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(filtrer, 120); });
    q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; filtrer(); } });
    effacer.addEventListener('click', function () { q.value = ''; filtrer(); q.focus(); });

    // Lien direct : aide.html#q-mot-de-passe ouvre la question ; aide.html?q=camera lance une recherche
    function ouvrirAncre() {
        var h = decodeURIComponent(location.hash.slice(1));
        if (!h) return;
        var d = document.getElementById(h);
        if (d && d.tagName === 'DETAILS') { d.open = true; setTimeout(function () { d.scrollIntoView({ behavior: 'smooth', block: 'start' }); d.querySelector('summary').focus({ preventScroll: true }); }, 60); }
    }
    window.addEventListener('hashchange', ouvrirAncre);
    var depart = new URLSearchParams(location.search).get('q');
    if (depart) { q.value = depart.slice(0, 80); filtrer(); }
    ouvrirAncre();

    // Mémorise la question ouverte dans l'adresse (sans recharger)
    fiches.forEach(function (d) {
        d.addEventListener('toggle', function () { if (d.open && !q.value) history.replaceState(null, '', '#' + d.id); });
    });

    // Copier le lien d'une réponse
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-lien]');
        if (!b) return;
        var url = location.origin + location.pathname + '#' + b.dataset.lien;
        var fait = function () { var x = b.innerHTML; b.innerHTML = '<i class="fa-solid fa-check"></i> Lien copié'; setTimeout(function () { b.innerHTML = x; }, 1600); };
        if (navigator.clipboard) navigator.clipboard.writeText(url).then(fait, fait); else fait();
    });
})();
