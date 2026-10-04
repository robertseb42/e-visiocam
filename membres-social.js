// ============================================================
// E-VISIOCAM — Fiche membre + demandes de cam (toutes les pages)
// ------------------------------------------------------------
//   EvcFiche.ouvrir(id)        petite fenêtre : photo, pseudo, niveau, badges, bio, « membre depuis »,
//                              boutons Message · Demander la cam · Voir sa caméra
//   EvcCam.demander(id, nom)   envoie une demande de cam (l'autre accepte ou refuse)
// Les demandes reçues et les réponses arrivent toutes les 15 s (et tout de suite si la page
// a une connexion temps réel) sous forme de cartes en haut à droite.
// Accepter ouvre la page Live avec un live privé préparé : seul le demandeur est invité,
// et c'est le membre qui clique lui-même sur « Lancer le live ».
// Tout le texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    if (window.EvcCam) return;

    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    var SANS = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html', 'nouveau-mdp.html', 'verifier-email.html', '404.html'];
    function connecte() { return typeof getCurrentUser === 'function' && !!getCurrentUser(); }
    function base() { return (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api'); }
    function photoDe(chemin) { return typeof urlAvatar === 'function' ? urlAvatar(chemin) : null; }
    function el(tag, cls, texte) { var n = document.createElement(tag); if (cls) n.className = cls; if (texte !== undefined) n.textContent = texte; return n; }
    async function api(chemin, opts) {
        if (typeof apiCall === 'function') return apiCall(chemin, opts);
        var r = await fetch(base() + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(d.error || 'Erreur');
        return d;
    }
    // Navigation : dans le cadre de la radio continue, on change la page du cadre (la radio continue de jouer)
    function aller(url) { location.href = url; }

    // ---------- Styles ----------
    var css = [
        '.evs-voile{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;animation:evsIn .15s ease}',
        '.evs-fiche{position:relative;width:100%;max-width:360px;background:#1c1c20;color:#f5f5f7;border:1px solid #33333b;border-radius:22px;padding:22px 20px 18px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}',
        'html[data-theme="light"] .evs-fiche{background:#fff;color:#14161c;border-color:#e2e8f0}',
        '.evs-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(127,127,127,.15);color:inherit;font-size:16px;cursor:pointer}',
        '.evs-photo{width:128px;height:128px;margin:0 auto 12px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#ff1680,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;color:#fff;box-shadow:0 0 0 4px rgba(255,229,0,.0)}',
        '.evs-photo.on{box-shadow:0 0 0 4px #ffe500}.evs-photo.live{box-shadow:0 0 0 4px #f43f5e,0 0 26px rgba(244,63,94,.5)}',
        '.evs-photo img{width:100%;height:100%;object-fit:cover}',
        '.evs-nom{margin:0;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px}',
        '.evs-point{width:11px;height:11px;border-radius:50%;flex:none}.evs-point.on{background:#ffe500}.evs-point.live{background:#f43f5e}',
        '.evs-sous{margin:4px 0 0;font-size:12.5px;opacity:.7}',
        '.evs-badges{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:12px 0 0}',
        '.evs-badge{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(127,127,127,.15)}',
        '.evs-bio{margin:14px 0 0;font-size:13.5px;line-height:1.55;opacity:.9;white-space:pre-line;word-break:break-word}',
        '.evs-actions{display:flex;flex-direction:column;gap:8px;margin-top:18px}',
        '.evs-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 14px;border-radius:12px;border:0;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;background:rgba(127,127,127,.16);color:inherit}',
        '.evs-btn.jaune{background:#ffe500;color:#111113}.evs-btn.rouge{background:#f43f5e;color:#fff}',
        '.evs-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.evs-note{margin:10px 0 0;font-size:11.5px;opacity:.6}',
        '.evs-pile{position:fixed;top:76px;right:16px;z-index:2147482500;display:flex;flex-direction:column;gap:10px;width:min(340px,calc(100vw - 32px))}',
        '.evs-carte{display:flex;gap:12px;align-items:flex-start;background:#1c1c20;color:#f5f5f7;border:1px solid #3b3b43;border-left:4px solid #ffe500;border-radius:16px;padding:12px 14px;box-shadow:0 14px 40px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif;animation:evsIn .2s ease}',
        'html[data-theme="light"] .evs-carte{background:#fff;color:#14161c;border-color:#e2e8f0;border-left-color:#e91e63}',
        '.evs-carte.rouge{border-left-color:#f43f5e}',
        '.evs-mini{width:44px;height:44px;border-radius:50%;flex:none;overflow:hidden;background:linear-gradient(135deg,#ff1680,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900}',
        '.evs-mini img{width:100%;height:100%;object-fit:cover}',
        '.evs-txt{flex:1;min-width:0}.evs-txt b{font-weight:800}.evs-txt p{margin:0;font-size:13.5px;line-height:1.45}',
        '.evs-txt small{display:block;margin-top:2px;font-size:11.5px;opacity:.65}',
        '.evs-rang{display:flex;gap:8px;margin-top:10px}.evs-rang .evs-btn{padding:8px 10px;font-size:13px}',
        '.evs-fermer{border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:15px;padding:0 0 0 4px}',
        '@keyframes evsIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion:reduce){.evs-voile,.evs-carte{animation:none}}'
    ].join('\n');
    function styles() {
        if (document.getElementById('evs-styles')) return;
        var s = document.createElement('style'); s.id = 'evs-styles'; s.textContent = css; document.head.appendChild(s);
    }
    function mini(id, nom) {
        var m = el('div', 'evs-mini', (nom || '?').charAt(0).toUpperCase());
        var img = new Image(); img.alt = '';
        img.onload = function () { m.textContent = ''; m.appendChild(img); };
        img.src = base().replace(/\/api\/?$/, '') + '/api/avatars/' + Number(id);   // 404 si pas de photo validée : on garde l'initiale
        return m;
    }

    // ---------- Petit message ----------
    function info(texte, type) {
        if (typeof showToast === 'function') { try { showToast(texte, type || 'success'); return; } catch (e) {} }
        styles();
        var c = el('div', 'evs-carte' + (type === 'error' ? ' rouge' : ''));
        c.appendChild(el('div', 'evs-txt')).appendChild(el('p', '', texte));
        pile().appendChild(c);
        setTimeout(function () { c.remove(); }, 5000);
    }
    function pile() {
        var p = document.getElementById('evs-pile');
        if (!p) { p = el('div', 'evs-pile'); p.id = 'evs-pile'; p.setAttribute('aria-live', 'polite'); document.body.appendChild(p); }
        return p;
    }
    function son() {
        try {
            var A = window.AudioContext || window.webkitAudioContext; if (!A) return;
            var ctx = new A(), t = ctx.currentTime;
            [880, 1320].forEach(function (f, i) {
                var o = ctx.createOscillator(), g = ctx.createGain();
                o.frequency.value = f; o.type = 'sine';
                g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
                o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
            });
            setTimeout(function () { try { ctx.close(); } catch (e) {} }, 800);
        } catch (e) {}
    }

    // ============================================================
    // FICHE MEMBRE
    // ============================================================
    function fermerFiche() { var v = document.getElementById('evs-voile'); if (v) v.remove(); document.removeEventListener('keydown', echap); }
    function echap(e) { if (e.key === 'Escape') fermerFiche(); }
    async function ouvrirFiche(id) {
        if (!connecte()) { aller('login.html'); return; }
        styles(); fermerFiche();
        var voile = el('div', 'evs-voile'); voile.id = 'evs-voile';
        var f = el('div', 'evs-fiche'); f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true');
        f.appendChild(el('p', 'evs-sous', 'Chargement…'));
        voile.appendChild(f); document.body.appendChild(voile);
        voile.addEventListener('click', function (e) { if (e.target === voile) fermerFiche(); });
        document.addEventListener('keydown', echap);
        var m;
        try { m = (await api('/models/profil/' + Number(id))).membre; }
        catch (e) { f.textContent = ''; f.appendChild(el('p', 'evs-sous', e.message || 'Fiche indisponible')); return; }
        f.textContent = '';
        var x = el('button', 'evs-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermerFiche; f.appendChild(x);
        var etat = m.isLive ? 'live' : (m.online || m.moi ? 'on' : '');
        var ph = el('div', 'evs-photo ' + etat, m.username.charAt(0).toUpperCase());
        var src = photoDe(m.avatar);
        if (src) { ph.textContent = ''; var img = new Image(); img.alt = 'Photo de ' + m.username; img.src = src; ph.appendChild(img); }
        f.appendChild(ph);
        var h = el('h2', 'evs-nom'); h.id = 'evs-nom';
        if (etat) h.appendChild(el('span', 'evs-point ' + etat));
        h.appendChild(document.createTextNode(m.username));
        f.setAttribute('aria-labelledby', 'evs-nom');
        f.appendChild(h);
        var roles = { model: '⭐ Modèle', moderator: '🛡️ Modérateur', super_admin: '👑 Équipe E-VISIOCAM' };
        var depuis = m.createdAt ? new Date(String(m.createdAt).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
        var lignes = [m.isLive ? '🔴 En direct' : (m.online || m.moi ? '🟡 Connecté' : 'Hors ligne')];
        if (roles[m.role]) lignes.push(roles[m.role]);
        if (depuis) lignes.push('Membre depuis ' + depuis);
        f.appendChild(el('p', 'evs-sous', lignes.join(' · ')));
        var chips = [];
        if (m.insigne) chips.push(m.insigne.icone + ' ' + m.insigne.nom);
        (m.badges || []).forEach(function (b) { chips.push(b.icone + ' ' + b.nom); });
        if (chips.length) { var bd = el('div', 'evs-badges'); chips.forEach(function (c) { bd.appendChild(el('span', 'evs-badge', c)); }); f.appendChild(bd); }
        if (m.bio) f.appendChild(el('p', 'evs-bio', m.bio));

        var act = el('div', 'evs-actions');
        function lien(cls, texte, url) { var a = el('a', 'evs-btn ' + cls, texte); a.href = url; return a; }
        if (m.moi) {
            act.appendChild(lien('jaune', '✏️ Modifier mon profil', 'compte.html'));
        } else {
            if (m.isLive) act.appendChild(lien('rouge', '🎥 Voir sa caméra', 'live.html'));
            act.appendChild(lien(m.isLive ? '' : 'jaune', '💬 Lui écrire', 'messages.html?ecrire=' + Number(m.id)));
            if (!m.isLive) {
                var cam = el('button', 'evs-btn', '📷 Demander sa cam'); cam.type = 'button';
                if (!m.online) { cam.disabled = true; cam.title = m.username + ' n’est pas connecté'; }
                cam.onclick = async function () { cam.disabled = true; var ok = await demander(m.id, m.username); if (ok) { cam.textContent = '✅ Demande envoyée'; } else cam.disabled = false; };
                act.appendChild(cam);
            }
        }
        f.appendChild(act);
        if (!m.moi && !m.isLive) f.appendChild(el('p', 'evs-note', m.online ? 'Il ou elle pourra accepter ou refuser.' : 'Demande de cam possible quand il ou elle est connecté.'));
        x.focus();
    }

    // ============================================================
    // DEMANDES DE CAM
    // ============================================================
    async function demander(id, nom) {
        if (!connecte()) { aller('login.html'); return false; }
        try {
            await api('/cam-requests', { method: 'POST', body: JSON.stringify({ to: Number(id) }) });
            info('📷 Demande envoyée à ' + (nom || 'ce membre') + '. Vous serez prévenu de sa réponse.', 'success');
            return true;
        } catch (e) { info(e.message || 'Demande impossible', 'error'); return false; }
    }

    var affichees = {};
    function carteDemande(d) {
        if (affichees[d.id]) return;
        affichees[d.id] = true;
        styles(); son();
        var c = el('div', 'evs-carte'); c.setAttribute('role', 'alertdialog');
        c.appendChild(mini(d.de.id, d.de.username));
        var t = el('div', 'evs-txt');
        var p = el('p'); var b = el('b', '', d.de.username); p.appendChild(b); p.appendChild(document.createTextNode(' aimerait voir ta cam 📷'));
        t.appendChild(p);
        t.appendChild(el('small', '', 'Si tu acceptes, tu lances un live privé rien que pour lui ou elle. Tu peux refuser sans te justifier.'));
        var r = el('div', 'evs-rang');
        var oui = el('button', 'evs-btn jaune', 'Accepter'); oui.type = 'button';
        var non = el('button', 'evs-btn', 'Refuser'); non.type = 'button';
        var voir = el('button', 'evs-btn', 'Profil'); voir.type = 'button';
        r.appendChild(oui); r.appendChild(non); r.appendChild(voir); t.appendChild(r);
        c.appendChild(t);
        pile().appendChild(c);
        var fin = setTimeout(function () { c.remove(); }, 10 * 60 * 1000);
        voir.onclick = function () { ouvrirFiche(d.de.id); };
        non.onclick = async function () {
            oui.disabled = non.disabled = true;
            try { await api('/cam-requests/' + d.id + '/refuse', { method: 'POST' }); } catch (e) {}
            clearTimeout(fin); c.remove();
        };
        oui.onclick = async function () {
            oui.disabled = non.disabled = true;
            try {
                var rep = await api('/cam-requests/' + d.id + '/accept', { method: 'POST' });
                try { sessionStorage.setItem('evc-live-prive', JSON.stringify(rep.live)); } catch (e) {}
                clearTimeout(fin); c.remove();
                aller('live.html?prive=1&auto=1');
            } catch (e) { info(e.message, 'error'); clearTimeout(fin); c.remove(); }
        };
    }

    // Demande acceptée : on guette son live privé pour proposer « Regarder »
    var guettes = {};
    function guetter(d) {
        var qui = d.a.id, nom = d.a.username, debut = Date.now();
        if (guettes[qui]) return;
        guettes[qui] = setInterval(async function () {
            if (Date.now() - debut > 5 * 60 * 1000) { clearInterval(guettes[qui]); delete guettes[qui]; return; }
            try {
                var r = await fetch(base() + '/streams', { credentials: 'include' });
                var s = ((await r.json()).streams || []).find(function (x) { return x.broadcasterId === qui && x.isPrivate; });
                if (!s) return;
                clearInterval(guettes[qui]); delete guettes[qui];
                if (page === 'live.html') return;   // la page Live affiche déjà sa propre invitation
                styles(); son();
                var c = el('div', 'evs-carte rouge'); c.appendChild(mini(qui, nom));
                var t = el('div', 'evs-txt');
                var p = el('p'); p.appendChild(el('b', '', nom)); p.appendChild(document.createTextNode(' t’a ouvert sa cam 🔒'));
                t.appendChild(p); t.appendChild(el('small', '', 'Live privé : toi seul es invité.'));
                var rg = el('div', 'evs-rang');
                var go = el('button', 'evs-btn rouge', '🎥 Regarder'); go.type = 'button';
                go.onclick = function () { aller('live.html?join=' + encodeURIComponent(s.streamId) + '&from=' + encodeURIComponent(nom)); };
                var plus = el('button', 'evs-btn', 'Plus tard'); plus.type = 'button'; plus.onclick = function () { c.remove(); };
                rg.appendChild(go); rg.appendChild(plus); t.appendChild(rg); c.appendChild(t);
                pile().appendChild(c);
            } catch (e) {}
        }, 5000);
    }
    function reponse(d) {
        if (d.status === 'accepted') {
            info('✅ ' + d.a.username + ' a accepté ! Son live privé arrive : vous serez prévenu.', 'success');
            guetter(d);
        } else if (d.status === 'refused') {
            info(d.a.username + ' a décliné pour cette fois. Pas de souci 🙂', 'info');
        }
    }

    var enCours = false;
    async function releve() {
        if (enCours || !connecte() || document.hidden) return;
        enCours = true;
        try {
            var d = await api('/cam-requests/inbox');
            (d.recues || []).forEach(carteDemande);
            (d.reponses || []).forEach(reponse);
        } catch (e) {} finally { enCours = false; }
    }
    // Pages avec connexion temps réel (salons, live) : notification immédiate
    function brancher(s) {
        if (!s || s.__evsCam) return; s.__evsCam = true;
        s.on('cam:demande', function () { releve(); });
        s.on('cam:reponse', function () { releve(); });
    }

    window.EvcFiche = { ouvrir: ouvrirFiche, fermer: fermerFiche };
    window.EvcCam = { demander: demander, releve: releve, brancher: brancher };

    if (SANS.indexOf(page) === -1) {
        setTimeout(releve, 1500);
        setInterval(releve, 15000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) releve(); });
        setTimeout(function () { if (window.socket && window.socket.on) brancher(window.socket); }, 3000);
    }
    // Tout élément [data-fiche="12"] ouvre la fiche du membre
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-fiche]');
        if (!t) return;
        var bouton = e.target.closest('a,button');
        if (bouton && bouton !== t && t.contains(bouton)) return;   // un bouton dans la carte garde son action
        e.preventDefault(); e.stopPropagation();
        ouvrirFiche(t.getAttribute('data-fiche'));
    }, true);
})();
