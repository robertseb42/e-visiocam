// Extrait de chat.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// VARIABLES
// ============================================================
let socket = null;
// Salon demandé dans l'adresse : chat.html?theme=<slug> (accueil, Salons, favoris) ou chat.html?salon=<nom>
const salonDemande = (new URLSearchParams(window.location.search).get('theme')
    || new URLSearchParams(window.location.search).get('salon') || '').trim();
let currentSalon = 'Salon Général';   // nom du salon (affiché, envoyé au serveur)
let currentSlug = 'general';          // identifiant du salon (adresse de la page)
let currentUser = null;
let gifts = [];
let selectedGift = null;
let userBalance = 0;
let salonStreams = [];
let viewerPeerConnections = {};
let cameraViewExpanded = true;
let remoteAudioStates = {};
// Liste des salons : repli local, remplacée par la vraie liste du serveur
let SALONS = [
    { slug: 'general', name: 'Salon Général', icon: '🌍' },
    { slug: 'francais', name: 'Salon Français', icon: '🇫🇷' },
    { slug: 'international', name: 'Salon International', icon: '🌐' },
    { slug: 'couples', name: 'Salon Couples', icon: '💕' },
    { slug: 'amateurs', name: 'Salon Amateurs', icon: '✨' },
    { slug: 'musique', name: 'Salon Musique', icon: '🎵' }
];
let membres = [];               // membres présents dans le salon
let membresDuServeur = false;   // vrai quand le serveur envoie la liste du salon (sinon : tous les connectés)
let tousConnectes = [];
// Messages privés : nonLus = id du membre -> nombre de messages non lus ; actif = conversation ouverte
const prive = { nonLus: {}, actif: null };
const ROLE_ICONS = { super_admin: '👑', moderator: '🔵', model: '🟢', user: '⚪' };

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = getCurrentUser();
    if (!currentUser) { window.location.href = 'login.html'; return; }
    document.getElementById('dmForm').addEventListener('submit', envoyerPrive);
    document.getElementById('dmInput').addEventListener('input', signalerFrappe);
    document.getElementById('onlineUsers').addEventListener('click', e => {
        const b = e.target.closest('[data-uid]');
        if (b) { fermerVolet(); ouvrirPrive(Number(b.dataset.uid), b.dataset.n); }
    });
    document.getElementById('chatMessages').addEventListener('click', e => {
        const b = e.target.closest('[data-uid]');
        if (b) ouvrirPrive(Number(b.dataset.uid), b.dataset.n);
    });
    document.getElementById('salonList').addEventListener('click', e => {
        const b = e.target.closest('[data-slug]');
        if (b) { fermerVolet(); choisirSalon(b.dataset.slug); }
    });

    await chargerSalons();
    let s = trouverSalon(salonDemande) || trouverSalon('general') || SALONS[0];
    // Salon privé demandé sans accès : cadenas + demande d'accès, et on reste dans le Salon Général
    if (s.isPrivate && typeof SalonAccess !== 'undefined') {
        const st = await SalonAccess.status(s.slug).catch(() => 'none');
        if (st !== 'approved') { afficherCadenas(s, st); s = trouverSalon('general') || SALONS.find(x => !x.isPrivate) || SALONS[0]; }
    }
    if (!s && salonDemande) s = { slug: salonDemande, name: salonDemande, icon: '💬' };
    appliquerSalon(s.name, s.slug);
    recordJoin(currentSlug);
    initSocket();
});

// ============================================================
// SALONS
// ============================================================
async function chargerSalons() {
    if (typeof SalonAccess === 'undefined' || !SalonAccess.salons) { dessinerSalons(); return; }
    const liste = await SalonAccess.salons().catch(() => null);
    if (liste && liste.length) {
        SALONS = liste.map(x => ({ slug: x.slug, name: x.name, icon: x.icon || '💬', logoUrl: x.logoUrl || null, isPrivate: !!x.isPrivate, isHidden: !!x.isHidden }));
    }
    dessinerSalons();
}

function trouverSalon(cle) {
    if (!cle) return null;
    const c = String(cle).toLowerCase();
    return SALONS.find(x => x.slug.toLowerCase() === c || x.name.toLowerCase() === c) || null;
}

function dessinerSalons() {
    const boite = document.getElementById('salonList');
    if (!boite) return;
    boite.innerHTML = SALONS.map(x => {
        const actif = x.slug === currentSlug;
        const logo = (typeof SalonAccess !== 'undefined' && SalonAccess.logoHtml) ? SalonAccess.logoHtml(x, 18) : escapeHtml(x.icon);
        return '<button type="button" data-slug="' + escapeHtml(x.slug) + '" class="salon-btn w-full text-left px-3 py-2 rounded-xl flex items-center gap-2 ' +
            (actif ? 'bg-pink-50 border border-pink-200/60 text-brand-primary font-bold' : 'hover:bg-slate-50 text-slate-700') + '"' + (actif ? ' aria-current="true"' : '') + '>' +
            '<span class="w-5 text-center shrink-0">' + logo + '</span><span class="truncate flex-1">' + escapeHtml(x.name) + '</span>' +
            (x.isPrivate ? '<i class="fa-solid fa-lock text-[10px] text-amber-500" title="Salon privé"></i>' : '') +
            (x.isHidden ? '<i class="fa-solid fa-eye-slash text-[10px] text-slate-400" title="Salon masqué"></i>' : '') +
        '</button>';
    }).join('');
}

// Affiche le salon courant (titre, liste, adresse)
function appliquerSalon(nom, slug) {
    currentSalon = nom;
    const trouve = trouverSalon(slug) || trouverSalon(nom);
    currentSlug = trouve ? trouve.slug : (slug || nom);
    const titleEl = document.getElementById('currentSalon');
    if (titleEl) titleEl.textContent = ((trouve && trouve.icon && !trouve.logoUrl) ? trouve.icon : '💬') + ' ' + nom;
    document.title = nom + ' — E-VISIOCAM';
    // 🕺 Salon Musique : le danseur disco s'invite dans le coin du chat
    if (typeof EvcDanseur !== 'undefined') {
        if (currentSlug === 'musique') {
            const form = document.getElementById('chatForm');
            EvcDanseur.afficher(document.getElementById('chatCard'), { bas: (form ? form.offsetHeight : 64) + 4, place: document.getElementById('chatMessages') });
        } else EvcDanseur.cacher();
    }
    try {
        const url = new URL(window.location.href);
        url.searchParams.delete('salon');
        url.searchParams.set('theme', currentSlug);
        window.history.replaceState({}, '', url);
    } catch (e) {}
    dessinerSalons();
}

