// ============================================================
// E-VISIOCAM — « Installer l'application » (PWA)
// ------------------------------------------------------------
// - Android / Chrome / Edge / ordinateur : on retient l'événement beforeinstallprompt et on propose
//   un bandeau discret « Installer E-VISIOCAM sur votre téléphone ».
// - iPhone / iPad (Safari) : pas d'installation automatique → petite aide « Partager → Sur l'écran
//   d'accueil » (indispensable sur iPhone pour recevoir les notifications).
// - Navigateur intégré (Facebook, Instagram…) : conseil d'ouvrir la page dans Safari / Chrome.
// - Bandeau : à partir de la 2e visite seulement, une fois par visite au plus, jamais pendant
//   un tchat / un direct / une conversation ni pendant qu'on se filme, jamais dans l'application
//   installée ; fermé → plus rien pendant 14 jours.
// - compte.html : bouton #installApp (+ #installAide) qui lance l'installation ou affiche l'aide.
//
// Coquille radio (app-shell.html : les pages tournent dans l'iframe #evcPage) :
//   • l'événement beforeinstallprompt n'arrive QUE dans la fenêtre du haut ;
//   • chargé dans app-shell.html, ce script garde l'événement (window.__evcBip) et l'API
//     window.EvcInstallApp, sans rien afficher ; la page de l'iframe (chargée par footer.js)
//     décide et affiche le bandeau, et lance l'invite via la fenêtre du haut ;
//   • si la coquille charge encore l'ancien guide-installation.js (window.EvcInstall.ouvrir),
//     c'est lui qui propose l'installation : pas de second bandeau, le bouton du compte l'ouvre.
// Aucune statistique d'installation. Aucun script inline (CSP stricte).
// ============================================================
(function () {
    'use strict';
    if (window.EvcInstallApp) return;

    var CLE_VISITES = 'evc_install_visites';
    var CLE_REFUS = 'evc_install_refus';         // date (ms) de la dernière fermeture du bandeau
    var CLE_FAIT = 'evc_install_fait';
    var CLE_SESSION = 'evc_install_session';     // cette visite est déjà comptée
    var CLE_VU = 'evc_install_vu';               // bandeau déjà montré pendant cette visite
    var PAUSE_MS = 14 * 24 * 60 * 60 * 1000;
    var DELAI_MS = 4000;                         // on laisse la page s'afficher avant de proposer
    // Pages où l'on ne dérange jamais (en pleine conversation, formulaires, équipe)
    var PAGES_EXCLUES = ['chat.html', 'live.html', 'messages.html', 'room.html', 'apercu.html', 'app-shell.html',
        'login.html', 'register.html', 'forgot-password.html', 'reset-password.html', 'nouveau-mdp.html',
        'verifier-email.html', 'admin.html', 'moderation.html', 'moderation-salons.html', 'dashboard.html', 'decor.html'];

    function lire(cle, stockage) { try { return (stockage || localStorage).getItem(cle); } catch (e) { return null; } }
    function ecrire(cle, val, stockage) { try { (stockage || localStorage).setItem(cle, String(val)); } catch (e) {} }

    function page() {
        var p = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
        return p.indexOf('.') === -1 ? p + '.html' : p;
    }

    // Fenêtre du haut (coquille), si elle est du même site
    var haut = window;
    try { if (window.top !== window && window.top.location.origin === location.origin) haut = window.top; } catch (e) { haut = window; }
    var dansCadre = haut !== window;
    var estCoquille = !dansCadre && page() === 'app-shell.html';

    var ua = navigator.userAgent || '';
    function estIOS() { return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); }
    var integre = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|musical_ly|Twitter|LinkedInApp|Messenger/i.test(ua);
    function estSafariIOS() { return estIOS() && /Safari/.test(ua) && !integre && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua); }
    function estMobile() { return estIOS() || /Android|Mobile/i.test(ua); }

    function estInstallee() {
        var fenetres = dansCadre ? [window, haut] : [window];
        for (var i = 0; i < fenetres.length; i++) {
            try {
                var w = fenetres[i];
                if (w.matchMedia('(display-mode: standalone)').matches || w.matchMedia('(display-mode: fullscreen)').matches) return true;
                if (w.navigator.standalone === true) return true;
            } catch (e) {}
        }
        return false;
    }

    // Ancien guide de la coquille encore présent (guide-installation.js) ?
    function ancienGuide() {
        try { return !haut.EvcInstallApp && haut.EvcInstall && typeof haut.EvcInstall.ouvrir === 'function' ? haut.EvcInstall : null; } catch (e) { return null; }
    }
    // L'événement d'installation est gardé sur la fenêtre du haut
    function invite() { try { return haut.__evcBip || null; } catch (e) { return null; } }
    function oublierInvite() { try { haut.__evcBip = null; } catch (e) {} }

    // ---------- Fenêtre du haut : on garde l'événement ----------
    if (!dansCadre) {
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();           // pas de mini-barre du navigateur : c'est nous qui proposons, au bon moment
            window.__evcBip = e;
            try { window.dispatchEvent(new CustomEvent('evc:install-dispo')); } catch (er) {}
        });
        window.addEventListener('appinstalled', function () {
            window.__evcBip = null;
            ecrire(CLE_FAIT, Date.now());
            try { window.dispatchEvent(new CustomEvent('evc:install-fait')); } catch (er) {}
        });
    }

    function lancer() {
        var e = invite();
        if (!e) return Promise.resolve('indisponible');
        oublierInvite();                  // l'événement ne sert qu'une fois
        try { e.prompt(); } catch (err) { return Promise.resolve('indisponible'); }
        return Promise.resolve(e.userChoice).then(function (c) {
            var issue = (c && c.outcome) || 'dismissed';
            ecrire(issue === 'accepted' ? CLE_FAIT : CLE_REFUS, Date.now());
            return issue;
        }, function () { return 'dismissed'; });
    }

    window.EvcInstallApp = {
        disponible: function () { return !!invite(); },
        installer: lancer,
        estInstallee: estInstallee
    };
    if (estCoquille) return;              // la coquille n'affiche rien : c'est la page de l'iframe qui s'en charge

    // Compter les visites (une par session de navigation, pas une par page ; partagé avec l'iframe)
    if (!lire(CLE_SESSION, sessionStorage)) {
        ecrire(CLE_SESSION, '1', sessionStorage);
        ecrire(CLE_VISITES, (parseInt(lire(CLE_VISITES), 10) || 0) + 1);
    }

    function seFilme() {
        try { var s = haut.EvcCamSession || window.EvcCamSession; return !!(s && s.getState && s.getState().active); } catch (e) { return false; }
    }
    function peutProposer() {
        if (ancienGuide()) return false;  // l'ancien guide de la coquille s'en occupe déjà
        if (estInstallee() || lire(CLE_FAIT)) return false;
        if (PAGES_EXCLUES.indexOf(page()) !== -1) return false;
        if ((parseInt(lire(CLE_VISITES), 10) || 0) < 2) return false;
        if (lire(CLE_VU, sessionStorage)) return false;
        var refus = parseInt(lire(CLE_REFUS), 10) || 0;
        if (refus && Date.now() - refus < PAUSE_MS) return false;
        return !!invite() || estSafariIOS() || integre;
    }

    // ---------- Bandeau ----------
    var bandeau = null, minuterie = null;

    function fermerBandeau() { if (bandeau) { bandeau.remove(); bandeau = null; } }
    function refuser() { ecrire(CLE_REFUS, Date.now()); fermerBandeau(); }

    function legalOuvert() {
        var o = document.getElementById('legalOverlay');
        return !!(o && o.offsetParent !== null && getComputedStyle(o).display !== 'none');
    }

    function afficher() {
        minuterie = null;
        if (bandeau || !peutProposer()) return;
        if (document.hidden || legalOuvert() || seFilme()) { minuterie = setTimeout(afficher, 5000); return; }
        ecrire(CLE_VU, '1', sessionStorage);

        var mode = invite() ? 'invite' : (integre ? 'integre' : 'ios');
        var titre = estMobile() ? 'Installer E-VISIOCAM sur votre téléphone' : 'Installer E-VISIOCAM sur votre ordinateur';
        var detail = {
            invite: 'Accès en un geste depuis l’écran d’accueil, en plein écran.',
            ios: 'Touchez Partager, puis « Sur l’écran d’accueil ». Sur iPhone, c’est aussi indispensable pour recevoir les notifications.',
            integre: 'Ouvrez d’abord cette page dans ' + (estIOS() ? 'Safari' : 'Chrome') + ' (menu ••• → « Ouvrir dans le navigateur ») : l’installation et la caméra n’y fonctionnent pas ici.'
        }[mode];

        bandeau = document.createElement('div');
        bandeau.className = 'evc-install';
        bandeau.setAttribute('role', 'dialog');
        bandeau.setAttribute('aria-label', titre);
        var img = document.createElement('img');
        img.src = '/icon-192.png'; img.alt = ''; img.width = 40; img.height = 40;
        var txt = document.createElement('div');
        txt.className = 'evc-install-txt';
        var b = document.createElement('b'); b.textContent = titre;
        var s = document.createElement('small'); s.textContent = detail;
        txt.appendChild(b); txt.appendChild(s);
        bandeau.appendChild(img); bandeau.appendChild(txt);

        var ok = document.createElement('button');
        ok.type = 'button'; ok.className = 'evc-install-ok';
        ok.textContent = mode === 'invite' ? 'Installer' : 'Compris';
        ok.addEventListener('click', function () {
            if (mode !== 'invite') { refuser(); return; }
            fermerBandeau();
            lancer().then(majCompte);
        });
        var x = document.createElement('button');
        x.type = 'button'; x.className = 'evc-install-x';
        x.setAttribute('aria-label', 'Fermer, ne plus proposer pendant 14 jours');
        x.textContent = '×';
        x.addEventListener('click', refuser);
        bandeau.appendChild(ok); bandeau.appendChild(x);
        bandeau.addEventListener('keydown', function (e) { if (e.key === 'Escape') refuser(); });
        document.body.appendChild(bandeau);
    }

    function planifier() {
        if (minuterie || bandeau || !peutProposer()) return;
        minuterie = setTimeout(afficher, DELAI_MS);
    }

    // ---------- Réglage dans compte.html ----------
    function majCompte() {
        var btn = document.getElementById('installApp');
        var aide = document.getElementById('installAide');
        if (!btn || !aide) return;
        if (estInstallee() || (lire(CLE_FAIT) && !invite())) {
            btn.hidden = true;
            aide.textContent = 'L’application E-VISIOCAM est installée sur cet appareil.';
        } else if (estIOS()) {
            btn.hidden = false;
            aide.textContent = 'Sur iPhone et iPad, l’installation se fait depuis Safari. Elle est indispensable pour recevoir les notifications.';
        } else {
            btn.hidden = false;
            aide.textContent = 'Ajoutez E-VISIOCAM à votre écran d’accueil ou à votre bureau : ouverture en un geste, en plein écran.';
        }
    }
    function brancherCompte() {
        var btn = document.getElementById('installApp');
        var aide = document.getElementById('installAide');
        if (!btn || !aide || btn.__evcInstall) return;
        btn.__evcInstall = true;
        btn.addEventListener('click', function () {
            if (invite()) {
                lancer().then(function (issue) {
                    if (issue === 'accepted') aide.textContent = 'Installation en cours : retrouvez E-VISIOCAM sur votre écran d’accueil.';
                    else if (issue === 'dismissed') aide.textContent = 'Installation annulée. Vous pourrez réessayer ici quand vous voudrez.';
                });
                return;
            }
            var ancien = ancienGuide();
            try { if (ancien && ancien.ouvrir()) return; } catch (e) {}   // guide de la coquille (Android / iPhone)
            if (estIOS()) {
                aide.textContent = estSafariIOS()
                    ? 'Touchez le bouton Partager (carré avec une flèche vers le haut), puis « Sur l’écran d’accueil », puis « Ajouter ». Ouvrez ensuite E-VISIOCAM depuis cette icône pour activer les notifications (iOS 16.4 ou plus récent).'
                    : 'Ouvrez cette page dans Safari, touchez le bouton Partager puis « Sur l’écran d’accueil ». Ouvrez ensuite E-VISIOCAM depuis cette icône pour activer les notifications (iOS 16.4 ou plus récent).';
                return;
            }
            aide.textContent = /Android/i.test(ua)
                ? 'Ouvrez le menu du navigateur (⋮), puis « Installer l’application » ou « Ajouter à l’écran d’accueil ».'
                : 'Dans Chrome ou Edge, cliquez sur l’icône d’installation à droite de la barre d’adresse, ou ouvrez le menu du navigateur puis « Installer E-VISIOCAM ». Firefox ne propose pas l’installation sur ordinateur.';
        });
        majCompte();
    }

    // L'invite peut arriver après le chargement de la page : on écoute la fenêtre du haut
    // (et on se détache quand la page de l'iframe s'en va, pour ne rien laisser traîner).
    function surDispo() { majCompte(); planifier(); }
    function surFait() { fermerBandeau(); majCompte(); }
    try {
        haut.addEventListener('evc:install-dispo', surDispo);
        haut.addEventListener('evc:install-fait', surFait);
        if (dansCadre) window.addEventListener('pagehide', function () {
            try { haut.removeEventListener('evc:install-dispo', surDispo); haut.removeEventListener('evc:install-fait', surFait); } catch (e) {}
        });
    } catch (e) {}

    function demarrer() { brancherCompte(); planifier(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();
})();
