// ============================================================
// E-VISIOCAM — « Votre ville » → département (inscription, Mon compte)
// ------------------------------------------------------------
//   EvcVille.monter(conteneur, { valeur: '42', ville: {nom, lat, lon}, onChange(code, ville) })
// Le membre tape sa ville (ou son code postal) ; les suggestions viennent de l'annuaire
// officiel des communes (geo.api.gouv.fr). On garde le département et la ville (nom + centre
// de la commune, jamais d'adresse) pour chercher « autour de moi » avec une distance approximative.
// Le nom de la ville n'est montré aux autres que si le membre le choisit (Mon compte).
// ============================================================
(function () {
    'use strict';
    if (window.EvcVille) return;
    var API = 'https://geo.api.gouv.fr/communes';

    function nomDep(c) { return (window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[c]) || ''; }
    function libelle(c) { return c ? c + ' · ' + nomDep(c) : ''; }

    var css = document.createElement('style');
    css.textContent =
        '.evc-ville{position:relative}' +
        '.evc-ville-liste{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:60;margin:0;padding:4px;list-style:none;border-radius:12px;background:#1c1c20;border:1px solid #3b3b43;box-shadow:0 12px 30px rgba(0,0,0,.45);max-height:240px;overflow:auto}' +
        'html[data-theme="light"] .evc-ville-liste{background:#fff;border-color:#e2e8f0;box-shadow:0 12px 30px rgba(15,23,42,.15)}' +
        '.evc-ville-liste li{padding:9px 12px;border-radius:9px;cursor:pointer;font-size:13.5px;display:flex;justify-content:space-between;gap:10px}' +
        '.evc-ville-liste li small{opacity:.65;white-space:nowrap}' +
        '.evc-ville-liste li[aria-selected="true"],.evc-ville-liste li:hover{background:rgba(255,229,0,.16)}' +
        'html[data-theme="light"] .evc-ville-liste li[aria-selected="true"],html[data-theme="light"] .evc-ville-liste li:hover{background:rgba(233,30,99,.08)}' +
        '.evc-ville-choix{display:inline-flex;align-items:center;gap:8px;margin-top:8px;padding:5px 10px;border-radius:999px;font-size:12.5px;font-weight:700;background:rgba(255,229,0,.16)}' +
        'html[data-theme="light"] .evc-ville-choix{background:rgba(233,30,99,.08)}' +
        '.evc-ville-choix button{border:0;background:none;color:inherit;opacity:.6;cursor:pointer;font-size:13px;padding:0}' +
        '.evc-ville-aide{margin:6px 0 0;font-size:11px;opacity:.65;line-height:1.4}';
    document.head.appendChild(css);

    function monter(conteneur, opts) {
        opts = opts || {};
        if (!conteneur) return null;
        var code = opts.valeur || '', ville = opts.ville === undefined ? undefined : (opts.ville || null);
        conteneur.classList.add('evc-ville');
        conteneur.innerHTML =
            '<input type="text" autocomplete="off" spellcheck="false" placeholder="Ex. : Saint-Étienne ou 42000" aria-autocomplete="list" role="combobox" aria-expanded="false">' +
            '<ul class="evc-ville-liste" role="listbox" hidden></ul>' +
            '<div class="evc-ville-sortie"></div>' +
            '<p class="evc-ville-aide">🔒 Votre ville sert à trouver les membres proches de chez vous (distance approximative, jamais votre adresse). Sur votre profil, seul votre <strong>département</strong> apparaît, sauf si vous choisissez d’afficher votre ville. Facultatif.</p>';
        var champ = conteneur.querySelector('input'), liste = conteneur.querySelector('ul'), sortie = conteneur.querySelector('.evc-ville-sortie');
        if (opts.classeChamp) champ.className = opts.classeChamp;
        var id = 'evcVille' + Math.random().toString(36).slice(2, 7);
        liste.id = id; champ.setAttribute('aria-controls', id);
        if (opts.label) champ.setAttribute('aria-label', opts.label);
        var resultats = [], actif = -1, minuterie = null, derniere = '';

        function afficherChoix() {
            sortie.textContent = '';
            if (!code) return;
            var b = document.createElement('span'); b.className = 'evc-ville-choix';
            b.appendChild(document.createTextNode('📍 ' + (ville ? ville.nom + ' · ' : '') + libelle(code)));
            var x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.title = 'Retirer'; x.setAttribute('aria-label', 'Retirer le département');
            x.onclick = function () { ville = null; choisir(''); champ.value = ''; champ.focus(); };
            b.appendChild(x); sortie.appendChild(b);
        }
        function fermer() { liste.hidden = true; champ.setAttribute('aria-expanded', 'false'); actif = -1; }
        function dessiner() {
            liste.textContent = '';
            if (!resultats.length) { fermer(); return; }
            resultats.forEach(function (r, i) {
                var li = document.createElement('li'); li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === actif ? 'true' : 'false');
                li.appendChild(document.createTextNode(r.nom));
                var s = document.createElement('small'); s.textContent = libelle(r.dep); li.appendChild(s);
                li.addEventListener('mousedown', function (e) { e.preventDefault(); prendre(i); });
                liste.appendChild(li);
            });
            liste.hidden = false; champ.setAttribute('aria-expanded', 'true');
        }
        function choisir(c) { code = c || ''; afficherChoix(); if (opts.onChange) opts.onChange(code, ville || null); }
        function prendre(i) {
            var r = resultats[i]; if (!r) return;
            champ.value = r.nom; ville = r.lat != null ? { nom: r.nom, lat: r.lat, lon: r.lon } : null; choisir(r.dep); resultats = []; fermer();
        }
        async function chercher(q) {
            q = q.trim(); if (q === derniere) return; derniere = q;
            if (q.length < 2) { resultats = []; dessiner(); return; }
            var url = /^\d{5}$/.test(q) ? API + '?codePostal=' + q : API + '?nom=' + encodeURIComponent(q) + '&boost=population&limit=7';
            try {
                var r = await fetch(url + '&fields=nom,codeDepartement,centre', { credentials: 'omit' });
                var d = r.ok ? await r.json() : [];
                if (q !== derniere) return;
                resultats = (d || []).filter(function (c) { return nomDep(c.codeDepartement); }).slice(0, 7).map(function (c) { var xy = c.centre && c.centre.coordinates; return { nom: c.nom, dep: c.codeDepartement, lon: xy ? xy[0] : null, lat: xy ? xy[1] : null }; });
                actif = resultats.length ? 0 : -1; dessiner();
            } catch (e) { resultats = []; dessiner(); }
        }
        champ.addEventListener('input', function () { clearTimeout(minuterie); minuterie = setTimeout(function () { chercher(champ.value); }, 220); });
        champ.addEventListener('keydown', function (e) {
            if (liste.hidden) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); actif = Math.min(resultats.length - 1, actif + 1); dessiner(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); actif = Math.max(0, actif - 1); dessiner(); }
            else if (e.key === 'Enter') { if (actif >= 0) { e.preventDefault(); prendre(actif); } }
            else if (e.key === 'Escape') fermer();
        });
        champ.addEventListener('blur', function () { setTimeout(fermer, 120); });
        afficherChoix();
        return { valeur: function () { return code; }, ville: function () { return ville; }, definir: function (c, v) { code = c || ''; if (v !== undefined) ville = v || null; afficherChoix(); } };
    }
    window.EvcVille = { monter: monter, libelle: libelle };
})();
