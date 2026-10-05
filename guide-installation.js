// ============================================================
// E-VISIOCAM — GUIDE D'INSTALLATION DE L'APPLI
// ------------------------------------------------------------
// Chargé dans app-shell.html. Sur téléphone uniquement, et seulement si l'appli
// n'est pas déjà installée :
//   • Android (Chrome, Samsung…) : bouton « Installer » qui installe en un appui
//   • iPhone / iPad (Safari)     : petit guide en 3 étapes (Apple n'autorise pas de bouton)
//   • Navigateur intégré (Facebook, Instagram, TikTok…) : conseil d'ouvrir dans Safari / Chrome
// « Plus tard » le masque 3 jours. window.EvcInstall.ouvrir() le réaffiche (ex. lien dans un menu).
// ============================================================
(function () {
    'use strict';
    if (window.EvcInstall) return;

    var CLE = 'evc-install-plus-tard';
    var DELAI_PLUS_TARD = 3 * 24 * 3600 * 1000;
    var ua = navigator.userAgent || '';
    var iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var android = /Android/i.test(ua);
    var mobile = iOS || android;
    var integre = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|Messenger/i.test(ua);
    var autreNavIOS = iOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    var evenementAndroid = null;

    function installee() {
        try { if (window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches) return true; } catch (e) {}
        return navigator.standalone === true;
    }
    function reporte() {
        try { var t = Number(localStorage.getItem(CLE) || 0); return t && Date.now() - t < DELAI_PLUS_TARD; } catch (e) { return false; }
    }
    function plusTard() { try { localStorage.setItem(CLE, String(Date.now())); } catch (e) {} fermer(); }

    // ---------- styles ----------
    function styles() {
        if (document.getElementById('evcInstallCss')) return;
        var css = document.createElement('style');
        css.id = 'evcInstallCss';
        css.textContent = [
            '#evcInstall{position:fixed;left:0;right:0;bottom:0;z-index:10001;display:flex;justify-content:center;padding:0 10px calc(10px + env(safe-area-inset-bottom,0px));pointer-events:none;font-family:Inter,system-ui,sans-serif}',
            '#evcInstall .carte{pointer-events:auto;width:100%;max-width:440px;background:#1c1c20;color:#f5f5f6;border:1px solid #ff1680;border-radius:18px;box-shadow:0 18px 50px #000a;padding:16px 16px 14px;animation:evcMonte .35s ease}',
            'html[data-theme="light"] #evcInstall .carte{background:#fff;color:#172039;box-shadow:0 18px 50px #0003}',
            '@keyframes evcMonte{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}',
            '@media (prefers-reduced-motion:reduce){#evcInstall .carte{animation:none}}',
            '#evcInstall .tete{display:flex;align-items:center;gap:12px;margin-bottom:10px}',
            '#evcInstall .tete img{width:44px;height:44px;border-radius:11px;flex-shrink:0}',
            '#evcInstall h2{font-size:16px;font-weight:800;margin:0;line-height:1.25}',
            '#evcInstall p{font-size:13px;line-height:1.5;margin:0;opacity:.85}',
            '#evcInstall ol{list-style:none;margin:12px 0 4px;padding:0;display:grid;gap:9px}',
            '#evcInstall li{display:flex;align-items:center;gap:10px;font-size:14px;line-height:1.4}',
            '#evcInstall .num{width:26px;height:26px;border-radius:50%;background:#e91e63;color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
            '#evcInstall .ico{display:inline-flex;vertical-align:middle;width:26px;height:26px;border-radius:7px;background:#ffffff1a;align-items:center;justify-content:center;margin:0 2px}',
            'html[data-theme="light"] #evcInstall .ico{background:#eef1f6}',
            '#evcInstall .ico svg{width:17px;height:17px}',
            '#evcInstall .boutons{display:flex;gap:8px;margin-top:12px}',
            '#evcInstall button{flex:1;border:0;border-radius:11px;padding:12px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer}',
            '#evcInstall .principal{background:#e91e63;color:#fff}',
            '#evcInstall .secondaire{background:#ffffff14;color:inherit}',
            'html[data-theme="light"] #evcInstall .secondaire{background:#eef1f6}',
            '#evcInstall .fleche{position:fixed;left:50%;bottom:calc(2px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);font-size:26px;color:#ff1680;animation:evcRebond 1s infinite;pointer-events:none}',
            '@keyframes evcRebond{50%{transform:translate(-50%,6px)}}'
        ].join('\n');
        document.head.appendChild(css);
    }

    var ICONE_PARTAGER = '<span class="ico" aria-label="bouton Partager"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg></span>';
    var ICONE_PLUS = '<span class="ico" aria-label="carré avec un plus"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg></span>';
    var ICONE_POINTS = '<span class="ico" aria-label="bouton trois points">•••</span>';

    function fermer() { var el = document.getElementById('evcInstall'); if (el) el.remove(); }

    function afficher(html, actions) {
        styles();
        fermer();
        var el = document.createElement('div');
        el.id = 'evcInstall';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-label', 'Installer l\'appli E-VISIOCAM');
        el.innerHTML = '<div class="carte"><div class="tete"><img src="icon-192.png" alt=""><div>'
            + '<h2>Installe l\'appli E-VISIOCAM</h2><p>Accès en un appui depuis ton écran d\'accueil, en plein écran.</p></div></div>'
            + html + '<div class="boutons">' + actions + '</div></div>';
        document.body.appendChild(el);
        var b;
        if ((b = el.querySelector('[data-plus-tard]'))) b.onclick = plusTard;
        if ((b = el.querySelector('[data-fermer]'))) b.onclick = fermer;
        if ((b = el.querySelector('[data-installer]'))) b.onclick = installerAndroid;
        return el;
    }

    // ---------- Android : vrai bouton d'installation ----------
    async function installerAndroid() {
        if (!evenementAndroid) { guideAndroidManuel(); return; }
        var e = evenementAndroid;
        evenementAndroid = null;
        fermer();
        try {
            e.prompt();
            var choix = await e.userChoice;
            if (choix && choix.outcome === 'dismissed') { try { localStorage.setItem(CLE, String(Date.now())); } catch (er) {} }
        } catch (er) {}
    }
    function guideAndroid() {
        afficher('<p style="margin-top:4px">Un seul appui suffit, l\'icône apparaîtra sur ton écran d\'accueil.</p>',
            '<button class="secondaire" data-plus-tard>Plus tard</button><button class="principal" data-installer>Installer</button>');
    }
    // Android sans bouton automatique (navigateur qui ne le propose pas, ou déjà refusé)
    function guideAndroidManuel() {
        afficher('<ol>'
            + '<li><span class="num">1</span><span>Appuie sur le menu ' + '<span class="ico">⋮</span> en haut à droite</span></li>'
            + '<li><span class="num">2</span><span>Choisis « Installer l\'application » ou « Ajouter à l\'écran d\'accueil »</span></li>'
            + '<li><span class="num">3</span><span>Confirme avec « Installer »</span></li>'
            + '</ol>', '<button class="secondaire" data-plus-tard>Plus tard</button><button class="principal" data-fermer>J\'ai compris</button>');
    }

    // ---------- iPhone / iPad : guide en étapes ----------
    function guideIOS() {
        var ou = autreNavIOS ? 'en haut à droite, dans la barre d\'adresse' : 'en bas de l\'écran';
        var el = afficher('<ol>'
            + '<li><span class="num">1</span><span>Appuie sur ' + ICONE_PARTAGER + ' ' + ou + '<br><small style="opacity:.7">Pas visible ? Appuie d\'abord sur ' + ICONE_POINTS + '</small></span></li>'
            + '<li><span class="num">2</span><span>Fais défiler et choisis ' + ICONE_PLUS + ' « Sur l\'écran d\'accueil »</span></li>'
            + '<li><span class="num">3</span><span>Appuie sur « Ajouter » en haut à droite</span></li>'
            + '</ol>', '<button class="secondaire" data-plus-tard>Plus tard</button><button class="principal" data-fermer>J\'ai compris</button>');
        // Sur iPhone avec Safari, le bouton est en bas : petite flèche pour guider le regard
        if (!autreNavIOS && !/iPad/.test(ua) && !(navigator.platform === 'MacIntel')) {
            var f = document.createElement('div'); f.className = 'fleche'; f.textContent = '⬇'; f.setAttribute('aria-hidden', 'true');
            el.appendChild(f);
            el.style.paddingBottom = 'calc(38px + env(safe-area-inset-bottom,0px))';   // la flèche sous la carte, pas sur les boutons
        }
    }

    // ---------- navigateur intégré (Facebook, Instagram…) ----------
    function guideIntegre() {
        var nav = iOS ? 'Safari' : 'Chrome';
        afficher('<p style="margin-top:4px">Tu es dans le navigateur d\'une autre appli : l\'installation et la caméra n\'y fonctionnent pas bien.</p>'
            + '<ol><li><span class="num">1</span><span>Appuie sur ' + ICONE_POINTS + ' ou sur le menu de cette appli</span></li>'
            + '<li><span class="num">2</span><span>Choisis « Ouvrir dans ' + nav + ' » ou « Ouvrir dans le navigateur »</span></li></ol>',
            '<button class="secondaire" data-plus-tard>Plus tard</button><button class="principal" data-fermer>J\'ai compris</button>');
    }

    function ouvrir() {
        if (installee()) return false;
        if (integre) guideIntegre();
        else if (iOS) guideIOS();
        else if (evenementAndroid) guideAndroid();
        else if (android) guideAndroidManuel();
        else return false;
        return true;
    }

    // Android : le navigateur annonce que l'installation est possible
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        evenementAndroid = e;
        if (mobile && !reporte() && !installee() && !document.getElementById('evcInstall')) setTimeout(guideAndroid, 4000);
    });
    window.addEventListener('appinstalled', function () { evenementAndroid = null; fermer(); });

    // iPhone / navigateur intégré : on propose le guide après quelques secondes
    if (mobile && !installee() && !reporte() && (iOS || integre)) setTimeout(function () {
        if (document.getElementById('evcInstall')) return;
        // Pas pendant qu'on se filme : on ne dérange pas en plein live
        try { if (window.EvcCamSession && window.EvcCamSession.getState().active) return; } catch (e) {}
        ouvrir();
    }, 5000);

    window.EvcInstall = { ouvrir: ouvrir, fermer: fermer, installee: installee };
})();
