// ============================================================
// E-VISIOCAM — danseur disco dans le Salon Musique
//   EvcDanseur.afficher(conteneur, decalage)   le fait danser dans le coin bas droit du conteneur
//   EvcDanseur.cacher()
// Un bouton 🕺 (data-danseur-toggle) l'allume ou l'éteint (choix gardé : « evc-danseur »).
// Masqué sur téléphone ; immobile si l'appareil demande moins d'animations.
// ============================================================
(function () {
    var CLE = 'evc-danseur';
    var css = document.createElement('style');
    css.textContent =
        '.evc-dz{position:absolute;right:14px;z-index:5;pointer-events:none;width:var(--dz);height:calc(var(--dz) * 1.72);--dz:110px;--t:.58s}' +
        '@media (max-width:1023px){.evc-dz{display:none}}' +
        '.evc-dz .piste{position:absolute;left:0;bottom:0;width:100%;height:calc(var(--dz) * .5);overflow:visible}' +
        '.evc-dz .sens{position:absolute;left:0;right:0;bottom:calc(var(--dz) * .1);height:calc(var(--dz) * 1.52);transform-origin:50% 100%;animation:evcDzSens calc(var(--t) * 16) steps(1) infinite}' +
        '.evc-dz .gars{width:100%;height:100%;transform-origin:50% 100%;animation:evcDzDanse calc(var(--t) * 2) ease-in-out infinite}' +
        '.evc-dz img{display:block;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 0 10px rgba(255,255,255,.3)) drop-shadow(0 8px 12px rgba(0,0,0,.45))}' +
        '.evc-dz .dalle{animation:evcDzDalle calc(var(--t) * 4) steps(1) infinite}' +
        '.evc-dz .dalle.b{animation-delay:calc(var(--t) * -1)}.evc-dz .dalle.c{animation-delay:calc(var(--t) * -2)}.evc-dz .dalle.d{animation-delay:calc(var(--t) * -3)}' +
        '@keyframes evcDzSens{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}}' +
        '@keyframes evcDzDanse{0%,100%{transform:translateY(0) rotate(-4deg)}25%{transform:translateY(-6px) rotate(0deg)}50%{transform:translateY(0) rotate(4deg)}75%{transform:translateY(-6px) rotate(0deg)}}' +
        '@keyframes evcDzDalle{0%{fill:#ff1680}25%{fill:#ffe500}50%{fill:#22d3ee}75%{fill:#a855f7}}' +
        '@media (prefers-reduced-motion:reduce){.evc-dz *{animation:none!important}}' +
        '@media (min-width:1024px){.evc-dz-place{padding-right:140px!important}}' +
        '[data-danseur-toggle]{display:none}[data-danseur-toggle].visible{display:flex}' +
        '[data-danseur-toggle][aria-pressed="false"]{opacity:.45;filter:grayscale(1)}';
    document.head.appendChild(css);

    var HTML = '<svg class="piste" viewBox="0 0 200 100" aria-hidden="true">' +
        '<defs><radialGradient id="evcDzSpot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
        '<g transform="translate(100 72) scale(1 .34)"><g transform="rotate(45)">' +
        '<rect class="dalle a" x="-52" y="-52" width="50" height="50" rx="5"/><rect class="dalle b" x="2" y="-52" width="50" height="50" rx="5"/>' +
        '<rect class="dalle c" x="-52" y="2" width="50" height="50" rx="5"/><rect class="dalle d" x="2" y="2" width="50" height="50" rx="5"/></g></g>' +
        '<ellipse cx="100" cy="72" rx="80" ry="22" fill="url(#evcDzSpot)"/></svg>' +
        '<div class="sens"><div class="gars"><img src="danseur-disco.webp" alt="" width="342" height="520" decoding="async"></div></div>';

    var el = null, cible = null, place = null, voulu = false, opts = {};
    function allume() { try { return localStorage.getItem(CLE) !== 'off'; } catch (e) { return true; } }

    function majBouton() {
        document.querySelectorAll('[data-danseur-toggle]').forEach(function (b) {
            b.classList.toggle('visible', voulu);
            var on = allume();
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.title = on ? 'Arrêter le danseur' : 'Faire danser le danseur';
            b.setAttribute('aria-label', b.title);
        });
    }

    function poser() {
        retirer();
        if (!voulu || !cible || !allume()) return;
        if (getComputedStyle(cible).position === 'static') cible.style.position = 'relative';
        el = document.createElement('div');
        el.className = 'evc-dz';
        el.setAttribute('aria-hidden', 'true');
        el.style.bottom = (opts.bas || 0) + 'px';
        el.innerHTML = HTML;
        cible.appendChild(el);
        if (place) place.classList.add('evc-dz-place');
    }
    function retirer() {
        if (el) { el.remove(); el = null; }
        if (place) place.classList.remove('evc-dz-place');
    }

    // conteneur : élément où il danse ; o.bas : marge du bas (px) ; o.place : élément à décaler pour ne pas cacher le texte
    function afficher(conteneur, o) {
        opts = o || {};
        cible = conteneur; place = opts.place || null; voulu = true;
        poser(); majBouton();
    }
    function cacher() { voulu = false; retirer(); majBouton(); }

    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-danseur-toggle]');
        if (!b) return;
        e.preventDefault();
        try { localStorage.setItem(CLE, allume() ? 'off' : 'on'); } catch (er) {}
        poser(); majBouton();
    });

    window.EvcDanseur = { afficher: afficher, cacher: cacher };
})();