async function choisirSalon(slug) {
    const x = trouverSalon(slug);
    if (!x || x.slug === currentSlug) return;
    if (x.isPrivate && typeof SalonAccess !== 'undefined') {
        const st = await SalonAccess.status(x.slug).catch(() => 'none');
        if (st !== 'approved') { afficherCadenas(x, st); return; }
    }
    joinSalon(x.slug);
}

// ---------- 🔒 cadenas d'un salon privé ----------
function afficherCadenas(x, statut) {
    const textes = {
        none: "Ce salon est privé. Demandez l'accès : un modérateur ou l'administrateur validera votre demande.",
        pending: "Votre demande d'accès est en attente de validation.",
        refused: "Votre demande d'accès a été refusée.",
        approved: 'Accès accordé, vous pouvez entrer.'
    };
    document.getElementById('lockName').textContent = x.name;
    document.getElementById('lockText').textContent = textes[statut] || textes.none;
    const ask = document.getElementById('lockAsk'), enter = document.getElementById('lockEnter');
    ask.classList.toggle('hidden', !!statut && statut !== 'none');
    enter.classList.toggle('hidden', statut !== 'approved');
    ask.disabled = false;
    ask.onclick = async () => {
        ask.disabled = true;
        try { await SalonAccess.request(x.slug); afficherCadenas(x, 'pending'); showToast("Demande d'accès envoyée", 'success'); }
        catch (e) { ask.disabled = false; showToast("Impossible d'envoyer la demande", 'error'); }
    };
    enter.onclick = () => { fermerCadenas(); joinSalon(x.slug); };
    const m = document.getElementById('lockModal');
    m.classList.remove('hidden'); m.classList.add('flex');
}
function fermerCadenas() {
    const m = document.getElementById('lockModal');
    m.classList.add('hidden'); m.classList.remove('flex');
}

// ---------- volet mobile ----------
function ouvrirVolet() { document.getElementById('chatSidebar').classList.add('ouvert'); }
function fermerVolet() { document.getElementById('chatSidebar').classList.remove('ouvert'); }

