// ============================================================
// E-VISIOCAM — le couple qui danse (accueil, à gauche de « Trouvez votre ambiance »)
// Six images détourées enchaînées en boucle (9 s) :
//   elle court vers lui → elle s'élance → il l'attrape → il la hisse en l'air (le porté,
//   dans un nuage de fumée de scène) → ils s'enlacent → pause, et ça recommence.
// Seulement s'il y a la place à gauche ; image fixe (le porté) si l'appareil demande
// moins d'animations ; jamais cliquable (ne gêne rien).
// ============================================================
(function () {
    'use strict';
    if (document.getElementById('evcCouple')) return;
    var RATIO = 395 / 480, T = '9s';
    // [fichier, animation]
    var etapes = [['d-run-homme', 'ecRunH'], ['d-run-femme', 'ecRunF'], ['d-saut', 'ecSaut'], ['d-prise', 'ecPrise'], ['d-porte', 'ecPorte'], ['d-calin', 'ecCalin']];
    var css = document.createElement('style');
    css.textContent =
        '#evcCouple{position:absolute;z-index:4;pointer-events:none;display:none;overflow:hidden}' +
        '#evcCouple .ec-spot{position:absolute;left:8%;right:8%;bottom:0;height:16%;border-radius:50%;background:radial-gradient(closest-side,rgba(255,229,0,.35),rgba(255,22,128,.15) 60%,transparent);filter:blur(3px);animation:ecSpot 2.25s ease-in-out infinite}' +
        '#evcCouple .ec-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:0;animation-duration:' + T + ';animation-iteration-count:infinite;animation-timing-function:linear;' +
            'filter:drop-shadow(0 0 10px rgba(255,255,255,.22)) drop-shadow(0 8px 12px rgba(0,0,0,.45))}' +
        // Fumée de scène : des nappes douces (pas de bande), assez haut pour cacher le bas du porté
        '#evcCouple .ec-fumee{position:absolute;left:-10%;right:-10%;bottom:-6%;height:56%;opacity:0;animation:ecFumee ' + T + ' ease-in-out infinite;filter:blur(8px);' +
            'background:radial-gradient(24% 30% at 30% 42%,rgba(246,242,255,.92),transparent 70%),radial-gradient(26% 30% at 50% 36%,rgba(250,248,255,.95),transparent 70%),' +
            'radial-gradient(22% 28% at 68% 46%,rgba(240,240,255,.9),transparent 70%),radial-gradient(30% 34% at 16% 70%,rgba(236,236,255,.85),transparent 72%),' +
            'radial-gradient(32% 36% at 50% 66%,rgba(246,242,255,.92),transparent 72%),radial-gradient(30% 34% at 84% 72%,rgba(236,236,255,.85),transparent 72%),' +
            'radial-gradient(70% 34% at 50% 100%,rgba(240,240,255,.85),transparent 80%)}' +
        'html[data-theme="light"] #evcCouple .ec-fumee{filter:blur(8px) brightness(.8) saturate(1.8) hue-rotate(-20deg)}' +
        '#evcCouple .ec-eclat{position:absolute;top:var(--y);left:var(--x);width:10px;height:10px;opacity:0;animation:ecEclat ' + T + ' ease-in-out infinite;animation-delay:var(--r)}' +
        '#evcCouple .ec-eclat::before,#evcCouple .ec-eclat::after{content:"";position:absolute;left:4px;top:0;width:2px;height:10px;border-radius:2px;background:#fff;box-shadow:0 0 6px #ffe500}' +
        '#evcCouple .ec-eclat::after{transform:rotate(90deg)}' +
        // Lui, accroupi, l'attend (et réapparaît en fin de boucle)
        '@keyframes ecRunH{0%,16%{opacity:1}17.5%,90%{opacity:0}95%,100%{opacity:1}}' +
        // Elle court depuis la gauche, en petites foulées
        '@keyframes ecRunF{0%{opacity:0;transform:translate(-46%,0)}1.5%{opacity:1}4%{transform:translate(-36%,-2%)}7.5%{transform:translate(-26%,0)}11%{transform:translate(-15%,-2%)}14.5%{transform:translate(-5%,0)}16%{opacity:1;transform:translate(0,0)}17.5%,100%{opacity:0;transform:translate(0,0)}}' +
        // Elle s'élance
        '@keyframes ecSaut{0%,16%{opacity:0;transform:translate(-4%,2%)}17.5%{opacity:1}21%{transform:translate(0,-3%)}24%{opacity:1;transform:translate(1%,-1%)}25.5%,100%{opacity:0}}' +
        // Il l'attrape
        '@keyframes ecPrise{0%,24%{opacity:0}25.5%{opacity:1;transform:translateY(0)}29%{transform:translateY(1%)}32%{opacity:1}33.5%,100%{opacity:0}}' +
        // Il la hisse en l'air, le porté tenu
        '@keyframes ecPorte{0%,32%{opacity:0;transform:translateY(5%)}33.5%{opacity:1}37%{transform:translateY(-1%)}48%{transform:translateY(0)}56%{transform:translateY(-1.2%)}61%{opacity:1;transform:translateY(0)}62.5%,100%{opacity:0}}' +
        // Ils s'enlacent, petit balancement, puis disparaissent
        '@keyframes ecCalin{0%,61%{opacity:0;transform:rotate(0)}62.5%{opacity:1}70%{transform:rotate(-1.5deg)}78%{transform:rotate(1deg)}84%{opacity:1;transform:rotate(0)}88%,100%{opacity:0}}' +
        // Fumée de scène qui monte pendant le porté
        '@keyframes ecFumee{0%,28%{opacity:0;transform:translateY(30%) scaleX(.9)}34%{opacity:.95;transform:translateY(0) scaleX(1)}47%{transform:translateY(-4%) scaleX(1.06)}61%{opacity:.95;transform:translateY(0) scaleX(1)}68%,100%{opacity:0;transform:translateY(25%) scaleX(.95)}}' +
        '@keyframes ecSpot{0%,100%{opacity:.6;transform:scaleX(.92)}50%{opacity:1;transform:scaleX(1.06)}}' +
        '@keyframes ecEclat{0%,34%{opacity:0;transform:scale(.3) rotate(0)}40%{opacity:1;transform:scale(1) rotate(45deg)}46%,100%{opacity:0;transform:scale(.3) rotate(90deg)}}' +
        '@media (prefers-reduced-motion:reduce){#evcCouple *{animation:none!important}#evcCouple .ec-img{opacity:0}#evcCouple .ec-img.fixe{opacity:1}#evcCouple .ec-fumee{opacity:1}#evcCouple .ec-eclat{display:none}}';
    document.head.appendChild(css);

    var html = '<div class="ec-spot"></div>';
    etapes.forEach(function (e) {
        html += '<img class="ec-img' + (e[0] === 'd-porte' ? ' fixe' : '') + '" src="' + e[0] + '.webp" alt="" width="480" height="395" decoding="async" style="animation-name:' + e[1] + '">';
    });
    html += '<div class="ec-fumee"></div>';
    [[58, 4, 0], [86, 16, -.3], [40, 22, -.6], [70, 30, -.9]].forEach(function (e) {
        html += '<span class="ec-eclat" style="--x:' + e[0] + '%;--y:' + e[1] + '%;--r:' + e[2] + 's"></span>';
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
        var w = Math.min(280, place - 20);
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
