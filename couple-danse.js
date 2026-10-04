// ============================================================
// E-VISIOCAM — le couple qui danse (accueil, à gauche de « Trouvez votre ambiance »)
// Image détourée en deux calques : le couple (couple-danse.webp) et l'eau devant lui (couple-eau.webp).
// Animation du porté : il la hisse au-dessus de l'eau, gerbe d'eau, gouttes, scintillements. Seulement s'il y a la place à gauche ;
// immobile si l'appareil demande moins d'animations ; jamais cliquable (ne gêne rien).
// ============================================================
(function () {
    'use strict';
    if (document.getElementById('evcCouple')) return;
    var RATIO = 433 / 420, CYCLE = '6.4s';
    // Le porté : elle arrive dans ses bras (couple plus bas, penché), il la hisse au-dessus de l'eau,
    // la gerbe d'eau éclate, il la tient en l'air un moment, puis la redescend… et on recommence.
    var css = document.createElement('style');
    css.textContent =
        '#evcCouple{position:absolute;z-index:4;pointer-events:none;display:none}' +
        '#evcCouple .ec-halo{position:absolute;left:2%;right:2%;bottom:2%;height:22%;border-radius:50%;background:radial-gradient(closest-side,rgba(34,211,238,.5),rgba(34,211,238,0));filter:blur(5px);animation:ecHalo ' + CYCLE + ' ease-in-out infinite}' +
        // le bas du couple disparaît sous l'eau quand il descend (rien ne dépasse sous le bassin)
        '#evcCouple .ec-clip{position:absolute;inset:0;clip-path:inset(-40% -15% 4% -15%)}' +
        '#evcCouple .ec-porte{position:absolute;inset:0;transform-origin:42% 86%;animation:ecPorte ' + CYCLE + ' cubic-bezier(.45,0,.25,1) infinite}' +
        '#evcCouple .ec-eau{position:absolute;inset:0;animation:ecVague 3.2s ease-in-out infinite}' +
        '#evcCouple img{display:block;position:absolute;inset:0;width:100%;height:100%;object-fit:contain}' +
        '#evcCouple .ec-porte img{filter:drop-shadow(0 0 12px rgba(125,211,252,.25)) drop-shadow(0 10px 14px rgba(0,0,0,.4))}' +
        '#evcCouple .ec-goutte{position:absolute;top:var(--y);left:var(--x);width:4px;height:7px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:linear-gradient(#fff,#7dd3fc);opacity:0;animation:ecGoutte ' + CYCLE + ' linear infinite;animation-delay:var(--r)}' +
        '#evcCouple .ec-gerbe{position:absolute;left:var(--x);top:84%;width:5px;height:5px;border-radius:50%;background:#e0f7ff;box-shadow:0 0 6px #7dd3fc;opacity:0;animation:ecGerbe ' + CYCLE + ' ease-out infinite}' +
        '#evcCouple .ec-eclat{position:absolute;top:var(--y);left:var(--x);width:10px;height:10px;opacity:0;animation:ecEclat 2.2s ease-in-out infinite;animation-delay:var(--r)}' +
        '#evcCouple .ec-eclat::before,#evcCouple .ec-eclat::after{content:"";position:absolute;left:4px;top:0;width:2px;height:10px;border-radius:2px;background:#fff;box-shadow:0 0 6px #7dd3fc}' +
        '#evcCouple .ec-eclat::after{transform:rotate(90deg)}' +
        // 0-18 % : dans ses bras, en bas · 18-36 % : il la hisse · 36-74 % : le porté, en l'air · 74-100 % : il la redescend
        '@keyframes ecPorte{0%,12%{transform:translateY(11%) rotate(6deg)}30%{transform:translateY(-1.5%) rotate(-1.5deg)}36%{transform:translateY(0) rotate(0)}55%{transform:translateY(-1%) rotate(-.6deg)}74%{transform:translateY(0) rotate(0)}100%{transform:translateY(11%) rotate(6deg)}}' +
        '@keyframes ecHalo{0%,20%{opacity:.4;transform:scaleX(.9)}34%{opacity:1;transform:scaleX(1.12)}60%{opacity:.75;transform:scaleX(1)}100%{opacity:.4;transform:scaleX(.9)}}' +
        '@keyframes ecVague{0%,100%{transform:translateY(0) scaleX(1)}50%{transform:translateY(1.2%) scaleX(1.01)}}' +
        '@keyframes ecGerbe{0%,24%{opacity:0;transform:translate(0,0)}28%{opacity:1}44%{opacity:.9;transform:translate(var(--dx),var(--h))}56%{opacity:0;transform:translate(calc(var(--dx) * 1.4),calc(var(--h) * .2))}100%{opacity:0}}' +
        '@keyframes ecGoutte{0%,38%{opacity:0;transform:translateY(0)}42%{opacity:.95}68%{opacity:.7;transform:translateY(var(--c))}70%,100%{opacity:0;transform:translateY(var(--c))}}' +
        '@keyframes ecEclat{0%,100%{opacity:0;transform:scale(.3) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}' +
        '@media (prefers-reduced-motion:reduce){#evcCouple *{animation:none!important}#evcCouple .ec-goutte,#evcCouple .ec-gerbe,#evcCouple .ec-eclat{display:none}}';
    document.head.appendChild(css);

    var html = '<div class="ec-halo"></div>' +
        '<div class="ec-clip"><div class="ec-porte"><img src="couple-danse.webp" alt="" width="420" height="433" decoding="async">';
    // Gouttes qui tombent de ses bras et de ses jambes pendant le porté (elles suivent le couple)
    [[56, 22, 48], [60, 24, 46], [64, 22, 50], [33, 50, 30], [44, 44, 36], [66, 52, 28], [75, 52, 30], [84, 60, 22], [88, 58, 25]].forEach(function (g, i) {
        html += '<span class="ec-goutte" style="--x:' + g[0] + '%;--y:' + g[1] + '%;--c:' + g[2] * 2.2 + 'px;--r:' + (-(i % 4) * 0.18).toFixed(2) + 's"></span>';
    });
    html += '</div></div><div class="ec-eau"><img src="couple-eau.webp" alt="" width="420" height="433" decoding="async"></div>';
    // La gerbe d'eau quand il la hisse
    [[18, -10, -46], [26, -6, -64], [34, -3, -78], [42, 0, -88], [50, 2, -80], [58, 4, -70], [66, 7, -58], [74, 10, -44], [82, 12, -34]].forEach(function (g) {
        html += '<span class="ec-gerbe" style="--x:' + g[0] + '%;--dx:' + g[1] + 'px;--h:' + g[2] + 'px"></span>';
    });
    [[61, 6], [70, 14], [92, 70], [10, 78]].forEach(function (e, i) {
        html += '<span class="ec-eclat" style="--x:' + e[0] + '%;--y:' + e[1] + '%;--r:' + (-i * 0.6) + 's"></span>';
    });
    var el = document.createElement('div');
    el.id = 'evcCouple'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = html;
    document.body.appendChild(el);

    // Place libre à gauche des salons (la colonne de gauche ne compte que si son contenu descend jusque-là)
    function placer() {
        var cible = document.getElementById('ambiances');
        if (!cible || window.innerWidth < 1280) { el.style.display = 'none'; return; }
        var r = cible.getBoundingClientRect(), haut = r.top + scrollY, gauche = 0;
        var aside = document.querySelector('aside');
        if (aside && getComputedStyle(aside).display !== 'none') {
            var bas = 0;
            Array.prototype.forEach.call(aside.querySelectorAll('*'), function (n) {
                var b = n.getBoundingClientRect();
                if (b.width && b.height && getComputedStyle(n).visibility !== 'hidden') bas = Math.max(bas, b.bottom + scrollY);
            });
            if (bas > haut - 10) gauche = aside.getBoundingClientRect().right;
        }
        var place = r.left - gauche;
        var w = Math.min(230, place - 24);
        if (w < 130) { el.style.display = 'none'; return; }
        var h = w * RATIO;
        el.style.width = w + 'px'; el.style.height = h + 'px';
        el.style.left = Math.round(gauche + (place - w) / 2) + 'px';
        el.style.top = Math.round(haut + Math.max(0, (r.height - h) / 2)) + 'px';
        el.style.display = 'block';
    }
    window.addEventListener('resize', placer);
    window.addEventListener('load', placer);
    setTimeout(placer, 300); setTimeout(placer, 1500); setTimeout(placer, 4000);   // après le chargement des salons et du bandeau « Qui est là ? »
    if (window.ResizeObserver) new ResizeObserver(placer).observe(document.body);
})();
