// ============================================================
// E-VISIOCAM — Notifications push : réglages « Notifications » de compte.html
// ------------------------------------------------------------
// - la permission n'est demandée QUE lorsque le membre clique sur « Activer »
// - service worker /sw.js (portée « / »), clé publique VAPID lue sur /api/push/public-key
// - interrupteurs « Messages privés », « Favoris en direct », « Soirées du programme »
//   et « Demandes d'amis » (seulement si le serveur renvoie ce réglage), bouton « Désactiver »
// - iPhone / iPad : uniquement depuis l'icône ajoutée à l'écran d'accueil (iOS 16.4+)
// Dépend de auth-api.js (API_URL, apiCall). Aucun script inline (CSP stricte).
// ============================================================
(function () {
    'use strict';

    var SW_URL = '/sw.js';

    function estIOS() {
        var ua = navigator.userAgent || '';
        return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    }
    function estInstallee() {
        try { if (window.matchMedia('(display-mode: standalone)').matches) return true; } catch (e) {}
        return navigator.standalone === true;
    }
    function supporte() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext !== false;
    }

    function enOctets(base64url) {
        var pad = '='.repeat((4 - base64url.length % 4) % 4);
        var b = atob((base64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
        var out = new Uint8Array(b.length);
        for (var i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
        return out;
    }
    function memeCle(abo, cle) {
        try {
            var a = new Uint8Array(abo.options.applicationServerKey), b = enOctets(cle);
            if (a.length !== b.length) return false;
            for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
            return true;
        } catch (e) { return true; }   // navigateur qui ne donne pas la clé : on garde l'abonnement
    }

    var cleServeur = null;
    function lireCle() {
        if (cleServeur) return Promise.resolve(cleServeur);
        return apiCall('/push/public-key').then(function (d) { cleServeur = d.publicKey; return cleServeur; });
    }
    function inscription() {
        return navigator.serviceWorker.getRegistration('/').then(function (r) { return r || null; });
    }
    function abonnementActuel() {
        return inscription().then(function (r) { return r ? r.pushManager.getSubscription() : null; });
    }

    // ---------- Interface ----------
    var el = {};
    function $(id) { return document.getElementById(id); }

    function message(texte, ton) {
        if (!el.msg) return;
        el.msg.hidden = !texte;
        el.msg.textContent = texte || '';
        var tons = {
            info: 'text-xs mb-3 p-3 rounded-xl bg-slate-50 text-slate-600',
            ok: 'text-xs mb-3 p-3 rounded-xl bg-emerald-50 text-emerald-700',
            alerte: 'text-xs mb-3 p-3 rounded-xl bg-amber-50 text-amber-700',
            erreur: 'text-xs mb-3 p-3 rounded-xl bg-rose-50 text-rose-600'
        };
        el.msg.className = tons[ton || 'info'];
    }
    function afficher(etat) {
        // etat : 'actif' | 'inactif' | 'indisponible'
        el.activer.hidden = etat !== 'inactif';
        el.desactiver.hidden = etat !== 'actif';
        el.reglages.hidden = etat !== 'actif';
    }
    function occupe(oui) {
        el.activer.disabled = oui; el.desactiver.disabled = oui;
        interrupteurs().forEach(function (i) { i.input.disabled = oui; });
    }

    // Réglage ↔ case à cocher. « amis » n'apparaît que si le serveur le connaît.
    function interrupteurs() {
        return [
            { cle: 'dm', input: el.dm },
            { cle: 'favori_live', input: el.live },
            { cle: 'evenements', input: el.evenements },
            { cle: 'amis', input: el.amis, zone: el.amisZone, optionnel: true }
        ].filter(function (i) { return i.input; });
    }
    function appliquerPrefs(prefs) {
        prefs = prefs || {};
        interrupteurs().forEach(function (i) {
            var connu = Object.prototype.hasOwnProperty.call(prefs, i.cle);
            if (i.optionnel && i.zone) i.zone.hidden = !connu;
            if (connu) i.input.checked = !!prefs[i.cle];
        });
    }
    function prefsCochees() {
        var p = {};
        interrupteurs().forEach(function (i) {
            if (i.optionnel && i.zone && i.zone.hidden) return;   // réglage inconnu du serveur : on n'envoie rien
            p[i.cle] = i.input.checked;
        });
        return p;
    }

    function verifier() {
        if (!supporte()) {
            afficher('indisponible');
            if (estIOS() && !estInstallee()) {
                message('Sur iPhone et iPad, les notifications ne fonctionnent que depuis l’icône E-VISIOCAM de l’écran d’accueil : touchez le bouton Partager, puis « Sur l’écran d’accueil », ouvrez le site depuis cette icône et revenez ici (iOS 16.4 ou plus récent).', 'alerte');
            } else {
                message('Ce navigateur ne permet pas les notifications. Essayez avec une version récente de Chrome, Firefox, Edge ou Safari.', 'alerte');
            }
            return Promise.resolve();
        }
        return lireCle().then(function () {
            return abonnementActuel();
        }).then(function (abo) {
            if (Notification.permission === 'denied') {
                afficher('indisponible');
                message('Vous avez bloqué les notifications pour ce site. Autorisez-les dans les réglages du navigateur (icône à gauche de l’adresse du site), puis rechargez la page.', 'alerte');
                return;
            }
            if (!abo) { afficher('inactif'); message(''); return; }
            return apiCall('/push/etat', { method: 'POST', body: JSON.stringify({ endpoint: abo.endpoint }) }).then(function (d) {
                if (d.abonne && memeCle(abo, cleServeur)) {
                    appliquerPrefs(d.prefs);
                    afficher('actif');
                    message('Notifications activées sur cet appareil.', 'ok');
                } else {
                    afficher('inactif'); message('');
                }
            });
        }).catch(function (e) {
            afficher('indisponible');
            message(e && /indisponible/i.test(e.message || '') ? 'Les notifications ne sont pas encore disponibles. Réessayez plus tard.' : 'Impossible de vérifier les notifications pour le moment.', 'info');
        });
    }

    function activer() {
        // La demande d'autorisation part tout de suite, dans le clic (obligatoire sur Safari).
        var permission = Notification.requestPermission();
        var enregistrement = navigator.serviceWorker.register(SW_URL, { scope: '/' });
        occupe(true);
        message('Activation…', 'info');
        Promise.all([permission, enregistrement, lireCle()]).then(function (r) {
            if (r[0] !== 'granted') {
                var e = new Error(r[0] === 'denied'
                    ? 'Vous avez refusé les notifications. Pour changer d’avis, autorisez-les dans les réglages du navigateur, puis rechargez la page.'
                    : 'Les notifications n’ont pas été autorisées.');
                e.affichable = true; throw e;
            }
            return navigator.serviceWorker.ready.then(function (reg) {
                return reg.pushManager.getSubscription().then(function (abo) {
                    if (abo && !memeCle(abo, r[2])) return abo.unsubscribe().then(function () { return null; });
                    return abo;
                }).then(function (abo) {
                    return abo || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: enOctets(r[2]) });
                });
            });
        }).then(function (abo) {
            return apiCall('/push/subscribe', {
                method: 'POST',
                body: JSON.stringify({ subscription: abo.toJSON(), prefs: prefsCochees() })
            });
        }).then(function (d) {
            appliquerPrefs(d.prefs);
            afficher('actif');
            message('Notifications activées sur cet appareil.', 'ok');
        }).catch(function (e) {
            afficher(Notification.permission === 'denied' ? 'indisponible' : 'inactif');
            message(e && e.affichable ? e.message : 'L’activation n’a pas abouti' + (e && e.message ? ' (' + e.message + ')' : '') + '. Réessayez dans un instant.', 'erreur');
        }).then(function () { occupe(false); });
    }

    function desactiver() {
        occupe(true);
        abonnementActuel().then(function (abo) {
            if (!abo) return;
            var ep = abo.endpoint;
            return apiCall('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: ep }) })
                .catch(function () {})
                .then(function () { return abo.unsubscribe(); });
        }).then(function () {
            afficher('inactif');
            message('Notifications désactivées sur cet appareil.', 'info');
        }).catch(function () {
            message('La désactivation n’a pas abouti. Réessayez dans un instant.', 'erreur');
        }).then(function () { occupe(false); });
    }

    function reglage() {
        occupe(true);
        abonnementActuel().then(function (abo) {
            if (!abo) throw new Error('absent');
            var corps = prefsCochees();
            corps.endpoint = abo.endpoint;
            return apiCall('/push/prefs', { method: 'PUT', body: JSON.stringify(corps) });
        }).then(function (d) {
            appliquerPrefs(d.prefs);
            message('Réglages enregistrés.', 'ok');
        }).catch(function () {
            message('Le réglage n’a pas été enregistré. Réessayez.', 'erreur');
            return verifier();
        }).then(function () { occupe(false); });
    }

    function demarrer() {
        el = { zone: $('pushZone'), msg: $('pushMessage'), reglages: $('pushReglages'), dm: $('pushDm'), live: $('pushLive'),
               evenements: $('pushEvenements'), amis: $('pushAmis'), amisZone: $('pushAmisZone'),
               activer: $('pushActiver'), desactiver: $('pushDesactiver') };
        if (!el.zone || !el.activer || typeof apiCall !== 'function') return;
        el.activer.addEventListener('click', activer);
        el.desactiver.addEventListener('click', desactiver);
        interrupteurs().forEach(function (i) { i.input.addEventListener('change', reglage); });
        verifier();
    }

    window.EvcPush = { supporte: supporte, verifier: function () { return verifier(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
    else demarrer();
})();
