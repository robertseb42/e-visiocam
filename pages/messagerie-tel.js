// ============================================================
// E-VISIOCAM — Messagerie au format téléphone
//   Messages : conversations (dernier message, non lus) → discussion en bulles, réponse en bas
//   Contacts : amis et membres suivis · En ligne : membres connectés · ✎ : écrire à un pseudo
//   messages.html?ecrire=<id> ouvre directement la discussion avec ce membre.
//   Même stockage qu'avant (messages privés) : rien n'est perdu.
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var corps = $('telCorps');
    if (!corps || typeof API_URL === 'undefined') return;
    var moi = typeof getCurrentUser === 'function' && getCurrentUser();
    if (!moi) { location.href = 'login.html?redirect=messages.html'; return; }
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var vue = 'messages', convs = [], fil = null, minuterie = null, attenteQ = null, confirmerSuppr = false;
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    async function api(chemin, opts) {
        var r = await fetch(API_URL + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = {}; try { d = await r.json(); } catch (e) {}
        if (r.status === 401) { location.href = 'login.html?redirect=messages.html'; throw new Error('Connexion requise'); }
        if (!r.ok) { var e2 = new Error(d.error || 'Erreur, réessayez dans un instant.'); e2.bloque = !!d.blocked; throw e2; }
        return d;
    }
    function date(v) { return new Date(String(v || '').replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z')); }
    function quand(v) {
        var d = date(v); if (isNaN(d)) return '';
        var s = (Date.now() - d) / 1000;
        if (s < 60) return 'à l’instant';
        if (s < 3600) return Math.round(s / 60) + ' min';
        if (d.toDateString() === new Date().toDateString()) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        if (s < 6 * 86400) return d.toLocaleDateString('fr-FR', { weekday: 'short' });
        return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    }
    function avatar(u) {
        var photo = u && u.avatar && typeof urlAvatar === 'function' ? urlAvatar(u.avatar) : null;
        var visuel = photo ? '<img src="' + esc(photo) + '" alt="">' : (typeof evcMasque === 'function' ? evcMasque(u && u.gender || '', u && u.id) : '');
        return '<span class="tel-av">' + visuel + (u && u.online ? '<span class="tel-point" title="En ligne"></span>' : '') + '</span>';
    }
    function ligne(u, sous, droite, attrs, nonLu) {
        return '<button type="button" class="tel-ligne' + (nonLu ? ' non-lu' : '') + '" ' + attrs + '>' + avatar(u) +
            '<span class="tel-ligne-txt"><b>' + esc(u.username) + '</b><span>' + sous + '</span></span>' + (droite || '') + '</button>';
    }
    function vide(icone, texte) { return '<div class="tel-vide"><i class="fa-solid ' + icone + '" aria-hidden="true"></i>' + texte + '</div>'; }

    // ---------- En-tête et onglets selon la vue ----------
    function cadre() {
        var discussion = vue === 'fil';
        $('telRetour').hidden = !(discussion || vue === 'nouveau');
        $('telNouveau').hidden = discussion || vue === 'nouveau';
        $('telMenu').hidden = !discussion;
        $('telMenuListe').hidden = true;
        $('telSaisie').hidden = !discussion;
        $('telOnglets').hidden = discussion || vue === 'nouveau';
        $('telRecherche').hidden = discussion || vue === 'enligne';
        $('telQ').placeholder = vue === 'nouveau' ? 'Pseudo du membre à qui écrire…' : 'Rechercher un pseudo…';
        if (!discussion) $('telTitre').innerHTML = { messages: '<i class="fa-solid fa-comment-dots" aria-hidden="true"></i> Messagerie', contacts: '<i class="fa-solid fa-address-book" aria-hidden="true"></i> Contacts', enligne: '<i class="fa-solid fa-circle-dot" aria-hidden="true"></i> En ligne', nouveau: '<i class="fa-solid fa-pen-to-square" aria-hidden="true"></i> Nouveau message' }[vue];
        document.querySelectorAll('[data-tel-onglet]').forEach(function (b) { if (b.getAttribute('data-tel-onglet') === vue) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    }
    function aller(v) { vue = v; fil = null; clearInterval(minuterie); confirmerSuppr = false; $('telQ').value = ''; cadre(); afficher(); }

    // ---------- Conversations ----------
    async function chargerConvs() {
        try { convs = (await api('/messages/conversations')).conversations || []; } catch (e) { convs = []; }
        var n = convs.reduce(function (t, c) { return t + (c.unreadCount || 0); }, 0);
        $('telNonLus').textContent = n > 99 ? '99+' : n; $('telNonLus').hidden = !n;
    }
    function rendreConvs() {
        var q = $('telQ').value.trim().toLowerCase();
        var liste = convs.filter(function (c) { return c.otherUser && (!q || c.otherUser.username.toLowerCase().indexOf(q) >= 0); });
        corps.innerHTML = liste.length ? liste.map(function (c) {
            var dernier = c.lastMessage ? esc(c.lastMessage).slice(0, 120) : '<i>Nouvelle conversation</i>';
            return ligne(c.otherUser, dernier, '<small>' + esc(quand(c.lastMessageAt)) + (c.unreadCount ? '<br><em>' + c.unreadCount + '</em>' : '') + '</small>', 'data-conv="' + Number(c.id) + '"', c.unreadCount > 0);
        }).join('') : vide('fa-comments', q ? 'Aucune conversation avec ce pseudo.' : 'Aucune conversation pour le moment.<br>Touchez ✎ en haut pour écrire à un membre, ou « Lui écrire » sur sa fiche.');
    }

    // ---------- Discussion ----------
    function rendreFil(defiler) {
        var u = fil.autre || {};
        $('telTitre').innerHTML = avatar(u) + '<span style="min-width:0"><span style="display:block;overflow:hidden;text-overflow:ellipsis">' + esc(u.username || '') + '</span><small>' + (u.online ? '🟢 En ligne' : 'Hors ligne') + '</small></span>';
        var html = '', jour = '';
        fil.messages.forEach(function (m) {
            var d = date(m.created_at), j = isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
            if (j && j !== jour) { jour = j; html += '<span class="tel-jour">' + esc(j) + '</span>'; }
            var mien = m.sender_id === moi.id;
            html += '<div class="tel-bulle ' + (mien ? 'moi' : 'lui') + '">' + (m.subject ? '<b>' + esc(m.subject) + '</b>' : '') + esc(m.content) +
                '<small>' + (isNaN(d) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) + (mien && m.is_read ? ' · Lu' : '') + '</small></div>';
        });
        corps.innerHTML = (html || vide('fa-hand', 'Dites bonjour à ' + esc(u.username || 'ce membre') + ' !')) + (fil.bloque ? '<p class="tel-avert">' + esc(fil.bloque) + '</p>' : '');
        if (defiler) corps.scrollTop = corps.scrollHeight;
    }
    async function ouvrir(convId) {
        vue = 'fil'; cadre();
        corps.innerHTML = vide('fa-spinner', 'Chargement…');
        try {
            var d = await api('/messages/' + Number(convId));
            fil = { id: Number(convId), messages: d.messages || [], autre: d.otherUser || {}, bloque: '' };
            rendreFil(true);
            $('telTexte').focus();
            try { history.replaceState(null, '', 'messages.html'); } catch (e) {}
            clearInterval(minuterie);
            minuterie = setInterval(rafraichirFil, 8000);
            chargerConvs();
        } catch (e) { corps.innerHTML = vide('fa-triangle-exclamation', esc(e.message)); }
    }
    async function rafraichirFil() {
        if (!fil || document.hidden) return;
        try {
            var d = await api('/messages/' + fil.id);
            var avant = fil.messages.length, basAvant = corps.scrollHeight - corps.scrollTop - corps.clientHeight < 80;
            fil.messages = d.messages || []; fil.autre = d.otherUser || fil.autre;
            if (fil.messages.length !== avant || true) rendreFil(basAvant);
        } catch (e) {}
    }
    async function ecrireA(userId) {
        try { var d = await api('/messages/start', { method: 'POST', body: JSON.stringify({ userId: Number(userId) }) }); ouvrir(d.conversation.id); }
        catch (e) { toast(e.message, 'error'); }
    }

    // ---------- Contacts, en ligne, nouveau ----------
    async function rendreContacts() {
        corps.innerHTML = vide('fa-spinner', 'Chargement…');
        var amis = [], suivis = [];
        try { amis = (await api('/amis')).amis || []; } catch (e) {}
        try { suivis = (await api('/favorites')).membres || []; } catch (e) {}
        var q = $('telQ').value.trim().toLowerCase(), f = function (u) { return !q || u.username.toLowerCase().indexOf(q) >= 0; };
        var html = '';
        if (amis.filter(f).length) html += '<p class="tel-section">Mes amis</p>' + amis.filter(f).map(function (u) { return ligne(u, u.online ? 'En ligne' : 'Ami', '', 'data-ecrire="' + Number(u.id) + '"'); }).join('');
        if (suivis.filter(f).length) html += '<p class="tel-section">Membres suivis</p>' + suivis.filter(f).map(function (u) { u.gender = u.genre; return ligne(u, u.online ? 'En ligne' : 'Suivi', '', 'data-ecrire="' + Number(u.id) + '"'); }).join('');
        corps.innerHTML = html || vide('fa-address-book', 'Vos amis et les membres que vous suivez apparaîtront ici.<br>Ajoutez-les depuis leur fiche (« Ajouter en ami », « Ajouter aux favoris »).');
    }
    async function rendreEnLigne() {
        corps.innerHTML = vide('fa-spinner', 'Chargement…');
        try {
            var d = await api('/models/annuaire?enligne=1&tri=connectes&page=1');
            corps.innerHTML = (d.membres || []).length ? d.membres.map(function (m) {
                m.gender = m.genre;
                var sous = ({ couple: 'Couple', femme: 'Femme', homme: 'Homme', trans: 'Trans' }[m.genre] || 'Membre') + (m.distance ? ' · ≈ ' + m.distance + ' km' : (m.departement ? ' · ' + esc(m.departement) : ''));
                return ligne(m, sous, '', 'data-ecrire="' + Number(m.id) + '"');
            }).join('') : vide('fa-moon', 'Personne d’autre n’est connecté pour le moment.');
        } catch (e) { corps.innerHTML = vide('fa-triangle-exclamation', esc(e.message)); }
    }
    async function rendreNouveau() {
        var q = $('telQ').value.trim();
        if (q.length < 2) { corps.innerHTML = vide('fa-pen-to-square', 'Tapez au moins 2 lettres du pseudo du membre à qui vous voulez écrire.'); return; }
        try {
            var d = await api('/messages/search/users?q=' + encodeURIComponent(q));
            corps.innerHTML = (d.users || []).length ? d.users.map(function (u) { return ligne(u, 'Écrire à ' + esc(u.username), '', 'data-ecrire="' + Number(u.id) + '"'); }).join('') : vide('fa-user-slash', 'Aucun membre avec ce pseudo.');
        } catch (e) { corps.innerHTML = vide('fa-triangle-exclamation', esc(e.message)); }
    }
    async function afficher() {
        if (vue === 'messages') { if (!convs.length) corps.innerHTML = vide('fa-spinner', 'Chargement…'); await chargerConvs(); if (vue === 'messages') rendreConvs(); }
        else if (vue === 'contacts') rendreContacts();
        else if (vue === 'enligne') rendreEnLigne();
        else if (vue === 'nouveau') rendreNouveau();
    }

    // ---------- Événements ----------
    corps.addEventListener('click', function (e) {
        var c = e.target.closest('[data-conv]'); if (c) { ouvrir(c.getAttribute('data-conv')); return; }
        var w = e.target.closest('[data-ecrire]'); if (w) ecrireA(w.getAttribute('data-ecrire'));
    });
    $('telOnglets').addEventListener('click', function (e) { var b = e.target.closest('[data-tel-onglet]'); if (b) aller(b.getAttribute('data-tel-onglet')); });
    $('telRetour').addEventListener('click', function () { aller('messages'); });
    $('telNouveau').addEventListener('click', function () { aller('nouveau'); $('telQ').focus(); });
    $('telQ').addEventListener('input', function () {
        clearTimeout(attenteQ);
        attenteQ = setTimeout(function () { if (vue === 'messages') rendreConvs(); else if (vue === 'contacts') rendreContacts(); else if (vue === 'nouveau') rendreNouveau(); }, vue === 'nouveau' ? 300 : 120);
    });
    $('telMenu').addEventListener('click', function () { $('telMenuListe').hidden = !$('telMenuListe').hidden; confirmerSuppr = false; });
    $('telMenuListe').addEventListener('click', async function (e) {
        var b = e.target.closest('[data-tel-action]'); if (!b || !fil) return;
        var a = b.getAttribute('data-tel-action'), u = fil.autre || {};
        if (a === 'profil') {
            $('telMenuListe').hidden = true;
            var lien = document.createElement('button'); lien.type = 'button'; lien.hidden = true; lien.setAttribute('data-fiche', Number(u.id));
            document.body.appendChild(lien); lien.click(); lien.remove();
        } else if (a === 'supprimer') {
            if (!confirmerSuppr) { confirmerSuppr = true; b.innerHTML = '<i class="fa-solid fa-trash-can" aria-hidden="true"></i> Confirmer : supprimer pour moi'; return; }
            try { await api('/messages/' + fil.id, { method: 'DELETE' }); toast('Conversation supprimée de votre messagerie', 'success'); aller('messages'); }
            catch (x) { toast(x.message, 'error'); }
        } else if (a === 'signaler') {
            $('telMenuListe').hidden = true;
            if (window.EvcSecurite) window.EvcSecurite.signaler({ type: 'user', userId: u.id, username: u.username, peutBloquer: true });
        }
    });
    var texte = $('telTexte');
    texte.addEventListener('input', function () { texte.style.height = 'auto'; texte.style.height = Math.min(120, texte.scrollHeight) + 'px'; });
    texte.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('telSaisie').requestSubmit(); } });
    $('telSaisie').addEventListener('submit', async function (e) {
        e.preventDefault();
        var t = texte.value.trim(); if (!t || !fil) return;
        var bouton = this.querySelector('button'); bouton.disabled = true;
        try {
            var d = await api('/messages/' + fil.id, { method: 'POST', body: JSON.stringify({ content: t }) });
            texte.value = ''; texte.style.height = 'auto';
            if (d.message && !fil.messages.some(function (m) { return m.id === d.message.id; })) fil.messages.push(d.message);
            fil.bloque = ''; rendreFil(true);
        } catch (x) { if (x.bloque) { fil.bloque = x.message; rendreFil(true); } else toast(x.message, 'error'); }
        bouton.disabled = false; texte.focus();
    });
    // Nouveau message reçu (socket ouvert par nav-auth.js)
    window.addEventListener('evc:dm', function (ev) {
        var d = ev.detail || {};
        if (fil && d.conversationId === fil.id) rafraichirFil();
        else { chargerConvs().then(function () { if (vue === 'messages') rendreConvs(); }); }
    });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && vue === 'messages') afficher(); });

    // Démarrage : ?ecrire=<id> ouvre la discussion, sinon la liste
    cadre();
    var ecrire = parseInt(new URLSearchParams(location.search).get('ecrire'), 10);
    if (ecrire > 0) { chargerConvs(); ecrireA(ecrire); } else afficher();
})();