// ---------- compteur réel des membres d'un salon ----------
function recordJoin(slug) {
    try {
        const base = (typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api');
        fetch(base + '/salons/' + encodeURIComponent(slug) + '/join', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    } catch (e) {}
}

// ============================================================
// MEMBRES DU SALON
// ============================================================
// 🏅 Niveau du programme de récompenses, à côté du pseudo (Bronze, Argent, Or, Diamant)
function insigneHtml(n) {
    if (!n || !n.icone) return '';
    return ' <span title="Niveau ' + escapeHtml(n.nom || '') + '" aria-label="Niveau ' + escapeHtml(n.nom || '') + '" style="font-size:11px">' + escapeHtml(n.icone) + '</span>';
}

function dessinerMembres() {
    const boite = document.getElementById('onlineUsers');
    const liste = membres.slice();
    document.getElementById('onlineCount').textContent = liste.length;
    const mob = document.getElementById('mobMembres'); if (mob) mob.textContent = liste.length;
    if (!liste.length) {
        boite.innerHTML = '<p class="text-slate-400 text-center py-4">Personne dans ce salon pour le moment</p>';
    } else {
        boite.innerHTML = liste.map(u => {
            const nom = String(u.username || '?');
            const moi = currentUser && u.id === currentUser.id;
            const nonLus = Number(prive.nonLus[u.id]) || 0;
            const actif = prive.actif && prive.actif.userId === u.id;
            const photo = (typeof urlAvatar === 'function') ? urlAvatar(u.avatar) : null;
            const live = u.streamId ? '<span class="text-[9px] font-bold text-white bg-red-500 rounded px-1">LIVE</span>' : '';
            const avatar = '<span data-fiche="' + Number(u.id) + '" title="Voir la fiche de ' + escapeHtml(nom) + '" class="cursor-pointer relative w-7 h-7 rounded-full bg-gradient-to-r from-purple-500 to-brand-primary text-white flex items-center justify-center text-[11px] font-bold shrink-0">' +
                escapeHtml(nom[0].toUpperCase()) + (photo ? '<img src="' + escapeHtml(photo) + '" alt="" class="absolute inset-0 w-full h-full rounded-full object-cover" loading="lazy">' : '') + (nonLus ? '<span class="pb">' + (nonLus > 99 ? '99+' : nonLus) + '</span>' : '') + '</span>';
            const libelle = '<span class="font-medium text-slate-700 truncate flex-1">' + (ROLE_ICONS[u.role] || '') + ' ' + escapeHtml(nom) + insigneHtml(u.insigne) + (moi ? ' <span class="text-slate-400">(moi)</span>' : '') + '</span>';
            if (moi) return '<div class="flex items-center gap-2 p-2 rounded-lg">' + avatar.replace(/<\/span>$/, pastilleMaCam() + '</span>') + libelle + live + '</div>';
            return '<button type="button" class="membre-btn w-full flex items-center gap-2 p-2 rounded-lg hover:bg-purple-50 text-left' + (actif ? ' actif bg-purple-50' : '') + '"' +
                ' data-uid="' + Number(u.id) + '" data-n="' + escapeHtml(nom) + '" title="Écrire en privé à ' + escapeHtml(nom) + '">' +
                avatar + libelle + live + '<i class="fa-regular fa-envelope text-purple-500" aria-hidden="true"></i></button>';
        }).join('');
    }
    majTotalNonLus();
}

// 📷 Petite pastille sur MON avatar : allume ma caméra en un appui (ex. vérification demandée par un modérateur)
function etatMaCam() {
    try { const S = window.top !== window ? window.top.EvcCamSession : null; return S ? S.getState() : null; } catch (e) { return null; }
}
function pastilleMaCam() {
    const e = etatMaCam();
    const on = !!(e && e.active);
    const titre = e && e.broadcasting ? 'Ma caméra : en direct' : on ? 'Ma caméra est allumée' : 'Allumer ma caméra';
    return '<button type="button" class="pastille-macam' + (on ? ' on' : '') + '" data-chat-action="macam"'
        + ' title="' + titre + '" aria-label="' + titre + '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="6" width="13" height="12" rx="2.5" fill="currentColor"/><path d="M16 10.5l6-3.5v10l-6-3.5z" fill="currentColor"/></svg></button>';
}
async function demarrerMaCamAvatar() {
    let S = null;
    try { S = window.top !== window ? window.top.EvcCamSession : null; } catch (e) {}
    if (!S) { location.href = 'live.html'; return; }        // page ouverte hors de l'appli
    if (!S.getState().active) {
        try { await S.start(); if (typeof showToast === 'function') showToast('Caméra activée'); }
        catch (er) {
            if (!er.evcGere && er.name !== 'Annule' && typeof showToast === 'function') showToast("Impossible d'activer la caméra", 'error');
            return;
        }
    }
    if (window.EvcMaCam) EvcMaCam.ouvrir();   // aperçu + « Diffuser dans le salon » / « Couper »
}
// La caméra change d'état : la pastille suit
window.addEventListener('evc:cam', (ev) => {
    if (ev.detail && ev.detail.type === 'state' && document.getElementById('onlineUsers') && membres.length) dessinerMembres();
});

function majTotalNonLus() {
    const total = Object.values(prive.nonLus).reduce((a, n) => a + (Number(n) || 0), 0);
    const b = document.getElementById('mobNonLus');
    if (!b) return;
    b.textContent = total > 99 ? '99+' : String(total);
    b.classList.toggle('hidden', !total);
    b.classList.toggle('flex', !!total);
}

// ============================================================
// MESSAGES PRIVÉS (rien n'est écrit dans le salon)
// ============================================================
function heurePrivee(d) {
    const t = typeof d === 'string' && !/[TZ]/.test(d) ? d.replace(' ', 'T') + 'Z' : d;
    return new Date(t || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
const lignePrivee = m => ({ id: m.id, me: !!(currentUser && m.sender_id === currentUser.id), text: m.content, time: heurePrivee(m.created_at) });

function dessinerPrive() {
    const panel = document.getElementById('dmPanel');
    const a = prive.actif;
    if (!a) { panel.classList.add('hidden'); panel.classList.remove('flex'); return; }
    panel.classList.remove('hidden'); panel.classList.add('flex');
    document.getElementById('dmName').textContent = a.name;
    document.getElementById('dmAvatar').textContent = (a.name[0] || '?').toUpperCase();
    document.getElementById('dmInput').placeholder = 'Message privé à ' + a.name + '…';
    const zone = document.getElementById('dmMessages');
    zone.innerHTML = a.messages.length
        ? a.messages.map(m => '<div class="flex ' + (m.me ? 'justify-end' : 'justify-start') + '"><div class="max-w-[80%] px-3 py-2 rounded-2xl text-sm ' +
            (m.me ? 'bg-purple-600 text-white rounded-br-sm' : 'bg-white border border-slate-200 text-slate-700 rounded-bl-sm') + '">' +
            escapeHtml(m.text) + '<div class="text-[10px] mt-0.5 ' + (m.me ? 'text-white/70 text-right' : 'text-slate-400') + '">' + m.time + '</div></div></div>').join('')
        : '<p class="text-xs text-slate-400 text-center py-6">Aucun message pour le moment.<br>Écrivez le premier : il ne sera visible que par ' + escapeHtml(a.name) + '.</p>';
    zone.scrollTop = zone.scrollHeight;
}

let chargementNonLus = null;
function chargerNonLusPrives() {
    clearTimeout(chargementNonLus);
    chargementNonLus = setTimeout(async () => {
        try {
            const d = await apiCall('/messages/conversations');
            const n = {};
            (d.conversations || []).forEach(c => { if (c.otherUser && c.unreadCount) n[c.otherUser.id] = c.unreadCount; });
            if (prive.actif) delete n[prive.actif.userId];
            prive.nonLus = n;
            dessinerMembres();
        } catch (e) {}
    }, 250);
}

async function ouvrirPrive(userId, name) {
    if (!userId || !currentUser || userId === currentUser.id) return;
    try {
        const st = await apiCall('/messages/start', { method: 'POST', body: JSON.stringify({ userId: userId }) });
        if (!st || !st.conversation) throw new Error((st && st.error) || 'Messagerie privée indisponible');
        const convId = st.conversation.id;
        const rep = await apiCall('/messages/' + convId);   // historique ; la conversation est marquée comme lue
        prive.actif = { userId, name: name || 'Membre', convId, messages: (rep.messages || []).map(lignePrivee) };
        delete prive.nonLus[userId];
        dessinerPrive(); dessinerMembres();
        document.getElementById('dmInput').focus();
        if (socket && socket.connected) socket.emit('dm:read', { conversationId: convId });
    } catch (e) {
        showToast(e.message || 'Messagerie privée indisponible', 'error');
    }
}

function fermerPrive() { prive.actif = null; dessinerPrive(); dessinerMembres(); }

async function envoyerPrive(e) {
    e.preventDefault();
    const a = prive.actif, champ = document.getElementById('dmInput');
    const texte = champ.value.trim();
    if (!a || !texte) return;
    champ.value = '';
    try {
        if (socket && socket.connected) {
            socket.emit('dm:send', { conversationId: a.convId, content: texte });   // le message revient par « dm:message »
        } else {
            const rep = await apiCall('/messages/' + a.convId, { method: 'POST', body: JSON.stringify({ content: texte }) });
            if (prive.actif === a && rep.message && !a.messages.some(m => m.id === rep.message.id)) { a.messages.push(lignePrivee(rep.message)); dessinerPrive(); }
        }
    } catch (err) {
        champ.value = texte;
        showToast(err.message || 'Message non envoyé', 'error');
    }
}

let derniereFrappe = 0;
function signalerFrappe() {
    const a = prive.actif;
    if (!a || !socket || !socket.connected || Date.now() - derniereFrappe < 2000) return;
    derniereFrappe = Date.now();
    socket.emit('dm:typing', { conversationId: a.convId });
}

function traiterMessagePrive(data) {
    if (!data || !data.message || !currentUser) return;
    const m = data.message, a = prive.actif, moi = m.sender_id === currentUser.id;
    if (a && a.convId === data.conversationId) {
        if (!a.messages.some(x => x.id === m.id)) a.messages.push(lignePrivee(m));
        document.getElementById('dmTyping').classList.add('hidden');
        dessinerPrive();
        if (!moi && socket && socket.connected) socket.emit('dm:read', { conversationId: data.conversationId });
    } else if (!moi) {
        prive.nonLus[m.sender_id] = (Number(prive.nonLus[m.sender_id]) || 0) + 1;
        dessinerMembres();
        alertePrive(m);
    }
}

// Petite alerte cliquable : « Message privé de X » → ouvre la conversation
function alertePrive(m) {
    const ancien = document.querySelector('.dm-alerte'); if (ancien) ancien.remove();
    const el = document.createElement('div');
    el.className = 'dm-alerte bg-white border border-purple-200 shadow-xl rounded-2xl px-4 py-3 text-sm text-slate-700';
    const titre = document.createElement('p');
    titre.className = 'font-bold text-purple-600';
    titre.textContent = '💬 Message privé de ' + (m.sender_username || 'un membre');
    const extrait = document.createElement('p');
    extrait.className = 'text-xs text-slate-500 truncate';
    extrait.textContent = String(m.content || '').slice(0, 80);
    el.append(titre, extrait);
    el.addEventListener('click', () => { el.remove(); ouvrirPrive(m.sender_id, m.sender_username); });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 7000);
}

// ============================================================
// 🔒 LIVE PRIVÉ : inviter des membres du salon
// ============================================================
function ouvrirLivePrive() {
    if (typeof LivePrive === 'undefined') { showToast('Live privé indisponible', 'error'); return; }
    const liste = membres.filter(u => currentUser && u.id !== currentUser.id).map(u => ({ id: u.id, username: u.username }));
    if (!liste.length) { showToast("Aucun autre membre dans ce salon pour le moment", 'error'); return; }
    LivePrive.ouvrir({
        membres: liste, titre: '🔒 Live privé', bouton: 'Passer en live privé',
        onConfirm: (ids, noms) => {
            try { sessionStorage.setItem('evc-live-prive', JSON.stringify({ invited: ids, names: noms, salon: currentSalon })); } catch (e) {}
            window.location.href = 'live.html?prive=1';
        }
    });
}

function invitationLivePrive(d) {
    if (!d || typeof LivePrive === 'undefined') return;
    LivePrive.banniere({
        de: d.broadcasterUsername,
        onRegarder: () => {
            const tuile = document.querySelector('[data-stream-id="' + CSS.escape(String(d.streamId)) + '"]');
            if (tuile) { tuile.scrollIntoView({ block: 'center' }); }
            else window.location.href = 'live.html?join=' + encodeURIComponent(d.streamId) + '&from=' + encodeURIComponent(d.broadcasterUsername || '');
        }
    });
}

// ============================================================
// SOCKET
// ============================================================
function initSocket() {
    socket = io('https://api.e-visiocam.com', { 
    withCredentials: true 
});
    if (typeof EvcQuiz !== 'undefined') EvcQuiz.brancher(socket);   // 🧠 résultats du quiz de l'animateur
    if (typeof EvcCam !== 'undefined') EvcCam.brancher(socket);     // 📷 demandes de cam reçues tout de suite

    socket.on('connect', () => {
        const status = document.getElementById('connectionStatus');
        status.className = 'text-xs font-bold px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700';
        status.innerHTML = '🟢 Connecté';

        socket.emit('salon:join', currentSlug || currentSalon);
        refreshSalonStreams();
        chargerNonLusPrives();
    });

    socket.on('connect_error', (err) => {
        const status = document.getElementById('connectionStatus');
        status.className = 'text-xs font-bold px-3 py-1.5 rounded-full bg-rose-100 text-rose-700';
        status.textContent = '❌ ' + err.message;
    });

    // Messages
    socket.on('chat:history', (messages) => {
        const container = document.getElementById('chatMessages');
        container.innerHTML = '';
        if (messages.length === 0) {
            container.innerHTML = '<div class="text-center text-xs text-slate-400 py-4">Aucun message. Soyez le premier !</div>';
            return;
        }
        messages.forEach(renderMessage);
        scrollToBottom();
    });

    socket.on('chat:message', (msg) => {
        renderMessage(msg);
        scrollToBottom();
    });

    // Membres du salon (le serveur envoie la liste à chaque arrivée / départ)
    socket.on('salon:members', (data) => {
        if (!data || data.salon !== currentSalon) return;
        membresDuServeur = true;
        membres = data.users || [];
        dessinerMembres();
    });
    // Ancien serveur : liste de tous les connectés
    socket.on('users:list', (users) => {
        tousConnectes = users || [];
        if (!membresDuServeur) { membres = tousConnectes; dessinerMembres(); }
    });

    // Messages privés
    socket.on('dm:message', (data) => traiterMessagePrive(data));
    socket.on('dm:unread-count', () => chargerNonLusPrives());
    socket.on('dm:typing', (data) => {
        const a = prive.actif;
        if (!a || !data || data.conversationId !== a.convId) return;
        const t = document.getElementById('dmTyping');
        t.textContent = a.name + ' écrit…';
        t.classList.remove('hidden');
        clearTimeout(t.cache); t.cache = setTimeout(() => t.classList.add('hidden'), 3000);
    });
    socket.on('dm:error', (data) => showToast((data && data.message) || 'Message privé non envoyé', 'error'));
    socket.on('live:private-invite', (d) => invitationLivePrive(d));

    socket.on('system', (data) => {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'text-center text-xs text-slate-400 py-2 italic';
        div.textContent = '— ' + data.text + ' —';
        container.appendChild(div);
        scrollToBottom();
    });

    socket.on('salon:error', data => showToast((data && data.message) || 'Accès au salon refusé', 'error'));
    socket.on('salon:joined', (data) => {
        if (!data || !data.salon) return;
        appliquerSalon(data.salon, data.slug);
        if (!membresDuServeur) { membres = tousConnectes; dessinerMembres(); }
    });

    // ============================================================
    // CAMÉRAS DU SALON
    // ============================================================
    socket.on('salon:streams-list', (data) => {
        salonStreams = data.streams || [];
        renderSalonCameras();
    });

    socket.on('salon:stream-started', () => {
        setTimeout(refreshSalonStreams, 300);
    });

    socket.on('salon:stream-stopped', (data) => {
        if (viewerPeerConnections[data.streamId]) {
            viewerPeerConnections[data.streamId].close();
            delete viewerPeerConnections[data.streamId];
        }
        setTimeout(refreshSalonStreams, 300);
    });

    socket.on('salon:stream-updated', () => {
        setTimeout(refreshSalonStreams, 300);
    });

    // WebRTC Viewer
    socket.on('webrtc:answer', async (data) => {
        if (viewerPeerConnections[data.streamId] && viewerPeerConnections[data.streamId].setRemoteDescription) {
            try {
                await viewerPeerConnections[data.streamId].setRemoteDescription(
                    new RTCSessionDescription(data.answer)
                );
            } catch (err) { console.error('WebRTC:', err); }
        }
    });

    socket.on('webrtc:ice-candidate', async (data) => {
        for (const [streamId, pc] of Object.entries(viewerPeerConnections)) {
            if (pc && pc.addIceCandidate && data.candidate) {
                try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (err) {}
            }
        }
    });

    // Réactions
    socket.on('reaction', (data) => { showEmojiFloat(data.emoji); });

    // Cadeaux
    socket.on('gift', (data) => {
        animateGift(data);
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = 'message p-3 bg-gradient-to-r ' + safeGiftColor(data.color) + ' rounded-xl text-center';
        const text = document.createElement('p');
        text.className = 'text-sm text-white font-bold drop-shadow';
        text.textContent = String(data.username || '') + ' a envoyé ' + String(data.gift || '') + ' ' + String(data.giftName || '') +
            (data.receiver ? ' à ' + String(data.receiver) : '');
        div.appendChild(text);
        container.appendChild(div);
        scrollToBottom();
    });
}

// ============================================================
// CAMÉRAS DU SALON
// ============================================================
function refreshSalonStreams() {
    if (socket) socket.emit('salon:request-streams');
}

function renderSalonCameras() {
    const grid = document.getElementById('camerasGrid');
    const count = document.getElementById('cameraCount');
    const myId = currentUser ? currentUser.id : 0;

    if (!salonStreams || salonStreams.length === 0) {
        count.textContent = '0';
        grid.innerHTML = '<p class="text-slate-400 text-center py-6 text-xs col-span-full" data-aucune-cam><i class="fa-solid fa-video-slash mr-1"></i> Aucune caméra active dans ce salon</p>';
        majTuileLocale();
        return;
    }

    count.textContent = salonStreams.length;

    grid.innerHTML = salonStreams.map(s => {
        const isMe = s.broadcasterId === myId;
        const isMuted = remoteAudioStates[s.streamId] !== false;

        return `
            <div class="camera-tile relative bg-slate-900 rounded-xl overflow-hidden aspect-video ${s.isCameraOff ? 'cam-off' : ''}" data-stream-id="${escapeHtml(s.streamId)}">
                <video id="cam-${escapeHtml(s.streamId)}" autoplay playsinline muted class="w-full h-full object-cover"></video>

                ${s.isCameraOff ? `
                    <div class="absolute inset-0 flex flex-col items-center justify-center text-white bg-slate-900/90">
                        <i class="fa-solid fa-video-slash text-2xl mb-1"></i>
                        <p class="text-[10px]">Cam masquée</p>
                    </div>
                ` : ''}

                <!-- LIVE badge -->
                <div class="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1">
                    <span class="w-1 h-1 bg-white rounded-full live-pulse"></span> LIVE
                </div>

                <!-- Son button -->
                ${!isMe ? `
                    <button data-chat-action="son" data-stream="${escapeHtml(s.streamId).replace(/"/g, '&quot;')}"
                        class="absolute top-1.5 right-1.5 w-6 h-6 rounded bg-black/60 hover:bg-black/80 backdrop-blur text-white text-[10px] flex items-center justify-center"
                        title="Son">
                        <i class="fa-solid ${isMuted ? 'fa-volume-xmark' : 'fa-volume-high'}" id="vol-icon-${s.streamId}"></i>
                    </button>
                ` : ''}

                <!-- Infos bas -->
                <div class="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent">
                    <p class="text-white text-[10px] font-bold truncate">
                        ${escapeHtml(s.broadcasterUsername)}${isMe ? ' (moi)' : ''}
                    </p>
                    <p class="text-white/70 text-[9px]">${Number(s.viewers) || 0} 👁️</p>
                </div>

                <!-- Micro coupé -->
                ${s.isMicMuted ? `
                    <div class="absolute bottom-1.5 right-1.5 bg-orange-500 text-white text-[9px] p-1 rounded">
                        <i class="fa-solid fa-microphone-slash"></i>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    // Démarrer WebRTC pour chaque stream (sauf le mien)
    salonStreams.forEach(s => {
        if (s.broadcasterId !== myId && !viewerPeerConnections[s.streamId]) {
            startViewingStream(s.streamId);
        }
    });

    majTuileLocale();
    afficherMaCamera();
}

// 📷 Ma caméra allumée mais pas (encore) dans la liste du serveur : je la vois quand même en petit,
// avec son état. Cette vignette n'existe que sur MON écran, les autres membres ne la voient pas.
function majTuileLocale() {
    const grid = document.getElementById('camerasGrid');
    if (!grid) return;
    const e = etatMaCam();
    const myId = currentUser ? String(currentUser.id) : '';
    const dejaListee = (salonStreams || []).some(s => String(s.broadcasterId) === myId || (e && e.streamId && s.streamId === e.streamId));
    const besoin = !!(e && e.active && !dejaListee);
    let tuile = document.getElementById('tuileMaCamLocale');
    const vide = grid.querySelector('[data-aucune-cam]');

    if (!besoin) {
        if (tuile) tuile.remove();
        if (!grid.children.length) grid.innerHTML = '<p class="text-slate-400 text-center py-6 text-xs col-span-full" data-aucune-cam><i class="fa-solid fa-video-slash mr-1"></i> Aucune caméra active dans ce salon</p>';
        return;
    }
    if (vide) vide.remove();
    if (!tuile) {
        tuile = document.createElement('div');
        tuile.id = 'tuileMaCamLocale';
        tuile.className = 'camera-tile relative bg-slate-900 rounded-xl overflow-hidden aspect-video cursor-pointer';
        tuile.title = 'Ma caméra';
        tuile.onclick = () => { if (window.EvcMaCam) EvcMaCam.ouvrir(); };
        grid.prepend(tuile);
    }
    const etiquette = e.broadcasting
        ? '<div class="absolute top-1.5 left-1.5 bg-red-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">● EN DIRECT</div>'
        : '<div class="absolute top-1.5 left-1.5 text-white text-[9px] font-bold px-1.5 py-0.5 rounded" style="background:#6b7280">🔒 Visible modération</div>';
    const action = e.broadcasting ? '' :
        '<button type="button" data-chat-action="diffuser" class="absolute top-1.5 right-1.5 text-white text-[10px] font-bold px-2 py-1 rounded-md" style="background:#e11d48">🔴 Diffuser</button>';
    const etat = e.broadcasting ? 'en direct' : 'non diffusée';
    if (tuile.dataset.etat !== etat) {
        tuile.dataset.etat = etat;
        tuile.innerHTML = '<video id="cam-moi-local" autoplay playsinline muted class="w-full h-full object-cover" style="transform:scaleX(-1)"></video>'
            + etiquette + action
            + '<div class="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/90 to-transparent"><p class="text-white text-[10px] font-bold truncate">'
            + escapeHtml(currentUser ? currentUser.username || 'Moi' : 'Moi') + ' (moi)</p></div>';
    }
    const v = document.getElementById('cam-moi-local');
    if (v && e.stream && v._evcSource !== e.stream) {
        v._evcSource = e.stream;
        try { v.srcObject = new MediaStream(e.stream.getVideoTracks()); } catch (er) { v.srcObject = e.stream; }
        v.play().catch(() => {});
    }
}

async function diffuserDepuisTuile(bouton) {
    let S = null;
    try { S = window.top !== window ? window.top.EvcCamSession : null; } catch (e) {}
    if (!S) return;
    bouton.disabled = true; bouton.textContent = '…';
    try {
        await S.startBroadcast({ private: false });
        if (typeof showToast === 'function') showToast('Tu es en direct dans le salon');
        setTimeout(refreshSalonStreams, 1500);   // le serveur ajoute le live à la liste
    } catch (er) {
        bouton.disabled = false; bouton.textContent = '🔴 Diffuser';
        if (typeof showToast === 'function') showToast(er.message || 'Diffusion impossible', 'error');
    }
}

// 📷 Ma caméra persistante : affichée directement dans ma tuile (sans repasser par le réseau)
function afficherMaCamera() {
    let S = null;
    try { S = window.top !== window ? window.top.EvcCamSession : null; } catch (e) {}
    const etat = S ? S.getState() : null;
    const myId = currentUser ? String(currentUser.id) : '';
    (salonStreams || []).forEach(s => {
        const estMoi = String(s.broadcasterId) === myId || !!(etat && etat.streamId && s.streamId === etat.streamId);
        if (!estMoi) return;
        const v = document.getElementById('cam-' + s.streamId);
        if (!v) return;
        v.muted = true;
        if (etat && etat.stream) {
            if (v._evcSource !== etat.stream || !v.srcObject) {
                v._evcSource = etat.stream;
                // Flux recréé dans la page (iPhone : plus fiable qu'un flux venu de la fenêtre parente)
                try { v.srcObject = new MediaStream(etat.stream.getVideoTracks()); }
                catch (e) { v.srcObject = etat.stream; }
            }
            v.play().catch(() => {});
        }
        // Sécurité : si l'image reste noire, on affiche ma caméra par le réseau, comme les autres la voient
        clearTimeout(v._evcSecours);
        v._evcSecours = setTimeout(() => {
            if (!v.isConnected || v.videoWidth) return;
            const sub = viewerPeerConnections[s.streamId];
            if (sub && sub.evcStream) { v.srcObject = sub.evcStream; v.play().catch(() => {}); }
            else if (!sub) startViewingStream(s.streamId);
        }, 2500);
    });
}
// Flux remplacé (ex. caméra récupérée après mise en veille sur iPhone) : on le remet dans ma tuile
window.addEventListener('evc:cam', (ev) => {
    if (!ev.detail || ev.detail.type !== 'state') return;
    majTuileLocale();
    afficherMaCamera();
    // Diffusion lancée ou arrêtée (ici ou ailleurs) : on redemande la liste au serveur
    if (ev.detail.broadcasting !== window.__evcEtaitEnDirect) {
        window.__evcEtaitEnDirect = ev.detail.broadcasting;
        setTimeout(refreshSalonStreams, 1500);
    }
});

async function startViewingStream(streamId) {
    const stream = salonStreams.find(s => s.streamId === streamId);
    if (!stream) return;

    try {
        const attach = (ms) => {
            const videoEl = document.getElementById('cam-' + streamId);
            if (videoEl) { videoEl.srcObject = ms; videoEl.play().catch(e => {}); }
        };
        // 1) via le SFU ; 2) sinon connexion directe (relais Cloudflare)
        viewerPeerConnections[streamId] = { placeholder: true, close() {} };
        const sub = await EvcSfu.subscribe(streamId, { preferredRid: 'h', onStream: attach });
        if (sub) {
            if (viewerPeerConnections[streamId] && viewerPeerConnections[streamId].placeholder) viewerPeerConnections[streamId] = sub;
            else sub.close();
            return;
        }
        if (!viewerPeerConnections[streamId]) return;
        const rtcConfig = (await EvcSfu.loadConfig()).rtc;
        const pc = new RTCPeerConnection(rtcConfig);
        viewerPeerConnections[streamId] = pc;

        pc.ontrack = (event) => attach(event.streams[0]);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('webrtc:ice-candidate', {
                    candidate: event.candidate,
                    streamId: streamId
                });
            }
        };

        const offer = await pc.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: true
        });
        await pc.setLocalDescription(offer);
        socket.emit('webrtc:offer', { offer: offer, streamId: streamId });
    } catch (err) {
        console.error('Erreur WebRTC:', err);
    }
}

