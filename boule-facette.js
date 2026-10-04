// ============================================================
// E-VISIOCAM — Boule à facettes (page d'accueil)
// ------------------------------------------------------------
// Une grande boule à facettes, suspendue en haut à droite, tourne sur elle-même.
// Ses reflets (petits carrés lumineux rose, or et blanc, nets près de la boule et flous
// au loin) balaient le FOND du site, derrière les encarts : bannières, cartes et panneaux
// restent parfaitement lisibles.
// Un bouton à côté de « clair / sombre » l'allume ou l'éteint (choix gardé : « evc-disco »).
// Mouvement réduit demandé par le système : tout reste immobile. Pause quand l'onglet est caché.
// Autre page : <script src="boule-facette.js" defer></script> + <button data-disco-toggle> dans l'en-tête.
// ============================================================
(function () {
    'use strict';
    var CLE = 'evc-disco';
    var reduit = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var actif = true;
    try { actif = localStorage.getItem(CLE) !== 'off'; } catch (e) {}

    // ---------- Styles : fond transparent pour laisser passer les reflets, contenu au-dessus ----------
    var css = document.createElement('style');
    css.textContent =
        'html.evc-disco{background:#111113}' +
        'html.evc-disco[data-theme="light"]{background:#eef1f6}' +
        // Toutes les pages : fond transparent pour laisser passer les reflets, qui restent derrière le contenu (z-index -1)
        'html.evc-disco body{background:transparent!important}' +
        'html.evc-disco .cam-layout,html.evc-disco .ev-footer{position:relative;z-index:1}' +
        '#evcDiscoReflets{position:fixed;inset:0;z-index:-1;pointer-events:none;width:100%;height:100%}' +
        '#evcDiscoBoule{position:fixed;top:0;right:var(--disco-droite);z-index:35;pointer-events:none;width:var(--disco-taille);height:calc(var(--disco-fil) + var(--disco-taille))}' +
        '#evcDiscoBoule{--disco-taille:190px;--disco-fil:96px;--disco-droite:14px}' +
        '@media (max-width:1600px){#evcDiscoBoule{--disco-taille:150px;--disco-fil:80px}}' +
        '@media (max-width:1100px){#evcDiscoBoule{--disco-taille:104px;--disco-fil:70px;--disco-droite:6px}}' +
        '@media (max-width:640px){#evcDiscoBoule{--disco-taille:52px;--disco-fil:60px;--disco-droite:4px}}' +
        '#evcDiscoBoule canvas{position:absolute;left:0;bottom:0;width:var(--disco-taille);height:var(--disco-taille);filter:drop-shadow(0 0 24px rgba(255,22,128,.28)) drop-shadow(0 10px 30px rgba(0,0,0,.5))}' +
        '#evcDiscoBoule .fil{position:absolute;left:50%;top:0;width:2px;margin-left:-1px;height:calc(var(--disco-fil) + 4px);background:linear-gradient(#5d5d68,#b9b9c4)}' +
        '#evcDiscoBoule .attache{position:absolute;left:50%;top:calc(var(--disco-fil) - 6px);width:10px;height:10px;margin-left:-5px;border-radius:3px;background:linear-gradient(#d9d9e0,#7d7d88)}' +
        // ---------- Danseur disco (image fournie, animée) ----------
        '#evcDanseur{position:fixed;right:14px;top:300px;z-index:34;pointer-events:none;width:var(--dz);height:calc(var(--dz) * 1.72);display:none}' +
        '#evcDanseur.place{display:block}' +
        // Taille et place calculées en JavaScript (placerDanseur) : sous la boule, dans la marge de droite
        '#evcDanseur{--dz:150px;--t:.58s}' +
        '#evcDanseur .piste{position:absolute;left:0;bottom:0;width:100%;height:calc(var(--dz) * .5);overflow:visible}' +
        '#evcDanseur .sens{position:absolute;left:0;right:0;bottom:calc(var(--dz) * .1);height:calc(var(--dz) * 1.52);transform-origin:50% 100%;animation:dzSens calc(var(--t) * 16) steps(1) infinite}' +
        '#evcDanseur .gars{width:100%;height:100%;transform-origin:50% 100%;animation:dzDanse calc(var(--t) * 2) ease-in-out infinite}' +
        '#evcDanseur img{display:block;width:100%;height:100%;object-fit:contain;object-position:50% 100%;filter:drop-shadow(0 0 14px rgba(255,255,255,.35)) drop-shadow(0 10px 16px rgba(0,0,0,.5))}' +
        '#evcDanseur .dalle{animation:dzDalle calc(var(--t) * 4) steps(1) infinite}' +
        '#evcDanseur .dalle.b{animation-delay:calc(var(--t) * -1)}#evcDanseur .dalle.c{animation-delay:calc(var(--t) * -2)}#evcDanseur .dalle.d{animation-delay:calc(var(--t) * -3)}' +
        '@keyframes dzSens{0%{transform:scaleX(1)}50%{transform:scaleX(-1)}}' +
        '@keyframes dzDanse{0%,100%{transform:translateY(0) rotate(-4deg)}25%{transform:translateY(-7px) rotate(0deg)}50%{transform:translateY(0) rotate(4deg)}75%{transform:translateY(-7px) rotate(0deg)}}' +
        '@keyframes dzDalle{0%{fill:#ff1680}25%{fill:#ffe500}50%{fill:#22d3ee}75%{fill:#a855f7}}' +
        '@media (prefers-reduced-motion:reduce){#evcDanseur *{animation:none!important}}' +
        'html:not(.evc-disco) #evcDanseur{display:none}' +
        'html:not(.evc-disco) #evcDiscoBoule,html:not(.evc-disco) #evcDiscoReflets{display:none}' +
        '[data-disco-toggle]{line-height:0}' +
        '[data-disco-toggle][aria-pressed="false"] svg{opacity:.45}';
    document.head.appendChild(css);

    // Danseur disco : image (danseur-disco.webp) sur une petite piste lumineuse
    var DANSEUR = '<svg class="piste" viewBox="0 0 200 100" aria-hidden="true">' +
        '<defs><radialGradient id="dzSpot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
        '<g transform="translate(100 72) scale(1 .34)"><g transform="rotate(45)">' +
        '<rect class="dalle a" x="-52" y="-52" width="50" height="50" rx="5"/><rect class="dalle b" x="2" y="-52" width="50" height="50" rx="5"/>' +
        '<rect class="dalle c" x="-52" y="2" width="50" height="50" rx="5"/><rect class="dalle d" x="2" y="2" width="50" height="50" rx="5"/></g></g>' +
        '<ellipse cx="100" cy="72" rx="80" ry="22" fill="url(#dzSpot)"/></svg>' +
        '<div class="sens"><div class="gars"><img src="danseur-disco.webp" alt="" width="342" height="520" decoding="async"></div></div>';

    var boule, reflets, cb, cr, ctxB, ctxR, angle = 0, temps = 0, dernier = 0, raf = 0;
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var LAT = 26, LON = 52;
    var alea = function (n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };   // pseudo-hasard fixe

    // ---------- Petits carrés lumineux pré-dessinés (couleur × netteté) ----------
    var COUL_SOMBRE = [[255, 22, 128], [255, 196, 92], [255, 255, 255], [255, 120, 190], [255, 226, 140]];
    var COUL_CLAIR = [[233, 30, 99], [217, 119, 6], [147, 51, 234], [236, 72, 153], [202, 138, 4]];
    var sprites = {};
    function sprite(c, flou, clair) {
        var k = c + ':' + flou + ':' + (clair ? 1 : 0);
        if (sprites[k]) return sprites[k];
        var coul = (clair ? COUL_CLAIR : COUL_SOMBRE)[c];
        var cote = 18, marge = 6 + flou * 9, T = Math.ceil((cote + marge * 2) * dpr);
        var cv = document.createElement('canvas'); cv.width = cv.height = T;
        var x = cv.getContext('2d');
        if (flou) x.filter = 'blur(' + (flou * 3.2 * dpr) + 'px)';
        var g = x.createLinearGradient(0, 0, T, T);
        g.addColorStop(0, 'rgba(' + coul + ',1)'); g.addColorStop(1, 'rgba(' + coul + ',0.75)');
        x.fillStyle = g;
        x.fillRect(marge * dpr, marge * dpr, cote * dpr, cote * dpr);
        if (!flou) {                                                       // petit éclat blanc au centre des carrés nets
            x.fillStyle = 'rgba(255,255,255,' + (clair ? 0.25 : 0.55) + ')';
            x.fillRect((marge + 5) * dpr, (marge + 5) * dpr, 8 * dpr, 8 * dpr);
        }
        sprites[k] = cv;
        return cv;
    }

    // ---------- Les reflets : chaque carré suit un « rayon » parti de la boule ----------
    // az = direction autour de l'axe de la boule (tourne avec elle), el = inclinaison vers le bas
    var TACHES = [];
    for (var k = 0; k < 760; k++) {
        var u = alea(k + 900);
        TACHES.push({
            ang: alea(k) * Math.PI * 2,                                     // position autour de la boule (tourne avec elle)
            dist: 0.05 + Math.sqrt(alea(k + 500)) * 1.1,                    // distance à la boule : répartis sur toute la surface de l'écran
            couleur: u < 0.4 ? 0 : u < 0.68 ? 1 : u < 0.86 ? 2 : u < 0.94 ? 3 : 4,
            taille: 0.6 + alea(k + 1300) * 0.8,
            rot: alea(k + 1700) * 1.2 - 0.6,
            phase: alea(k + 2100) * Math.PI * 2,
            vitesse: 0.85 + alea(k + 2500) * 0.3
        });
    }

    function creer() {
        boule = document.createElement('div');
        boule.id = 'evcDiscoBoule';
        boule.setAttribute('aria-hidden', 'true');
        boule.innerHTML = '<span class="fil"></span><span class="attache"></span>';
        cb = document.createElement('canvas');
        boule.appendChild(cb);
        reflets = document.createElement('canvas');
        reflets.id = 'evcDiscoReflets';
        reflets.setAttribute('aria-hidden', 'true');
        document.body.prepend(reflets);
        document.body.appendChild(boule);
        var danseur = document.createElement('div');
        danseur.id = 'evcDanseur';
        danseur.setAttribute('aria-hidden', 'true');
        danseur.innerHTML = DANSEUR;
        document.body.appendChild(danseur);
        setTimeout(placerDanseur, 300); setTimeout(placerDanseur, 1500);
        ctxB = cb.getContext('2d');
        ctxR = reflets.getContext('2d');
        taille();
        window.addEventListener('resize', taille);
    }

    // 🪩 Colonne de droite : boule, danseur et radio empilés et centrés dans la marge libre à droite du contenu.
    // La position est publiée (window.__evcColonne + évènement « evc:colonne ») pour la radio persistante (app-shell.html).
    function radioPersistante() {
        try { if (window.top !== window && window.top.__EVC_PERSISTENT_RADIO__) return window.top.document.getElementById('radioWidgetFloating'); } catch (e) {}
        return null;
    }
    function placerDanseur() {
        var d = document.getElementById('evcDanseur');
        var contenu = document.querySelector('.cam-layout main') || document.querySelector('main');
        var droiteContenu = contenu ? contenu.getBoundingClientRect().right : window.innerWidth;
        var marge = window.innerWidth - droiteContenu;              // place libre à droite du contenu
        var large = window.innerWidth >= 1024 && marge >= 120;
        var centre = droiteContenu + marge / 2;
        var tete = document.querySelector('header');
        var haut = (tete ? tete.getBoundingClientRect().bottom : 64) + 16;

        // Boule : centrée dans la colonne (sinon à sa place d'origine, en haut à droite)
        if (boule) {
            var avant = boule.style.getPropertyValue('--disco-taille');
            boule.style.removeProperty('--disco-taille');
            if (large && actif) {
                // Taille normale, réduite si la colonne est plus étroite que la boule
                var normale = boule.offsetWidth || 190, t = Math.max(70, Math.min(normale, marge - 24));
                if (t < normale) boule.style.setProperty('--disco-taille', t + 'px');
                boule.style.left = Math.round(centre - t / 2) + 'px'; boule.style.right = 'auto';
            } else { boule.style.left = ''; boule.style.right = ''; }
            if (boule.style.getPropertyValue('--disco-taille') !== avant) taille();   // redessine la boule à sa nouvelle taille
            if (actif) haut = boule.getBoundingClientRect().bottom + 6;
        }

        // Place à garder pour la radio sous le danseur
        var radio = radioPersistante(), reserve = 0;
        if (radio && large) {
            var rw = radio.offsetWidth || 252, rh = radio.offsetHeight || 360;
            reserve = rh * Math.min(1, (marge - 16) / rw) + 20 + 56;   // radio + bulle « Besoin d'aide ? »
        }

        // Danseur : sous la boule, seulement si la boule est allumée et qu'il y a la place
        if (d) {
            var dz = Math.min(170, marge - 30, (window.innerHeight - haut - reserve - 12) / 1.72);
            var dejaDansLeChat = !!document.querySelector('.evc-dz');   // danseur du Salon Musique déjà affiché
            if (actif && large && dz >= 80 && !dejaDansLeChat) {
                dz = Math.floor(dz);
                d.style.setProperty('--dz', dz + 'px');
                d.style.top = Math.round(haut) + 'px';
                d.style.right = 'auto';
                d.style.left = Math.round(centre - dz / 2) + 'px';
                d.classList.add('place');
                haut += dz * 1.72 + 4;
            } else d.classList.remove('place');
        }

        window.__evcColonne = large ? { centre: Math.round(centre), haut: Math.round(haut + 6), largeur: Math.round(marge) } : null;
        try { window.dispatchEvent(new Event('evc:colonne')); } catch (e) {}
    }
    window.addEventListener('resize', function () { placerDanseur(); });
    setTimeout(placerDanseur, 400); setTimeout(placerDanseur, 1500);

    function taille() {
        if (!reflets) return;
        reflets.width = Math.round(window.innerWidth * dpr);
        reflets.height = Math.round(window.innerHeight * dpr);
        var t = cb.getBoundingClientRect().width || 200;
        cb.width = cb.height = Math.round(t * dpr);
        dessiner();
    }

    function clair() { return document.documentElement.getAttribute('data-theme') === 'light'; }

    // ---------- La boule : carreaux miroir qui reflètent une salle rose et or ----------
    function environnement(nx, ny, nz) {
        // Couleur « vue » par un carreau selon son orientation : rose à droite, or à gauche, blanc en haut
        var rose = Math.max(0, nx) * 0.9, or = Math.max(0, -nx) * 0.8, haut = Math.max(0, -ny) * 0.7;
        return [150 + 105 * rose + 90 * or + 60 * haut, 145 + 0 * rose + 60 * or + 60 * haut, 160 + 70 * rose - 40 * or + 70 * haut];
    }
    function dessinerBoule() {
        var W = cb.width; if (!W) return;
        var R = W / 2 - 1.5 * dpr, cx = W / 2, cy = W / 2;
        ctxB.clearRect(0, 0, W, W);
        // Halo lumineux derrière la boule
        ctxB.save();
        ctxB.beginPath(); ctxB.arc(cx, cy, R, 0, Math.PI * 2); ctxB.clip();
        ctxB.fillStyle = '#26262d'; ctxB.fillRect(0, 0, W, W);
        var L = { x: -0.5, y: -0.6, z: 0.62 };
        for (var a = 0; a < LAT; a++) {
            var t0 = -Math.PI / 2 + (a / LAT) * Math.PI, t1 = -Math.PI / 2 + ((a + 1) / LAT) * Math.PI, tm = (t0 + t1) / 2;
            var nb = Math.max(6, Math.round(LON * Math.cos(tm)));        // moins de carreaux près des pôles, comme une vraie boule
            for (var b = 0; b < nb; b++) {
                var p0 = (b / nb) * Math.PI * 2 + angle, p1 = ((b + 1) / nb) * Math.PI * 2 + angle, pm = (p0 + p1) / 2;
                var nz = Math.cos(tm) * Math.cos(pm);
                if (nz <= 0.01) continue;
                var nx = Math.cos(tm) * Math.sin(pm), ny = Math.sin(tm);
                var e = 0.09;                                               // joint entre carreaux
                var coins = [[t0 + e * 0.5 / LAT * 6, p0 + e / nb * 6], [t0 + e * 0.5 / LAT * 6, p1 - e / nb * 6], [t1 - e * 0.5 / LAT * 6, p1 - e / nb * 6], [t1 - e * 0.5 / LAT * 6, p0 + e / nb * 6]];
                ctxB.beginPath();
                for (var c = 0; c < 4; c++) {
                    var th = coins[c][0], ph = coins[c][1];
                    var x = cx + R * Math.cos(th) * Math.sin(ph), y = cy + R * Math.sin(th);
                    if (c) ctxB.lineTo(x, y); else ctxB.moveTo(x, y);
                }
                ctxB.closePath();
                var id = a * 97 + b;
                var env = environnement(nx, ny, nz);
                var d = Math.max(0, nx * L.x + ny * L.y + nz * L.z);
                var spec = Math.pow(d, 22) * 1.4;
                var scint = alea(id + Math.floor(temps * 3 + alea(id) * 10)) > 0.95 ? 1 : 0;   // quelques carreaux qui scintillent
                var v = 0.45 + alea(id) * 0.75;                            // chaque miroir renvoie une lumière un peu différente
                var ombre = 0.3 + 0.7 * Math.pow(nz, 0.6);
                var r = env[0] * v * ombre + 255 * (spec + scint * 0.9);
                var g = env[1] * v * ombre + 255 * (spec + scint * 0.9);
                var bl = env[2] * v * ombre + 255 * (spec + scint * 0.9);
                ctxB.fillStyle = 'rgb(' + Math.min(255, r | 0) + ',' + Math.min(255, g | 0) + ',' + Math.min(255, bl | 0) + ')';
                ctxB.fill();
            }
        }
        // Volume : bord assombri + reflet doux en haut à gauche
        var o = ctxB.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.15, cx, cy, R * 1.02);
        o.addColorStop(0, 'rgba(255,255,255,0.12)'); o.addColorStop(0.7, 'rgba(0,0,0,0)'); o.addColorStop(1, 'rgba(0,0,0,0.45)');
        ctxB.fillStyle = o; ctxB.fillRect(0, 0, W, W);
        ctxB.restore();
        // Éclats en étoile sur les carreaux les plus brillants
        etoile(cx - R * 0.42, cy - R * 0.38, R * 0.22, 0.5 + 0.5 * Math.sin(temps * 2.1));
        etoile(cx + R * 0.5, cy + R * 0.25, R * 0.16, 0.5 + 0.5 * Math.sin(temps * 2.7 + 2));
        etoile(cx + R * 0.1, cy - R * 0.62, R * 0.12, 0.5 + 0.5 * Math.sin(temps * 3.3 + 4));
    }
    function etoile(x, y, r, force) {
        if (force < 0.15) return;
        ctxB.save();
        ctxB.globalCompositeOperation = 'lighter';
        var g = ctxB.createRadialGradient(x, y, 0, x, y, r * 0.5);
        g.addColorStop(0, 'rgba(255,255,255,' + 0.9 * force + ')'); g.addColorStop(1, 'rgba(255,220,240,0)');
        ctxB.fillStyle = g; ctxB.beginPath(); ctxB.arc(x, y, r * 0.5, 0, Math.PI * 2); ctxB.fill();
        ctxB.strokeStyle = 'rgba(255,255,255,' + 0.8 * force + ')'; ctxB.lineWidth = 1.2 * dpr;
        ctxB.beginPath(); ctxB.moveTo(x - r, y); ctxB.lineTo(x + r, y); ctxB.moveTo(x, y - r); ctxB.lineTo(x, y + r); ctxB.stroke();
        ctxB.restore();
    }

    // ---------- Les reflets sur le fond ----------
    function dessinerReflets() {
        var W = reflets.width, H = reflets.height;
        ctxR.clearRect(0, 0, W, H);
        var rb = cb.getBoundingClientRect();
        var bx = (rb.left + rb.width / 2) * dpr, by = (rb.top + rb.height / 2) * dpr;
        var estClair = clair(), diag = Math.hypot(W, H);
        ctxR.globalCompositeOperation = estClair ? 'source-over' : 'lighter';
        for (var i = 0; i < TACHES.length; i++) {
            var t = TACHES[i];
            // Les reflets tournent autour de la boule, comme les taches d'une vraie boule sur les murs
            var a = t.ang + angle * 2 * t.vitesse;
            var dist = t.dist * diag;
            var x = bx + Math.cos(a) * dist * 1.2, y = by + Math.sin(a) * dist * 0.85;
            if (x < -80 * dpr || x > W + 80 * dpr || y < -80 * dpr || y > H + 80 * dpr) continue;
            var loin = Math.min(1, t.dist);                                // perspective : plus loin = plus grand et plus flou
            var flou = loin < 0.3 ? 0 : loin < 0.62 ? 1 : 2;
            var s = sprite(t.couleur, flou, estClair);
            var echelle = (0.55 + loin * 1.35) * t.taille;
            var vacille = 0.7 + 0.3 * Math.sin(temps * 3 + t.phase);
            var lum = (estClair ? 0.6 : 1) * (1 - loin * 0.3) * vacille;
            ctxR.save();
            ctxR.globalAlpha = Math.max(0, lum);
            ctxR.translate(x, y);
            ctxR.rotate(t.rot + a * 0.5);
            ctxR.transform(1, 0, -0.4, 1, 0, 0);                           // carrés vus en biais, comme sur un mur
            ctxR.drawImage(s, -s.width * echelle / 2, -s.height * echelle / 2, s.width * echelle, s.height * echelle);
            ctxR.restore();
        }
        ctxR.globalCompositeOperation = 'source-over';
    }

    function dessiner() { if (ctxB && actif) { dessinerBoule(); dessinerReflets(); } }

    function boucle(t) {
        raf = 0;
        if (!actif || document.hidden) return;
        if (!dernier) dernier = t;
        if (t - dernier >= 33) {                                          // ~30 images par seconde
            var dt = Math.min(100, t - dernier);
            angle = (angle + dt * (Math.PI * 2) / 26000) % (Math.PI * 2);  // un tour en 26 s : lent et hypnotique
            temps += dt / 1000;
            dernier = t;
            dessiner();
        }
        raf = requestAnimationFrame(boucle);
    }
    function demarrer() {
        if (reduit) { dessiner(); return; }
        if (!raf) { dernier = 0; raf = requestAnimationFrame(boucle); }
    }

    // ---------- Bouton marche / arrêt ----------
    var ICONE = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><line x1="12" y1="1" x2="12" y2="5" stroke="currentColor" stroke-width="1.5"/>' +
        '<circle cx="12" cy="14" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
        '<path d="M3.5 14h17M5 10h14M5 18h14M12 5.5c-3 2.5-3 14.5 0 17M12 5.5c3 2.5 3 14.5 0 17" fill="none" stroke="currentColor" stroke-width="1"/>' +
        '<path d="M20 4l.6 1.4L22 6l-1.4.6L20 8l-.6-1.4L18 6l1.4-.6z" fill="currentColor"/></svg>';
    function majBoutons() {
        var bs = document.querySelectorAll('[data-disco-toggle]');
        for (var i = 0; i < bs.length; i++) {
            var b = bs[i];
            if (!b.querySelector('svg')) b.innerHTML = ICONE;
            b.title = actif ? 'Éteindre la boule à facettes' : 'Allumer la boule à facettes';
            b.setAttribute('aria-label', b.title);
            b.setAttribute('aria-pressed', actif ? 'true' : 'false');
        }
    }
    function appliquer() {
        document.documentElement.classList.toggle('evc-disco', actif);
        majBoutons();
        if (actif) { if (!boule) creer(); else taille(); demarrer(); }
        else if (raf) { cancelAnimationFrame(raf); raf = 0; }
        setTimeout(placerDanseur, 50);   // boule allumée ou éteinte : la colonne (danseur, radio) se réorganise
    }
    function basculer() {
        actif = !actif;
        try { localStorage.setItem(CLE, actif ? 'on' : 'off'); } catch (e) {}
        appliquer();
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-disco-toggle]');
        if (b) { e.preventDefault(); basculer(); }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && actif) demarrer(); });
    new MutationObserver(function () { dessiner(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('storage', function (e) { if (e.key === CLE) { actif = e.newValue !== 'off'; appliquer(); } });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', appliquer); else appliquer();
})();
