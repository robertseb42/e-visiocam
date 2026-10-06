// ============================================================
// E-VISIOCAM — le couple qui danse (accueil, à gauche de « Trouvez votre ambiance »)
// Cinq images détourées enchaînées en fondu (boucle de 8 s), sur une petite piste disco
// comme le danseur : il l'attend → elle court vers lui → elle s'élance → il l'attrape →
// il la hisse en l'air (le porté) → pause, et ça recommence.
// Allumé / éteint avec le même bouton que la boule à facettes (classe « evc-disco »).
// Seulement s'il y a la place à gauche ; image fixe (le porté) si l'appareil demande moins
// d'animations ; jamais cliquable (ne gêne rien).
// ============================================================
(function () {
    'use strict';
    if (document.getElementById('evcCouple')) return;
    var RATIO = 370 / 520, T = '8s';
    var etapes = [['dd-homme', 'ecHomme'], ['dd-court', 'ecCourt'], ['dd-saut', 'ecSaut'], ['dd-prise', 'ecPrise'], ['dd-porte', 'ecPorte']];
    var css = document.createElement('style');
    css.textContent =
        '#evcCouple{position:absolute;z-index:4;pointer-events:none;display:none}' +
        'html:not(.evc-disco) #evcCouple{display:none!important}' +
        // Piste disco (mêmes dalles colorées que le danseur), sous le danseur
        '#evcCouple .ec-piste{position:absolute;left:24%;width:52%;bottom:-6%;height:24%;overflow:visible}' +
        '#evcCouple .ec-dalle{animation:ecDalle 2.32s steps(1) infinite}' +
        '#evcCouple .ec-dalle.b{animation-delay:-.58s}#evcCouple .ec-dalle.c{animation-delay:-1.16s}#evcCouple .ec-dalle.d{animation-delay:-1.74s}' +
        '#evcCouple .ec-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;animation-duration:' + T + ';animation-iteration-count:infinite;animation-timing-function:ease-in-out;' +
            'filter:drop-shadow(0 0 14px rgba(255,255,255,.35)) drop-shadow(0 10px 16px rgba(0,0,0,.5))}' +
        '#evcCouple .ec-eclat{position:absolute;top:var(--y);left:var(--x);width:12px;height:12px;opacity:0;animation:ecEclat ' + T + ' ease-in-out infinite;animation-delay:var(--r)}' +
        '#evcCouple .ec-eclat::before,#evcCouple .ec-eclat::after{content:"";position:absolute;left:5px;top:0;width:2px;height:12px;border-radius:2px;background:#fff;box-shadow:0 0 8px #ffe500}' +
        '#evcCouple .ec-eclat::after{transform:rotate(90deg)}' +
        '@keyframes ecDalle{0%{fill:#ff1680}25%{fill:#ffe500}50%{fill:#22d3ee}75%{fill:#a855f7}}' +
        // Lui : il l'attend accroupi pendant qu'elle court et saute, laisse la place à « il l'attrape », revient en fin de boucle
        '@keyframes ecHomme{0%,28.5%{opacity:1}31.5%,88%{opacity:0}94%,100%{opacity:1}}' +
        // Elle court depuis la gauche, petites foulées
        '@keyframes ecCourt{0%{opacity:0;transform:translate(-46%,0)}3%{opacity:1}6%{transform:translate(-36%,-2.5%)}10%{transform:translate(-26%,0)}14%{transform:translate(-16%,-2.5%)}18%{transform:translate(-6%,0)}20%{opacity:1;transform:translate(0,0)}23%,100%{opacity:0;transform:translate(1%,-1%)}}' +
        // Elle s'élance (en arc)
        '@keyframes ecSaut{0%,19%{opacity:0;transform:translate(-3%,3%)}22.5%{opacity:1;transform:translate(-1%,-1%)}26%{transform:translate(1%,-4%)}29%{opacity:1;transform:translate(2%,-2%)}32.5%,100%{opacity:0;transform:translate(2%,0)}}' +
        // Il l'attrape
        '@keyframes ecPrise{0%,28.5%{opacity:0;transform:translateY(-1%)}31.5%{opacity:1;transform:translateY(0)}35%{transform:translateY(1%)}38%{opacity:1;transform:translateY(0)}41.5%,100%{opacity:0;transform:translateY(-2%)}}' +
        // Il la hisse : elle monte au-dessus de lui, puis le porté tenu
        '@keyframes ecPorte{0%,37.5%{opacity:0;transform:translateY(9%)}42%{opacity:1;transform:translateY(0)}50%{transform:translateY(-1.6%)}60%{transform:translateY(0)}70%{transform:translateY(-1.6%)}80%{opacity:1;transform:translateY(0)}86%,100%{opacity:0;transform:translateY(2%)}}' +
        '@keyframes ecEclat{0%,40%{opacity:0;transform:scale(.3) rotate(0)}47%{opacity:1;transform:scale(1) rotate(45deg)}54%,100%{opacity:0;transform:scale(.3) rotate(90deg)}}' +
        '@media (prefers-reduced-motion:reduce){#evcCouple *{animation:none!important}#evcCouple .ec-img{opacity:0}#evcCouple .ec-img.fixe{opacity:1}#evcCouple .ec-eclat{display:none}}';
    document.head.appendChild(css);

    var html = '<svg class="ec-piste" viewBox="0 0 200 100" aria-hidden="true">' +
        '<defs><radialGradient id="ecSpot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
        '<g transform="translate(100 50) scale(1 .34)"><g transform="rotate(45)">' +
        '<rect class="ec-dalle a" x="-52" y="-52" width="50" height="50" rx="5"/><rect class="ec-dalle b" x="2" y="-52" width="50" height="50" rx="5"/>' +
        '<rect class="ec-dalle c" x="-52" y="2" width="50" height="50" rx="5"/><rect class="ec-dalle d" x="2" y="2" width="50" height="50" rx="5"/></g></g>' +
        '<ellipse cx="100" cy="50" rx="92" ry="26" fill="url(#ecSpot)"/></svg>';
    etapes.forEach(function (e) {
        html += '<img class="ec-img' + (e[0] === 'dd-porte' ? ' fixe' : '') + '" src="' + e[0] + '.webp?v=4" alt="" width="520" height="370" decoding="async" style="animation-name:' + e[1] + '">';
    });
    [[64, 2, 0], [92, 8, -.25], [24, 6, -.5], [80, 22, -.75]].forEach(function (e) {
        html += '<span class="ec-eclat" style="--x:' + e[0] + '%;--y:' + e[1] + '%;--r:' + e[2] + 's"></span>';
    });
    var el = document.createElement('div');
    el.id = 'evcCouple'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = html;
    document.body.appendChild(el);

    // En bas à gauche, posé sur le pied de page (comme la radio à droite), dans la place libre à gauche
    // du contenu (la colonne de gauche ne compte que si son contenu descend jusque-là)
    function placer() {
        var cible = document.getElementById('ambiances');
        var pied = document.querySelector('footer.ev-footer');
        if (!cible || !pied || window.innerWidth < 1280) { el.style.display = 'none'; return; }
        var r = cible.getBoundingClientRect(), gauche = 0;
        var basPage = pied.getBoundingClientRect().top + scrollY;
        var aside = document.querySelector('aside');
        if (aside && getComputedStyle(aside).display !== 'none') {
            var bas = 0;
            Array.prototype.forEach.call(aside.querySelectorAll('*'), function (n) {
                var b = n.getBoundingClientRect();
                if (b.width && b.height && getComputedStyle(n).visibility !== 'hidden') bas = Math.max(bas, b.bottom + scrollY);
            });
            // hauteur maximale du couple (300 px de large) : si la colonne descend jusque-là, on se met à sa droite
            if (bas > basPage - 300 * RATIO - 26) gauche = aside.getBoundingClientRect().right;
        }
        var place = r.left - gauche;
        var w = Math.min(300, place - 20);
        if (w < 130) { el.style.display = 'none'; return; }
        var h = w * RATIO;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = Math.round(gauche + (place - w) / 2) + 'px';
        el.style.top = Math.round(basPage - h - 16) + 'px';
        el.style.display = 'block';
    }
    window.addEventListener('resize', placer);
    window.addEventListener('load', placer);
    setTimeout(placer, 300); setTimeout(placer, 1500); setTimeout(placer, 4000);   // après le chargement des salons et du bandeau « Qui est là ? »
    if (window.ResizeObserver) new ResizeObserver(placer).observe(document.body);
    if (window.MutationObserver) new MutationObserver(placer).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
})();