function toggleCameraAudio(streamId) {
    const videoEl = document.getElementById('cam-' + streamId);
    const iconEl = document.getElementById('vol-icon-' + streamId);
    if (!videoEl) return;

    const currentMuted = remoteAudioStates[streamId] !== false;
    remoteAudioStates[streamId] = !currentMuted;
    videoEl.muted = !currentMuted;

    if (iconEl) {
        iconEl.className = !currentMuted
            ? 'fa-solid fa-volume-xmark'
            : 'fa-solid fa-volume-high';
    }
}

function toggleCameraView() {
    cameraViewExpanded = !cameraViewExpanded;
    const grid = document.getElementById('camerasGrid');
    const icon = document.getElementById('cameraViewIcon');
    if (cameraViewExpanded) {
        grid.classList.remove('hidden');
        icon.className = 'fa-solid fa-eye';
    } else {
        grid.classList.add('hidden');
        icon.className = 'fa-solid fa-eye-slash';
    }
}

// ============================================================
// CHAT
// ============================================================
function sendMessage(e) {
    e.preventDefault();
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if (!text || !socket) return;
    socket.emit('chat:message', { text: text, salon: currentSalon });
    input.value = '';
}

function renderMessage(msg) {
    const container = document.getElementById('chatMessages');
    const isMe = currentUser && msg.user_id === currentUser.id;
    const time = new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const icons = { super_admin: '👑', moderator: '🔵', model: '🟢', user: '⚪' };
    const icon = icons[msg.role] || '';
    const div = document.createElement('div');
    div.className = 'message';
    // 🤖 Animateur virtuel : toujours affiché comme une IA, sans message privé possible
    if (msg.bot || msg.role === 'bot') {
        div.innerHTML = '<div class="evc-bot-msg"><div class="evc-bot-tete"><span class="evc-bot-av" aria-hidden="true">🤖</span><strong>' + escapeHtml(msg.username) + '</strong>' +
            '<span class="evc-bot-ia" title="Animateur virtuel : messages automatiques, ce n’est pas une personne">IA</span><span class="text-[10px] text-slate-400">' + time + '</span></div>' +
            '<p>' + escapeHtml(msg.text) + '</p></div>';
        // 🧠 Quiz en direct : boutons de réponse, compte à rebours, sons (et air à deviner pour le blind test)
        if (msg.quiz && typeof EvcQuiz !== 'undefined') div.querySelector('.evc-bot-msg').appendChild(EvcQuiz.carte(msg));
        container.appendChild(div);
        return;
    }
    div.innerHTML = '<div class="' + (isMe ? 'flex justify-end' : '') + '">' +
        '<div class="' + (isMe ? 'bg-brand-primary text-white rounded-2xl rounded-tr-sm px-4 py-2 max-w-md' : 'max-w-md') + '">' +
            (!isMe ? '<div class="flex items-center gap-2 mb-0.5"><button type="button" data-uid="' + Number(msg.user_id) + '" data-n="' + escapeHtml(msg.username) + '" title="Écrire en privé" class="text-xs font-bold text-slate-700 hover:text-purple-600">' + icon + ' ' + escapeHtml(msg.username) + insigneHtml(msg.insigne) + '</button><span class="text-[10px] text-slate-400">' + time + '</span></div>' : '') +
            '<p class="text-sm ' + (isMe ? '' : 'text-slate-700') + '">' + escapeHtml(msg.text) + '</p>' +
        '</div>' +
    '</div>';
    container.appendChild(div);
}

