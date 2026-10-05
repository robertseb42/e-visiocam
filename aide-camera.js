// ============================================================
// E-VISIOCAM — AIDE CAMÉRA POUR LES DÉBUTANTS
// ------------------------------------------------------------
// Chargé dans app-shell.html, utilisé par camera-session.js :
//   EvcAideCam.prevenir()        -> Promise<boolean>  explique la question du téléphone AVANT qu'elle arrive
//   EvcAideCam.expliquerErreur(err, reessayer)        explique quoi faire après un refus ou un problème
// ============================================================
(function () {
    'use strict';
    if (window.EvcAideCam) return;

    var ua = navigator.userAgent || '';
    var iOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var android = /Android/i.test(ua);
    var CLE_VU = 'evc-cam-prevenu';

    function installee() {
        try { if (window.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) {}
        return navigator.standalone === true;
    }

    function styles() {
        if (document.getElementById('evcAideCamCss')) return;
        var css = document.createElement('style');
        css.id = 'evcAideCamCss';
        css.textContent = [
            '#evcAideCam{position:fixed;inset:0;z-index:10002;background:#000a;display:flex;align-items:center;justify-content:center;padding:16px;font-family:Inter,system-ui,sans-serif}',
            '#evcAideCam .carte{width:100%;max-width:430px;max-height:calc(100% - 20px);overflow:auto;background:#1c1c20;color:#f5f5f6;border:1px solid #ff1680;border-radius:18px;padding:22px;box-shadow:0 20px 60px #000c}',
            'html[data-theme="light"] #evcAideCam .carte{background:#fff;color:#172039}',
            '#evcAideCam .grand{font-size:40px;text-align:center;margin-bottom:6px}',
            '#evcAideCam h2{font-size:19px;font-weight:800;margin:0 0 10px;text-align:center}',
            '#evcAideCam p{font-size:14px;line-height:1.55;margin:0 0 10px;opacity:.9}',
            '#evcAideCam ol{list-style:none;margin:12px 0;padding:0;display:grid;gap:10px}',
            '#evcAideCam li{display:flex;gap:10px;font-size:14px;line-height:1.45}',
            '#evcAideCam .num{width:26px;height:26px;border-radius:50%;background:#e91e63;color:#fff;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}',
            '#evcAideCam .faux{display:inline-block;background:#2f80ed;color:#fff;font-weight:700;border-radius:8px;padding:2px 9px;font-size:13px}',
            '#evcAideCam .boutons{display:flex;gap:8px;margin-top:16px}',
            '#evcAideCam button{flex:1;border:0;border-radius:11px;padding:13px;font:700 15px Inter,system-ui,sans-serif;cursor:pointer}',
            '#evcAideCam .principal{background:#e91e63;color:#fff}',
            '#evcAideCam .secondaire{background:#ffffff14;color:inherit}',
            'html[data-theme="light"] #evcAideCam .secondaire{background:#eef1f6}'
        ].join('\n');
        document.head.appendChild(css);
    }

    function fenetre(html, boutons) {
        styles();
        var ancien = document.getElementById('evcAideCam');
        if (ancien) ancien.remove();
        var el = document.createElement('div');
        el.id = 'evcAideCam';
        el.setAttribute('role', 'dialog');
        el.setAttribute('aria-modal', 'true');
        el.innerHTML = '<div class="carte">' + html + '<div class="boutons">' + boutons + '</div></div>';
        document.body.appendChild(el);
        return el;
    }
    function fermer() { var el = document.getElementById('evcAideCam'); if (el) el.remove(); }

    // Le téléphone a-t-il déjà donné son accord ?
    async function etatPermission() {
        try {
            if (!navigator.permissions || !navigator.permissions.query) return 'inconnu';
            var c = await navigator.permissions.query({ name: 'camera' });
            return c.state;   // granted | prompt | denied
        } catch (e) { return 'inconnu'; }
    }

    // ---------- AVANT la demande du téléphone ----------
    async function prevenir() {
        var etat = await etatPermission();
        if (etat === 'granted') return true;
        var vu = 0;
        try { vu = Number(localStorage.getItem(CLE_VU) || 0); } catch (e) {}
        // Déjà expliqué deux fois et pas de refus connu : on ne répète pas à chaque fois
        if (etat !== 'denied' && vu >= 2) return true;
        try { localStorage.setItem(CLE_VU, String(vu + 1)); } catch (e) {}

        return new Promise(function (resolve) {
            var el = fenetre(
                '<div class="grand" aria-hidden="true">📷</div>'
                + '<h2>Ton téléphone va te demander l\'accès</h2>'
                + '<p>Pour allumer ta caméra, ' + (iOS ? 'ton iPhone' : 'ton téléphone') + ' va afficher une question pour la <b>caméra</b> et le <b>micro</b>.</p>'
                + '<p>Appuie sur <span class="faux">Autoriser</span> pour que ça fonctionne.</p>'
                + '<p style="font-size:12px;opacity:.65;margin:0">Tu pourras couper ta caméra à tout moment.</p>',
                '<button class="secondaire" data-non>Annuler</button><button class="principal" data-oui>Continuer</button>');
            el.querySelector('[data-oui]').onclick = function () { fermer(); resolve(true); };
            el.querySelector('[data-non]').onclick = function () { fermer(); resolve(false); };
        });
    }

    // ---------- APRÈS un refus ou un problème ----------
    function etapesRefus() {
        if (iOS && installee()) return [
            'Ferme complètement l\'appli : fais glisser le bas de l\'écran vers le haut, puis balaie E-VISIOCAM vers le haut',
            'Rouvre l\'appli et rallume ta caméra',
            'Cette fois, appuie sur <span class="faux">Autoriser</span>',
            'Toujours bloqué ? Ouvre <b>Réglages</b> → <b>Apps</b> → <b>Safari</b> → <b>Caméra</b> et <b>Micro</b> → choisis « Demander » ou « Autoriser »'
        ];
        if (iOS) return [
            'Appuie sur l\'icône à gauche de l\'adresse du site (<b>aA</b> ou <b>☰</b>)',
            'Choisis « <b>Réglages du site web</b> »',
            'Mets <b>Caméra</b> et <b>Micro</b> sur « Autoriser »',
            'Reviens ici et appuie sur « Réessayer »'
        ];
        if (android && installee()) return [
            'Garde le doigt appuyé sur l\'icône E-VISIOCAM de ton écran d\'accueil',
            'Appuie sur <b>ⓘ</b> (Infos sur l\'appli) puis <b>Autorisations</b>',
            'Mets <b>Caméra</b> et <b>Micro</b> sur « Autoriser »',
            'Reviens ici et appuie sur « Réessayer »'
        ];
        if (android) return [
            'Appuie sur l\'icône à gauche de l\'adresse du site (cadenas ou réglages)',
            'Appuie sur <b>Autorisations</b>',
            'Mets <b>Caméra</b> et <b>Micro</b> sur « Autoriser »',
            'Reviens ici et appuie sur « Réessayer »'
        ];
        return [
            'Clique sur l\'icône à gauche de l\'adresse du site (cadenas ou réglages)',
            'Autorise la <b>Caméra</b> et le <b>Micro</b> pour ce site',
            'Reviens ici et clique sur « Réessayer »'
        ];
    }

    function expliquerErreur(err, reessayer) {
        var nom = (err && err.name) || '';
        var titre, texte, etapes = null;
        if (nom === 'NotAllowedError' || nom === 'SecurityError' || nom === 'PermissionDeniedError') {
            titre = 'L\'accès à la caméra a été refusé';
            texte = 'Pas de souci, ça se répare en quelques secondes :';
            etapes = etapesRefus();
        } else if (nom === 'NotReadableError' || nom === 'TrackStartError' || nom === 'AbortError') {
            titre = 'Ta caméra est déjà utilisée';
            texte = 'Une autre appli utilise sans doute ta caméra (FaceTime, WhatsApp, Snapchat, un appel en cours…).';
            etapes = ['Ferme cette autre appli ou raccroche l\'appel', 'Reviens ici et appuie sur « Réessayer »'];
        } else if (nom === 'NotFoundError' || nom === 'DevicesNotFoundError') {
            titre = 'Aucune caméra trouvée';
            texte = 'Ton appareil ne semble pas avoir de caméra disponible, ou elle est désactivée.';
        } else if (nom === 'NonDisponible') {
            titre = 'Caméra indisponible ici';
            texte = 'Ce navigateur ne permet pas d\'utiliser la caméra. Ouvre E-VISIOCAM dans ' + (iOS ? 'Safari' : 'Chrome') + ', ou installe l\'appli.';
        } else {
            titre = 'La caméra n\'a pas pu démarrer';
            texte = 'Réessaie dans un instant. Si ça continue, ferme et rouvre l\'appli.';
        }
        var liste = etapes ? '<ol>' + etapes.map(function (t, i) { return '<li><span class="num">' + (i + 1) + '</span><span>' + t + '</span></li>'; }).join('') + '</ol>' : '';
        var el = fenetre(
            '<div class="grand" aria-hidden="true">🎥</div><h2>' + titre + '</h2><p>' + texte + '</p>' + liste,
            '<button class="secondaire" data-fermer>Fermer</button>' + (reessayer ? '<button class="principal" data-reessayer>Réessayer</button>' : ''));
        el.querySelector('[data-fermer]').onclick = fermer;
        var r = el.querySelector('[data-reessayer]');
        if (r) r.onclick = function () { fermer(); reessayer(); };
    }

    window.EvcAideCam = { prevenir: prevenir, expliquerErreur: expliquerErreur, fermer: fermer };
})();
