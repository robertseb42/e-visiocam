// ============================================================
// E-VISIOCAM — Service worker (notifications push uniquement)
// ------------------------------------------------------------
// Pas de cache ni d'interception des requêtes : le site se charge exactement comme avant.
// Rôle : afficher les notifications envoyées par le serveur (messages privés, favoris en direct)
// et ouvrir la bonne page quand on touche la notification.
// Enregistré par push-client.js avec la portée « / ».
// ============================================================
'use strict';

var API = (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000/api'
    : 'https://api.e-visiocam.com/api';

self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

// Adresse interne au site uniquement (jamais un autre domaine)
function adresseSure(url) {
    try {
        var u = new URL(url || '/', self.location.origin);
        return u.origin === self.location.origin ? u.href : self.location.origin + '/';
    } catch (e) { return self.location.origin + '/'; }
}

self.addEventListener('push', function (event) {
    var d = {};
    try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }
    var titre = String(d.title || 'E-VISIOCAM').slice(0, 80);
    var options = {
        body: String(d.body || '').slice(0, 160),
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: String(d.tag || 'evc'),
        renotify: true,           // un nouveau message dans la même conversation fait de nouveau signe
        lang: 'fr',
        data: { url: adresseSure(d.url) }
    };
    event.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', function (event) {
    event.notification.close();
    var cible = (event.notification.data && event.notification.data.url) || (self.location.origin + '/');
    event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (onglets) {
        var i;
        for (i = 0; i < onglets.length; i++) {   // la page est déjà ouverte : on la montre
            if (onglets[i].url === cible && 'focus' in onglets[i]) return onglets[i].focus();
        }
        for (i = 0; i < onglets.length; i++) {   // un onglet du site est ouvert : on l'emmène sur la page
            var o = onglets[i];
            if (o.url.indexOf(self.location.origin) === 0 && 'navigate' in o) {
                return o.focus().then(function (c) { return (c || o).navigate(cible); }).catch(function () {
                    return self.clients.openWindow(cible);
                });
            }
        }
        return self.clients.openWindow(cible);
    }));
});

// Le navigateur a renouvelé l'abonnement : on prévient le serveur (réglages conservés).
self.addEventListener('pushsubscriptionchange', function (event) {
    var ancien = event.oldSubscription;
    var cle = ancien && ancien.options && ancien.options.applicationServerKey;
    if (!cle) return;
    function appel(chemin, corps) {
        return fetch(API + chemin, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(corps)
        }).then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    }
    event.waitUntil(appel('/push/etat', { endpoint: ancien.endpoint }).then(function (etat) {
        if (!etat || !etat.abonne) return;   // désactivé entre-temps (ou session terminée) : rien à faire
        return (event.newSubscription ? Promise.resolve(event.newSubscription)
            : self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: cle }))
            .then(function (nouveau) {
                return appel('/push/subscribe', { subscription: nouveau.toJSON(), prefs: (etat && etat.prefs) || undefined });
            })
            .then(function () { return appel('/push/unsubscribe', { endpoint: ancien.endpoint }); });
    }).catch(function () {}));
});