function joinSalon(slug) {
    const x = trouverSalon(slug);
    if (!x || x.slug === currentSlug) return;
    appliquerSalon(x.name, x.slug);
    recordJoin(x.slug);

    // Fermer les caméras de l'ancien salon
    Object.keys(viewerPeerConnections).forEach(streamId => {
        try { viewerPeerConnections[streamId].close(); } catch (e) {}
        delete viewerPeerConnections[streamId];
    });
    salonStreams = [];
    renderSalonCameras();
    membres = membresDuServeur ? [] : tousConnectes;
    dessinerMembres();

    if (socket) socket.emit('salon:join', x.slug);
}

function sendReaction(emoji) {
    if (socket) socket.emit('reaction', { emoji: emoji });
}

function showEmojiFloat(emoji) {
    const el = document.createElement('div');
    el.className = 'emoji-float';
    el.innerText = emoji;
    el.style.left = (Math.random() * 60 + 20) + '%';
    el.style.bottom = '100px';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2000);
}

function scrollToBottom() {
    const c = document.getElementById('chatMessages');
    setTimeout(() => { c.scrollTop = c.scrollHeight; }, 50);
}

function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}

// ============================================================
// CADEAUX
// ============================================================
async function openGiftModal() {
    document.getElementById('giftModal').classList.remove('hidden');
    document.getElementById('giftModal').classList.add('flex');
    await loadGifts();
    await loadGiftBalance();
}

