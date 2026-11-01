// ============================================================
// E-VISIOCAM — Sécurité entre membres : signaler, bloquer, membres bloqués
// ------------------------------------------------------------
//   EvcSecurite.signaler({ type, userId, username, messageId, source, extrait })
//        type = 'user' (un membre) ou 'message' (source = 'salon' | 'prive').
//        Fenêtre en un geste : on touche un motif, le signalement part. Pour un message,
//        le SERVEUR joint lui-même la preuve (texte, auteur, date, salon) : rien n'est recopié ici.
//   EvcSecurite.bloquer(id, nom) / debloquer(id, nom)   → Promise<boolean>
//   EvcSecurite.charger() → Promise<Set>   EvcSecurite.estBloque(id)   EvcSecurite.brancher(socket)
//   EvcSecurite.lienProfil(nom) → 'membre.html?u=…'
//
// Boutons déclarés dans le HTML (aucun onclick : CSP stricte) :
//   <button data-evc-signaler="message" data-msg-id="12" data-source="salon" data-uid="3" data-nom="Pseudo">
//   <button data-evc-signaler="user" data-uid="3" data-nom="Pseudo">
//   <button data-evc-bloquer data-uid="3" data-nom="Pseudo">
// Un élément [data-evc-auteur="3"] est masqué tant que le membre 3 est bloqué ;
// son texte (pour l'aperçu du signalement) est lu dans son [data-evc-texte].
// Un conteneur #evcBlocages reçoit la liste « Membres bloqués » avec « Débloquer ».
// Tout texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    if (window.EvcSecurite) return;

    var MOTIFS = [
        ['harcelement', 'Harcèlement, insultes'],
        ['contenu_sexuel_non_consenti', 'Contenu sexuel non consenti'],
        ['mineur', 'Personne mineure'],
        ['spam', 'Spam, arnaque, publicité'],
        ['violence', 'Menaces, violence'],
        ['contenu_illegal', 'Contenu illégal'],
        ['comportement', 'Comportement inapproprié'],
        ['autre', 'Autre raison']
    ];
    var CLE = 'evc-bloques';

    function connecte() { return typeof getCurrentUser === 'function' && !!getCurrentUser(); }
    function base() { return (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api'); }
    async function api(chemin, opts) {
        if (typeof apiCall === 'function') return apiCall(chemin, opts);
        var r = await fetch(base() + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok) { var er = new Error(d.error || 'Erreur'); er.status = r.status; throw er; }
        return d;
    }
    // Dans le cadre de la radio continue, les fenêtres s'affichent dans la page principale (au-dessus de la radio)
    function haut() { try { if (window.top !== window && window.top.document && window.top.document.body) return window.top.document; } catch (e) {} return document; }
    function el(tag, cls, texte) { var n = haut().createElement(tag); if (cls) n.className = cls; if (texte !== undefined) n.textContent = texte; return n; }
    function lienProfil(nom) { return 'membre.html?u=' + encodeURIComponent(String(nom || '')); }

    // ---------- Styles (thème sombre par défaut, thème clair via html[data-theme="light"]) ----------
    var css = [
        '.evq-voile{position:fixed;inset:0;z-index:2147482100;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;animation:evqIn .15s ease}',
        '.evq-boite{position:relative;width:100%;max-width:400px;max-height:calc(100vh - 32px);overflow:auto;background:#1c1c20;color:#f5f5f7;border:1px solid #33333b;border-radius:20px;padding:20px 18px 16px;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif;font-size:14px}',
        'html[data-theme="light"] .evq-boite{background:#fff;color:#14161c;border-color:#e2e8f0}',
        '.evq-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(127,127,127,.15);color:inherit;font-size:16px;cursor:pointer}',
        '.evq-titre{margin:0 40px 6px 0;font-size:18px;font-weight:900;line-height:1.3;word-break:break-word}',
        '.evq-sous{margin:0 0 12px;font-size:12.5px;opacity:.75;line-height:1.45}',
        '.evq-extrait{margin:0 0 12px;padding:10px 12px;border-left:3px solid #f43f5e;border-radius:8px;background:rgba(127,127,127,.12);font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;max-height:110px;overflow:auto}',
        '.evq-zone{width:100%;box-sizing:border-box;min-height:58px;resize:vertical;padding:9px 11px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:rgba(127,127,127,.08);color:inherit;font:inherit;font-size:13px;margin:0 0 12px}',
        '.evq-label{margin:0 0 8px;font-size:12px;font-weight:800;opacity:.85}',
        '.evq-motifs{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
        '@media (max-width:360px){.evq-motifs{grid-template-columns:1fr}}',
        '.evq-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:44px;padding:9px 10px;border-radius:12px;border:0;font-weight:800;font-size:13px;line-height:1.25;cursor:pointer;background:rgba(127,127,127,.16);color:inherit;text-align:center;text-decoration:none;font-family:inherit}',
        '.evq-btn:hover{background:rgba(127,127,127,.26)}',
        '.evq-btn.rouge{background:#f43f5e;color:#fff}.evq-btn.rouge:hover{background:#e11d48}',
        '.evq-btn.jaune{background:#ffe500;color:#111113}',
        '.evq-btn:disabled{opacity:.5;cursor:wait}',
        '.evq-rang{display:flex;gap:8px;margin-top:14px}',
        '.evq-err{margin:10px 0 0;color:#fb7185;font-size:13px;font-weight:700}',
        'html[data-theme="light"] .evq-err{color:#e11d48}',
        '.evq-ok{font-size:40px;text-align:center;margin:6px 0 4px}',
        '.evq-toasts{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147482600;display:flex;flex-direction:column;gap:8px;width:min(420px,calc(100vw - 32px))}',
        '.evq-toast{background:#1c1c20;color:#f5f5f7;border:1px solid #3b3b43;border-left:4px solid #ffe500;border-radius:14px;padding:11px 14px;font:600 13.5px/1.45 Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.45);animation:evqIn .2s ease}',
        '.evq-toast.erreur{border-left-color:#f43f5e}',
        'html[data-theme="light"] .evq-toast{background:#fff;color:#14161c;border-color:#e2e8f0}',
        '@keyframes evqIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion:reduce){.evq-voile,.evq-toast{animation:none}}'
    ].join('\n');
    // Petit drapeau « Signaler » à côté des messages : visible au survol (souris), toujours visible au toucher
    var cssPage = [
        '.evc-flag{display:inline-flex;align-items:center;justify-content:center;min-width:30px;min-height:28px;padding:2px 6px;border:0;border-radius:8px;background:transparent;color:inherit;font-size:12px;line-height:1;cursor:pointer;opacity:0;transition:opacity .15s,background .15s}',
        '[data-evc-auteur]:hover .evc-flag,[data-evc-msg]:hover .evc-flag,.evc-flag:focus-visible{opacity:.85}',
        '.evc-flag:hover{background:rgba(244,63,94,.15);opacity:1}',
        '@media (hover:none){.evc-flag{opacity:.6}}',
        '.evc-profil-lien{color:inherit;text-decoration:none}.evc-profil-lien:hover{text-decoration:underline}',
        '#evcBlocages .evc-bl-ligne{display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid rgba(127,127,127,.18)}',
        '#evcBlocages .evc-bl-ligne:last-child{border-bottom:0}',
        '#evcBlocages .evc-bl-av{width:38px;height:38px;border-radius:50%;flex:none;overflow:hidden;background:linear-gradient(135deg,#ff1680,#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900}',
        '#evcBlocages .evc-bl-av img{width:100%;height:100%;object-fit:cover}',
        '#evcBlocages .evc-bl-nom{flex:1;min-width:0;font-weight:700;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '#evcBlocages .evc-bl-date{display:block;font-weight:400;font-size:11.5px;opacity:.6}',
        '#evcBlocages .evc-bl-btn{flex:none;min-height:36px;padding:6px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font-weight:700;font-size:13px;cursor:pointer}',
        '#evcBlocages .evc-bl-btn:hover{background:rgba(127,127,127,.12)}'
    ].join('\n');
    function styles() {
        [haut(), document].forEach(function (d, i) {
            if (i === 1 && d === haut()) return;
            if (!d.getElementById('evq-styles')) { var s = d.createElement('style'); s.id = 'evq-styles'; s.textContent = css + '\n' + cssPage; d.head.appendChild(s); }
        });
    }

    // ---------- Petit message en bas de l'écran ----------
    function toast(texte, type) {
        styles();
        var d = haut(), p = d.getElementById('evq-toasts');
        if (!p) { p = el('div', 'evq-toasts'); p.id = 'evq-toasts'; p.setAttribute('aria-live', 'polite'); d.body.appendChild(p); }
        var t = el('div', 'evq-toast' + (type === 'error' ? ' erreur' : ''), texte);
        p.appendChild(t);
        setTimeout(function () { t.remove(); }, 6000);
    }

    // ---------- Fenêtre ----------
    var avant = null;
    function fermer() {
        var v = haut().getElementById('evq-voile'); if (v) v.remove();
        haut().removeEventListener('keydown', echap);
        if (avant && avant.focus) { try { avant.focus(); } catch (e) {} } avant = null;
    }
    function echap(e) { if (e.key === 'Escape') fermer(); }
    function ouvrir(titre) {
        styles(); fermer();
        avant = document.activeElement;
        var voile = el('div', 'evq-voile'); voile.id = 'evq-voile';
        var b = el('div', 'evq-boite'); b.setAttribute('role', 'dialog'); b.setAttribute('aria-modal', 'true'); b.setAttribute('aria-labelledby', 'evq-titre');
        var x = el('button', 'evq-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.addEventListener('click', fermer);
        var h = el('h2', 'evq-titre', titre); h.id = 'evq-titre';
        b.appendChild(x); b.appendChild(h);
        voile.appendChild(b); haut().body.appendChild(voile);
        voile.addEventListener('click', function (e) { if (e.target === voile) fermer(); });
        haut().addEventListener('keydown', echap);
        return b;
    }

    // ============================================================
    // MEMBRES BLOQUÉS
    // ============================================================
    var ids = new Set(), liste = [], promesse = null;
    try { (JSON.parse(sessionStorage.getItem(CLE) || '[]') || []).forEach(function (i) { ids.add(Number(i)); }); } catch (e) {}
    function memoriser() { try { sessionStorage.setItem(CLE, JSON.stringify(Array.from(ids))); } catch (e) {} }
    function estBloque(id) { return ids.has(Number(id)); }
    function appliquer() {
        document.querySelectorAll('[data-evc-auteur]').forEach(function (n) {
            var b = ids.has(Number(n.getAttribute('data-evc-auteur')));
            if (b) n.setAttribute('hidden', ''); else if (n.hasAttribute('hidden')) n.removeAttribute('hidden');
        });
        dessinerListe();
        try { window.dispatchEvent(new CustomEvent('evc:blocages', { detail: { ids: Array.from(ids) } })); } catch (e) {}
    }
    function charger(force) {
        if (!connecte()) return Promise.resolve(ids);
        if (promesse && !force) return promesse;
        promesse = api('/users/blocks').then(function (d) {
            liste = d.blocks || [];
            ids = new Set(liste.map(function (b) { return Number(b.id); }));
            memoriser(); appliquer();
            return ids;
        }).catch(function () { return ids; });
        return promesse;
    }

    function confirmer(nom) {
        return new Promise(function (resoudre) {
            var b = ouvrir('Bloquer ' + nom + ' ?');
            b.appendChild(el('p', 'evq-sous', nom + ' ne pourra plus vous écrire en privé, vous demander votre cam ni vous inviter à un live. Vous ne verrez plus ses messages dans les salons et vous ne verrez plus son profil.'));
            b.appendChild(el('p', 'evq-sous', 'Il ou elle n’est pas prévenu. Vous pouvez le débloquer à tout moment depuis « Mon profil ».'));
            var rang = el('div', 'evq-rang');
            var oui = el('button', 'evq-btn rouge', '🚫 Bloquer'); oui.type = 'button';
            var non = el('button', 'evq-btn', 'Annuler'); non.type = 'button';
            rang.appendChild(non); rang.appendChild(oui); b.appendChild(rang);
            var fini = false;
            function fin(v) { if (fini) return; fini = true; fermer(); resoudre(v); }
            oui.addEventListener('click', function () { fin(true); });
            non.addEventListener('click', function () { fin(false); });
            // Fermeture par ✕, Échap ou clic à côté : annulé
            var v = haut().getElementById('evq-voile');
            var obs = new MutationObserver(function () { if (!v.isConnected) { obs.disconnect(); if (!fini) { fini = true; resoudre(false); } } });
            obs.observe(haut().body, { childList: true });
            oui.focus();
        });
    }

    async function bloquer(id, nom, sansConfirmer) {
        if (!connecte()) { location.href = 'login.html'; return false; }
        nom = String(nom || 'ce membre');
        if (!sansConfirmer && !(await confirmer(nom))) return false;
        try {
            var r = await api('/users/blocks', { method: 'POST', body: JSON.stringify({ userId: Number(id) }) });
            ids.add(Number(id)); memoriser(); appliquer();
            charger(true);
            toast((r && r.message) || (nom + ' est bloqué.'), 'success');
            return true;
        } catch (e) { toast(e.message || 'Blocage impossible', 'error'); return false; }
    }
    async function debloquer(id, nom) {
        try {
            await api('/users/blocks/' + Number(id), { method: 'DELETE' });
            ids.delete(Number(id)); liste = liste.filter(function (b) { return Number(b.id) !== Number(id); });
            memoriser(); appliquer();
            toast((nom || 'Ce membre') + ' est débloqué.', 'success');
            return true;
        } catch (e) { toast(e.message || 'Déblocage impossible', 'error'); return false; }
    }

    // Liste « Membres bloqués » (page Mon profil)
    function dessinerListe() {
        var boite = document.getElementById('evcBlocages');
        if (!boite) return;
        styles();
        boite.textContent = '';
        if (!liste.length) {
            var vide = document.createElement('p'); vide.className = 'text-sm text-slate-400 py-3';
            vide.textContent = 'Vous n’avez bloqué personne.';
            boite.appendChild(vide);
            return;
        }
        liste.forEach(function (b) {
            var ligne = document.createElement('div'); ligne.className = 'evc-bl-ligne';
            var av = document.createElement('div'); av.className = 'evc-bl-av'; av.textContent = String(b.username || '?').charAt(0).toUpperCase();
            var src = typeof urlAvatar === 'function' ? urlAvatar(b.avatar) : null;
            if (src) { av.textContent = ''; var img = new Image(); img.alt = ''; img.src = src; av.appendChild(img); }
            var nom = document.createElement('div'); nom.className = 'evc-bl-nom'; nom.textContent = b.username;
            if (b.createdAt) {
                var dt = document.createElement('span'); dt.className = 'evc-bl-date';
                dt.textContent = 'Bloqué le ' + new Date(String(b.createdAt).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR');
                nom.appendChild(dt);
            }
            var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'evc-bl-btn'; btn.textContent = 'Débloquer';
            btn.addEventListener('click', function () { btn.disabled = true; debloquer(b.id, b.username).then(function (ok) { if (!ok) btn.disabled = false; }); });
            ligne.appendChild(av); ligne.appendChild(nom); ligne.appendChild(btn);
            boite.appendChild(ligne);
        });
    }

    // ============================================================
    // SIGNALER
    // ============================================================
    function signaler(o) {
        o = o || {};
        if (!connecte()) { location.href = 'login.html'; return; }
        var nom = String(o.username || 'ce membre');
        var estMessage = o.type === 'message';
        var b = ouvrir(estMessage ? '🚩 Signaler le message de ' + nom : '🚩 Signaler ' + nom);
        if (estMessage && o.extrait) b.appendChild(el('blockquote', 'evq-extrait', String(o.extrait).slice(0, 300)));
        b.appendChild(el('p', 'evq-sous', estMessage
            ? 'Le message, son auteur, sa date et l’endroit où il a été écrit sont joints automatiquement pour l’équipe de modération.'
            : 'Votre signalement est confidentiel : ' + nom + ' ne saura pas qui l’a signalé.'));
        var zone = el('textarea', 'evq-zone'); zone.maxLength = 500; zone.rows = 2;
        zone.placeholder = 'Précisions (facultatif)'; zone.setAttribute('aria-label', 'Précisions (facultatif)');
        b.appendChild(zone);
        b.appendChild(el('p', 'evq-label', 'Touchez le motif : le signalement part tout de suite.'));
        var grille = el('div', 'evq-motifs');
        var err = el('p', 'evq-err'); err.hidden = true;
        var boutons = MOTIFS.map(function (m) {
            var btn = el('button', 'evq-btn', m[1]); btn.type = 'button'; btn.setAttribute('data-motif', m[0]);
            btn.addEventListener('click', function () { envoyer(m[0]); });
            grille.appendChild(btn);
            return btn;
        });
        b.appendChild(grille); b.appendChild(err);
        var premier = boutons[0]; if (premier) premier.focus();

        async function envoyer(motif) {
            boutons.forEach(function (x) { x.disabled = true; });
            err.hidden = true;
            var corps = { reason: motif, description: zone.value.trim() || undefined };
            if (estMessage) { corps.targetType = 'message'; corps.targetId = Number(o.messageId); corps.messageSource = o.source === 'prive' ? 'prive' : 'salon'; }
            else { corps.targetType = 'user'; if (o.userId) corps.targetId = Number(o.userId); else corps.targetUsername = nom; }
            try {
                var r = await api('/reports', { method: 'POST', body: JSON.stringify(corps) });
                merci(r && r.message);
            } catch (e) {
                err.textContent = e.message || 'Signalement impossible pour le moment.';
                err.hidden = false;
                boutons.forEach(function (x) { x.disabled = false; });
            }
        }
        function merci(texte) {
            var t = b.querySelector('#evq-titre');
            Array.prototype.slice.call(b.children).forEach(function (n) { if (n !== t && !n.classList.contains('evq-x')) n.remove(); });
            t.textContent = 'Signalement envoyé';
            b.appendChild(el('div', 'evq-ok', '✅'));
            b.appendChild(el('p', 'evq-sous', texte || 'Notre équipe va examiner votre signalement.'));
            var rang = el('div', 'evq-rang');
            if (o.userId && o.peutBloquer !== false && !estBloque(o.userId)) {
                var bl = el('button', 'evq-btn rouge', '🚫 Bloquer aussi ' + nom); bl.type = 'button';
                bl.addEventListener('click', function () { fermer(); bloquer(o.userId, nom); });
                rang.appendChild(bl);
            }
            var ok = el('button', 'evq-btn', 'Fermer'); ok.type = 'button'; ok.addEventListener('click', fermer);
            rang.appendChild(ok); b.appendChild(rang);
            ok.focus();
        }
    }

    // ---------- Boutons déclarés dans le HTML ----------
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('[data-evc-signaler],[data-evc-bloquer]') : null;
        if (!t) return;
        e.preventDefault(); e.stopPropagation();
        var uid = Number(t.getAttribute('data-uid')) || null, nom = t.getAttribute('data-nom') || '';
        if (t.hasAttribute('data-evc-bloquer')) {
            if (estBloque(uid)) debloquer(uid, nom); else bloquer(uid, nom);
            return;
        }
        var type = t.getAttribute('data-evc-signaler') === 'message' ? 'message' : 'user';
        var extrait = '';
        if (type === 'message') {
            var bloc = t.closest('[data-evc-msg],[data-evc-auteur]');
            var txt = bloc && bloc.querySelector('[data-evc-texte]');
            extrait = txt ? txt.textContent : '';
        }
        signaler({ type: type, userId: uid, username: nom, messageId: t.getAttribute('data-msg-id'),
            source: t.getAttribute('data-source'), extrait: extrait, peutBloquer: t.getAttribute('data-peut-bloquer') !== '0' });
    }, true);

    // Connexion temps réel de la page : la liste suit les blocages faits dans un autre onglet
    function brancher(s) {
        if (!s || s.__evq) return; s.__evq = true;
        s.on('blocks:update', function () { charger(true); });
    }

    window.addEventListener('pagehide', function () {
        try { var d = haut(); if (d === document) return; ['evq-voile', 'evq-toasts'].forEach(function (id) { var n = d.getElementById(id); if (n) n.remove(); }); } catch (e) {}
    });

    window.EvcSecurite = { signaler: signaler, bloquer: bloquer, debloquer: debloquer, charger: charger, estBloque: estBloque,
        brancher: brancher, lienProfil: lienProfil, toast: toast, fermer: fermer };

    styles();
    if (connecte()) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { charger(); });
        else charger();
    }
})();
