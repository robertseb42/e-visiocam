// ============================================================
// E-VISIOCAM - Affichage du mode maintenance
// ------------------------------------------------------------
// Chargé sur toutes les pages. Interroge GET /api/maintenance (public).
//  - visiteurs et membres : page d'attente plein écran ;
//  - pages de connexion et pages légales : simple bandeau (elles restent utilisables) ;
//  - super admin : bandeau rouge "maintenance active" + lien vers le panneau.
// Si l'API ne répond pas, on n'affiche rien (le site ne se bloque pas tout seul).
// IMPORTANT : le blocage réel est fait par le serveur. Cet écran n'est qu'un affichage.
// ============================================================
(function () {
    'use strict';
    if (window.EvcMaintenance) return;

    var POLL_MS = 60 * 1000;
    var TIMEOUT_MS = 7000;
    // Pages qui restent utilisables (connexion du super admin, obligations légales)
    var BANNER_PAGES = ['login.html', 'forgot-password.html', 'reset-password.html', 'nouveau-mdp.html',
        'cgu.html', 'mentions-legales.html', 'confidentialite.html', 'rgpd.html', 'cookies.html'];
    var ID_OVERLAY = 'evc-maintenance-overlay';
    var ID_BANNER = 'evc-maintenance-banner';

    function apiBase() {
        if (typeof API_URL !== 'undefined' && API_URL) return API_URL;
        var h = location.hostname;
        return (h === 'localhost' || h === '127.0.0.1') ? 'http://localhost:3000/api' : 'https://api.e-visiocam.com/api';
    }

    function currentRole() {
        try { return (JSON.parse(localStorage.getItem('evisiocam_user')) || {}).role || null; } catch (e) { return null; }
    }

    function pageName() {
        var p = (location.pathname.split('/').pop() || '').toLowerCase();
        return p || 'index.html';
    }

    // Que faut-il afficher ? 'none' | 'overlay' | 'banner-admin' | 'banner-info'
    function decide(state, page, role) {
        if (!state || state.enabled !== true) return 'none';
        if (role === 'super_admin') return 'banner-admin';
        if (BANNER_PAGES.indexOf(page) !== -1) return 'banner-info';
        return 'overlay';
    }

    function clear() {
        [ID_OVERLAY, ID_BANNER].forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        });
        document.documentElement.style.overflow = '';
    }

    function el(tag, css, text) {
        var n = document.createElement(tag);
        if (css) n.style.cssText = css;
        if (text !== undefined) n.textContent = text;   // jamais de HTML : le message vient de l'admin
        return n;
    }

    function banner(text, bg, fg, linkText, linkHref) {
        var b = el('div', 'background:' + bg + ';color:' + fg + ';padding:10px 16px;font:600 14px/1.4 system-ui,sans-serif;text-align:center;position:relative;z-index:2147483000');
        b.id = ID_BANNER;
        b.setAttribute('role', 'status');
        b.appendChild(document.createTextNode(text));
        if (linkText) {
            var a = el('a', 'color:inherit;text-decoration:underline;margin-left:10px', linkText);
            a.href = linkHref;
            b.appendChild(a);
        }
        document.body.insertBefore(b, document.body.firstChild);
    }

    function overlay(state) {
        var o = el('div', 'position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;padding:24px;' +
            'background:radial-gradient(circle at 30% 20%,#2a1030,#0c0a12 70%);color:#fff;font-family:system-ui,sans-serif;overflow:auto');
        o.id = ID_OVERLAY;
        o.setAttribute('role', 'dialog');
        o.setAttribute('aria-modal', 'true');
        o.setAttribute('aria-labelledby', ID_OVERLAY + '-t');
        var card = el('div', 'max-width:520px;width:100%;text-align:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);' +
            'border-radius:20px;padding:40px 28px;box-shadow:0 20px 60px rgba(0,0,0,.45)');
        card.appendChild(el('div', 'font-size:52px;line-height:1;margin-bottom:14px', '🛠️'));
        var t = el('h1', 'margin:0 0 12px;font-size:26px;font-weight:800', 'Maintenance en cours');
        t.id = ID_OVERLAY + '-t';
        card.appendChild(t);
        card.appendChild(el('p', 'margin:0 0 22px;font-size:16px;line-height:1.6;color:#e7e2ee;white-space:pre-line', state.message || ''));
        card.appendChild(el('p', 'margin:0 0 22px;font-size:13px;color:#a79db5', 'Cette page se met à jour toute seule : revenez dans quelques instants.'));
        var a = el('a', 'color:#c9bfd8;font-size:12px;text-decoration:underline', 'Accès administrateur');
        a.href = 'login.html';
        card.appendChild(a);
        o.appendChild(card);
        document.body.appendChild(o);
        document.documentElement.style.overflow = 'hidden';
    }

    function render(state) {
        if (!document.body) return;
        clear();
        var mode = decide(state, pageName(), currentRole());
        if (mode === 'overlay') overlay(state);
        else if (mode === 'banner-admin') banner('🛠️ Mode maintenance ACTIF : les visiteurs voient la page d\'attente, vous seul avez accès au site.', '#b91c1c', '#fff', 'Gérer', 'admin.html');
        else if (mode === 'banner-info') banner(pageName() === 'login.html' ? 'Maintenance en cours : seul le super administrateur peut se connecter pour le moment.' : (state.message || 'Maintenance en cours.'), '#fef3c7', '#78350f');
    }

    function check() {
        var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
        var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, TIMEOUT_MS) : null;
        return fetch(apiBase() + '/maintenance', { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (state) { if (state) render(state); })
            .catch(function () { /* API injoignable : on ne bloque rien */ })
            .then(function () { if (timer) clearTimeout(timer); });
    }

    function start() {
        check();
        setInterval(check, POLL_MS);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) check(); });
    }

    window.EvcMaintenance = {
        refresh: check,
        // appelé par apiCall quand le serveur répond 503 "maintenance"
        show: function (d) { render({ enabled: true, message: (d && (d.message || d.error)) || '', since: d && d.since }); },
        _decide: decide
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