function closeGiftModal() {
    document.getElementById('giftModal').classList.add('hidden');
    document.getElementById('giftModal').classList.remove('flex');
    selectedGift = null;
    document.getElementById('giftSendBtn').disabled = true;
    document.getElementById('giftSendBtn').innerText = 'Sélectionnez un cadeau';
}

async function loadGifts() {
    try {
        const data = await apiCall('/credits/gifts');
        gifts = data.gifts;
        renderGifts();
    } catch (err) {
        document.getElementById('giftsGrid').innerHTML = '<p class="text-rose-500 col-span-full text-center">' + escapeHtml(err.message) + '</p>';
    }
}

async function loadGiftBalance() {
    try {
        const data = await apiCall('/credits/balance');
        userBalance = data.balance;
        document.getElementById('giftBalance').innerText = data.balance;
    } catch (err) {}
}

function safeGiftColor(color) {
    const allowed = ['from-rose-500 to-pink-600', 'from-rose-600 to-red-600', 'from-amber-400 to-yellow-500',
        'from-rose-400 to-pink-500', 'from-amber-500 to-orange-500', 'from-amber-500 to-yellow-600',
        'from-yellow-400 to-amber-500', 'from-cyan-400 to-blue-500', 'from-purple-500 to-pink-600',
        'from-red-500 to-purple-700', 'from-red-600 to-orange-600'];
    return allowed.includes(color) ? color : 'from-pink-500 to-purple-600';
}

function renderGifts() {
    const grid = document.getElementById('giftsGrid');
    grid.replaceChildren();
    gifts.forEach(g => {
        if (!Number.isSafeInteger(g.id)) return;
        const button = document.createElement('button');
        button.id = 'gift-' + g.id;
        button.className = 'gift-item relative p-3 rounded-2xl border-2 border-slate-200 hover:border-brand-primary bg-white transition-all text-center';
        button.addEventListener('click', () => selectGift(g.id));
        for (const [tag, className, value] of [
            ['div', 'text-3xl mb-1', g.emoji],
            ['p', 'text-xs font-bold text-slate-800', g.name],
            ['p', 'text-[10px] text-brand-primary font-bold mt-0.5', g.price + ' crédits']
        ]) {
            const element = document.createElement(tag);
            element.className = className;
            element.textContent = String(value || '');
            button.appendChild(element);
        }
        grid.appendChild(button);
    });
}

function selectGift(giftId) {
    selectedGift = gifts.find(g => g.id === giftId);
    document.querySelectorAll('.gift-item').forEach(el => {
        el.classList.remove('border-brand-primary', 'bg-pink-50', 'ring-2', 'ring-pink-200');
        el.classList.add('border-slate-200');
    });
    const el = document.getElementById('gift-' + giftId);
    el.classList.remove('border-slate-200');
    el.classList.add('border-brand-primary', 'bg-pink-50', 'ring-2', 'ring-pink-200');

    const btn = document.getElementById('giftSendBtn');
    btn.disabled = false;
    btn.innerText = 'Envoyer ' + selectedGift.emoji + ' ' + selectedGift.name + ' (' + selectedGift.price + ' crédits)';
}

async function confirmSendGift() {
    if (!selectedGift) return;
    if (userBalance < selectedGift.price) {
        showToast('Pas assez de crédits pour ce cadeau. Les crédits se gagnent en participant au site (page Mes récompenses).', 'error');
        return;
    }

    const receiver = document.getElementById('giftReceiver').value.trim();
    const message = document.getElementById('giftMessage').value.trim();

    try {
        const result = await apiCall('/credits/gifts/send', {
            method: 'POST',
            body: JSON.stringify({
                giftId: selectedGift.id,
                receiverUsername: receiver || null,
                salon: currentSalon,
                message: message
            })
        });

        // L'annonce du cadeau est émise par le serveur après le débit.

        showToast('🎁 ' + selectedGift.name + ' envoyé !', 'success');
        userBalance = result.newBalance;
        document.getElementById('giftBalance').innerText = userBalance;
        closeGiftModal();
        document.getElementById('giftReceiver').value = '';
        document.getElementById('giftMessage').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function animateGift(giftData) {
    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0);font-size:8rem;z-index:99999;pointer-events:none;transition:all 0.8s cubic-bezier(0.34,1.56,0.64,1);filter:drop-shadow(0 0 30px rgba(233,30,99,0.6));';
    const layout = document.createElement('div');
    layout.style.textAlign = 'center';
    const emoji = document.createElement('div');
    emoji.style.cssText = 'font-size:8rem;animation:gift-bounce 0.6s ease-out;';
    emoji.textContent = String(giftData.gift || '🎁');
    const label = document.createElement('div');
    label.style.cssText = 'font-size:1.2rem;color:white;font-weight:bold;text-shadow:0 2px 10px rgba(0,0,0,0.5);margin-top:-20px;';
    label.textContent = String(giftData.username || '') + ' → ' + String(giftData.giftName || 'Cadeau');
    layout.append(emoji, label);
    container.appendChild(layout);
    document.body.appendChild(container);
    setTimeout(() => { container.style.transform = 'translate(-50%,-50%) scale(1)'; }, 50);
    setTimeout(() => {
        container.style.transform = 'translate(-50%,-150%) scale(1.5)';
        container.style.opacity = '0';
    }, 1500);
    setTimeout(() => container.remove(), 2500);
}

// ============================================================
// SIGNALEMENT
// ============================================================
function openReportModal() {
    document.getElementById('reportModal').classList.remove('hidden');
    document.getElementById('reportModal').classList.add('flex');
}

function closeReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
    document.getElementById('reportModal').classList.remove('flex');
}

async function submitReport(e) {
    e.preventDefault();
    const targetUsername = document.getElementById('reportTarget').value.trim();
    const reason = document.getElementById('reportReason').value;
    const description = document.getElementById('reportDescription').value.trim();

    try {
        await apiCall('/reports', {
            method: 'POST',
            body: JSON.stringify({
                targetType: 'user',
                targetUsername: targetUsername,
                reason: reason,
                description: description
            })
        });
        showToast('✅ Signalement envoyé', 'success');
        closeReportModal();
        document.getElementById('reportTarget').value = '';
        document.getElementById('reportReason').value = '';
        document.getElementById('reportDescription').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---------- Boutons générés dans les listes et les tuiles ----------
// Remplacent des attributs onclick (bloqués par la CSP stricte). Écoute en phase de capture puis
// stopPropagation, comme avant : le clic ne déclenche pas aussi la tuile ou la ligne qui les contient.
document.addEventListener('click', function (e) {
    const b = e.target.closest && e.target.closest('[data-chat-action]');
    if (!b) return;
    e.stopPropagation();
    const action = b.dataset.chatAction;
    if (action === 'macam') { e.preventDefault(); demarrerMaCamAvatar(); }
    else if (action === 'son') toggleCameraAudio(b.dataset.stream);
    else if (action === 'diffuser') diffuserDepuisTuile(b);
}, true);

// Bouton « Ma caméra » de l'en-tête
document.getElementById('maCamBtn').addEventListener('click', function () {
    if (window.EvcMaCam) EvcMaCam.ouvrir(); else location.href = 'live.html';
});
