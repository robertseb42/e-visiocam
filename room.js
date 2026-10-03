/* ==========================================================
   E-VISIOCAM — SALON EN DIRECT (room.html?theme=<slug>)
   Chat public, membres et caméras branchés sur le vrai serveur.
   Le design vient de la maquette d'origine ; seules les données
   sont désormais réelles (socket.io + API E-VISIOCAM).
   ========================================================== */
const $ = s => document.querySelector(s);
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('s'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove('s'), 1900); };
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ppl = '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.500"/><path d="M2.500 20c0-4 3-6 6.500-6s6.500 2 6.500 6"/></svg>';
const camIco = '<svg class="cm" viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2" fill="currentColor"/><path d="M16 10l6-3v10l-6-3z" fill="currentColor"/></svg>';
const silhouette = '<svg class="p" viewBox="0 0 100 100"><circle cx="50" cy="34" r="17"/><path d="M12 100c0-26 16-38 38-38s38 12 38 38z"/></svg>';

/* Liste des salons : repli local, remplacé par la liste réelle du serveur
   (noms, icônes et caractère VIP réglés dans le panneau super admin). */
let SALONS = [
  ['general', 'Salon Général', '🌍'],
  ['francais', 'Salon Français', '🇫🇷'],
  ['international', 'Salon International', '🌐'],
  ['couples', 'Salon Couples', '💕'],
  ['amateurs', 'Salon Amateurs', '✨'],
  ['musique', 'Salon Musique', '🎵'],
  ['vip', 'VIP Lounge', '👑'],
  ['premium', 'Salon Premium', '💎']
];
let PRIVATES = ['vip', 'premium'];
let CACHES = [];   // salons masqués (visibles seulement par l'équipe)
let SLUGS = SALONS.map(s => s[0]);
let NAMES = {};
SALONS.forEach(s => NAMES[s[0]] = s[1]);

let cur = Math.max(0, SLUGS.indexOf(new URLSearchParams(location.search).get('theme')));
let salon = NAMES[SLUGS[cur]];

/* Récupère la liste réelle : un salon passé VIP dans le panneau est reconnu ici */
async function chargerSalons() {
  if (typeof SalonAccess === 'undefined' || !SalonAccess.salons) return;
  const demande = SLUGS[cur];
  const liste = await SalonAccess.salons().catch(() => null);
  if (!liste || !liste.length) return;
  SALONS = liste.map(s => [s.slug, s.name, s.icon || '💬', s.logoUrl || null]);
  PRIVATES = liste.filter(s => s.isPrivate).map(s => s.slug);
  CACHES = liste.filter(s => s.isHidden).map(s => s.slug);
  SLUGS = SALONS.map(s => s[0]);
  NAMES = {};
  SALONS.forEach(s => NAMES[s[0]] = s[1]);
  const i = SLUGS.indexOf(demande);
  cur = i >= 0 ? i : 0;
  salon = NAMES[SLUGS[cur]];
}
let socket = null, user = null, users = [], streams = [], peers = {}, onlyCam = false, target = '';
const pub = [];   // messages affichés dans la discussion publique
/* Messages privés : nonLus = id du membre -> nombre de messages non lus de sa part (affiché sur sa pastille) ;
   actif = la conversation ouverte dans l'encart en bas à gauche. */
const prive = { nonLus: {}, actif: null };
let targetId = null;   // id du membre dont le menu est ouvert

const ROLE_COLORS = { super_admin: '#ffd60a', moderator: '#2f7bff', model: '#ff2d78', user: '#8b93a3' };
const ROLE_ICONS = { super_admin: '👑', moderator: '🔵', model: '🟢', user: '⚪' };
const colOf = r => ROLE_COLORS[r] || ROLE_COLORS.user;
const hm = d => new Date(d || Date.now()).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/* ---------- connexion obligatoire ---------- */
if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
  location.href = 'login.html?redirect=' + encodeURIComponent('room.html' + location.search);
}
user = (typeof getCurrentUser === 'function' ? getCurrentUser() : null);
if (user && user.username) {
  const av = document.querySelector('header .av');
  if (av) {
    av.textContent = user.username[0].toUpperCase();
    // Fille = rose, garçon = bleu, non précisé ou non genré = jaune
    const g = (user.gender || '').toLowerCase();
    const couleur = (g === 'femme' || g === 'female' || g === 'f') ? '#ec4899' : (g === 'homme' || g === 'male' || g === 'h') ? '#3b82f6' : '#eab308';
    av.style.setProperty('--c', couleur);
    av.style.color = couleur === '#eab308' ? '#111' : '#fff';
  }
}

// La page ne doit JAMAIS rester masquée : certaines versions de room.html la
// cachaient pour les salons privés. On la réaffiche tout de suite, puis par sécurité.
function afficherLaPage() { try { document.documentElement.style.visibility = ''; } catch (e) {} }
afficherLaPage();
setTimeout(afficherLaPage, 1200);

/* ============================================================
   🔒 SALON PRIVÉ : cadenas + demande d'accès
   La demande part vers le panneau du super administrateur ET vers
   les modérateurs, qui peuvent l'accepter ou la refuser.
   ============================================================ */
function panneauPrive(slug, statut) {
  let box = document.getElementById('cadenasSalon');
  if (!box) {
    box = document.createElement('div');
    box.id = 'cadenasSalon';
    box.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;'
      + 'background:rgba(5,6,10,.72);padding:20px';
    document.body.appendChild(box);
  }
  const nom = NAMES[slug] || slug;
  const explications = {
    none: "Ce salon est privé. Demandez l'accès : un modérateur ou l'administrateur validera votre demande.",
    pending: "Votre demande d'accès est en attente de validation.",
    refused: "Votre demande d'accès a été refusée.",
    approved: 'Accès accordé, vous pouvez entrer.'
  };
  box.innerHTML = `
    <div style="max-width:420px;width:100%;background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:24px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.5)">
      <div style="font-size:36px;line-height:1">🔒</div>
      <h2 style="margin:12px 0 6px;font-size:20px">${esc(nom)}</h2>
      <p style="color:var(--mut);font-size:14px;margin:0 0 18px">${explications[statut] || explications.none}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
        ${statut === 'none' ? '<button id="btnDemandeAcces" style="background:var(--yel);color:#111;border-radius:10px;padding:11px 18px;font-weight:700"><i class="fa-solid fa-key mr-1"></i>Demander l\'accès</button>' : ''}
        ${statut === 'approved' ? '<button id="btnEntrerSalon" style="background:var(--yel);color:#111;border-radius:10px;padding:11px 18px;font-weight:700">Entrer dans le salon</button>' : ''}
        <button id="btnFermerCadenas" style="background:var(--card);border:1px solid var(--line);color:var(--tx);border-radius:10px;padding:11px 18px;font-weight:600">Fermer</button>
      </div>
      <p style="color:var(--mut);font-size:12px;margin:14px 0 0">Les demandes arrivent dans <b>Admin → Demandes d'accès salons</b> (super administrateur et modérateurs).</p>
    </div>`;

  const demande = document.getElementById('btnDemandeAcces');
  if (demande) demande.onclick = async function() {
    demande.disabled = true;
    try {
      await SalonAccess.request(slug);
      panneauPrive(slug, 'pending');
      toast('Demande d\'accès envoyée');
    } catch (e) {
      demande.disabled = false;
      toast('Impossible d\'envoyer la demande');
    }
  };
  const entrer = document.getElementById('btnEntrerSalon');
  if (entrer) entrer.onclick = function() { box.remove(); ouvrirSalon(slug); };
  document.getElementById('btnFermerCadenas').onclick = function() { box.remove(); };
}

function ouvrirSalon(slug) {
  const i = SLUGS.indexOf(slug);
  if (i < 0) return;
  cur = i;
  salon = NAMES[slug];
  joinSalon();
}

/* ---------- salon privé demandé à l'ouverture : traité au démarrage ---------- */

/* ---------- liste des salons ---------- */
function drawRooms() {
  const boite = $('#rooms');
  if (!boite) return;
  boite.innerHTML = SALONS.map((s, i) =>
    `<button class="room ${i === cur ? 'act' : ''}" data-i="${i}"><b class="ic">${(typeof SalonAccess !== 'undefined' && SalonAccess.logoHtml) ? SalonAccess.logoHtml({ icon: s[2], logoUrl: s[3] }, 22) : esc(s[2])}</b>${s[1]}${PRIVATES.includes(s[0]) ? ' 🔒' : ''}${CACHES.includes(s[0]) ? ' 🚫' : ''}</button>`
  ).join('');
  const rt = $('#rt'); if (rt) rt.textContent = salon;
  document.title = 'E-Visiocam – ' + salon;
  const rc = $('#rc'); if (rc) rc.textContent = users.length + (users.length > 1 ? ' connectés' : ' connecté');
  const mc = $('#mc'); if (mc) mc.textContent = users.length;
}

$('#rooms').onclick = async e => {
  const b = e.target.closest('.room');
  if (!b) return;
  const i = +b.dataset.i;
  if (i === cur) return;
  if (PRIVATES.includes(SLUGS[i]) && typeof SalonAccess !== 'undefined') {
    const st = await SalonAccess.status(SLUGS[i]);
    // Salon privé : cadenas + demande d'accès au lieu d'un simple refus
    if (st !== 'approved') { panneauPrive(SLUGS[i], st); return; }
  }
  cur = i;
  salon = NAMES[SLUGS[cur]];
  joinSalon();
};

/* ---------- membres ---------- */
function drawList() {
  const listEl = $('#list');
  if (!listEl) return;
  const qEl = $('#q');
  const q = ((qEl && qEl.value) || '').toLowerCase();
  const list = users.filter(u => (u.username || '').toLowerCase().includes(q) && (!onlyCam || u.streamId));
  listEl.innerHTML = list.length
    ? list.map(u => {
        const n = u.username || '?', c = colOf(u.role), uid = u.id;
        const nonLus = Number(prive.nonLus[uid]) || 0;
        const actif = !!(prive.actif && String(prive.actif.userId) === String(uid));
        // Indicateur sur le logo de la personne : nombre de messages privés non lus, ou bulle si la conversation est ouverte
        const pastille = nonLus ? `<span class="pb" aria-label="${nonLus} message${nonLus > 1 ? 's' : ''} privé${nonLus > 1 ? 's' : ''} non lu${nonLus > 1 ? 's' : ''}">${nonLus > 99 ? '99+' : nonLus}</span>`
          : actif ? '<span class="pb pb-chat" aria-label="Conversation privée ouverte">💬</span>' : '';
        return `<div class="m"><div class="av on${actif ? ' priv-act' : ''}${nonLus ? ' priv-new' : ''}" data-uid="${esc(uid)}" data-n="${esc(n)}" data-c="${c}" style="--c:${c}" role="button" tabindex="0" title="Écrire en privé à ${esc(n)}">${esc(n[0].toUpperCase())}${pastille}</div><span>${ROLE_ICONS[u.role] || ''} ${esc(n)}</span>` +
          (u.streamId ? camIco : '<span class="cm"></span>') +
          `<button class="dots" data-id="${esc(uid)}" data-n="${esc(n)}" data-c="${c}" data-s="${esc(u.streamId || '')}" aria-label="Options ${esc(n)}">` +
          '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></svg></button></div>';
      }).join('')
    : '<div class="m" style="color:var(--mut);font-weight:500">Personne dans ce salon pour le moment</div>';
}
$('#q').oninput = drawList;
$('#c1').onclick = () => { onlyCam = false; $('#c1').classList.add('act'); $('#c2').classList.remove('act'); drawList(); };
$('#c2').onclick = () => { onlyCam = true; $('#c2').classList.add('act'); $('#c1').classList.remove('act'); drawList(); };

/* ---------- caméras du salon ---------- */
function drawCams() {
  const grid = $('#grid');
  if (!grid) return;   // ancienne version de room.html : on n'empêche rien d'autre de s'afficher
  if (!streams.length) {
    grid.innerHTML = `<div class="cam" style="--g1:#20242e;--g2:#12151c">${silhouette}<div class="n" style="color:var(--mut)">Aucune caméra active</div></div>`;
    return;
  }
  grid.innerHTML = streams.map(s =>
    `<div class="cam" id="tile-${esc(s.streamId)}" data-stream="${esc(s.streamId)}">` +
    (s.isCameraOff ? silhouette : `<video id="cam-${esc(s.streamId)}" autoplay playsinline muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000"></video>`) +
    `<div class="n${s.isMicMuted ? ' mute' : ''}" style="left:auto;right:8px">${s.isPrivate ? '🔒 ' : ''}${esc(s.broadcasterUsername || '')}` +
    (user && s.broadcasterId === user.id ? ' (moi)' : '') +
    (s.isMicMuted ? ' <span style="color:var(--pink)">micro coupé</span>' : '') + '</div></div>'
  ).join('');

  streams.forEach(s => {
    if (user && s.broadcasterId === user.id) return;
    if (!peers[s.streamId]) { viewStream(s.streamId); return; }
    const ms = peers[s.streamId].evcStream, v = document.getElementById('cam-' + s.streamId);
    if (ms && v && v.srcObject !== ms) { v.srcObject = ms; v.play().catch(() => {}); }
  });
}

async function viewStream(streamId) {
  if (peers[streamId]) return;
  peers[streamId] = { placeholder: true, close() {} };      // réserve la place pendant la négociation
  const attach = ms => {
    const v = document.getElementById('cam-' + streamId);
    if (v) { v.srcObject = ms; v.play().catch(() => {}); }
  };
  // 1) via le SFU (un seul flux envoyé par le diffuseur) ; 2) sinon connexion directe
  try {
    if (window.EvcSfu) {
      const sub = await EvcSfu.subscribe(streamId, { preferredRid: 'h', onStream: attach });
      if (sub) {
        if (peers[streamId] && peers[streamId].placeholder) peers[streamId] = sub; else sub.close();
        return;
      }
    }
  } catch (e) {}
  if (!peers[streamId]) return;                             // le live s'est arrêté entre-temps
  viewDirect(streamId, attach);
}

async function viewDirect(streamId, attach) {
  try {
    const cfg = window.EvcSfu ? (await EvcSfu.loadConfig()).rtc : { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] };
    if (!peers[streamId]) return;
    const pc = new RTCPeerConnection(cfg);
    peers[streamId] = pc;
    pc.ontrack = ev => { pc.evcStream = ev.streams[0]; attach(ev.streams[0]); };
    pc.onicecandidate = ev => { if (ev.candidate && socket) socket.emit('webrtc:ice-candidate', { candidate: ev.candidate, streamId }); };
    pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
      .then(o => pc.setLocalDescription(o).then(() => socket.emit('webrtc:offer', { offer: o, streamId })))
      .catch(() => {});
  } catch (e) {}
}

/* ---------- discussion publique ---------- */
function drawPub() {
  const zone = $('#pub');
  if (!zone) return;
  zone.innerHTML = pub.length
    ? pub.map(m => m.sys
        ? `<div class="l" style="display:block;color:var(--mut);font-style:italic;font-size:13px">— ${esc(m.text)} —</div>`
        : `<div class="l"><div class="av" style="--c:${m.color};${m.me ? 'color:#111' : ''}">${esc((m.name[0] || '?').toUpperCase())}</div>` +
          `<strong style="color:${m.color}">${esc(m.name)}</strong><span>${esc(m.text)}</span><time>${m.time}</time></div>`
      ).join('')
    : '<div class="l" style="display:block;color:var(--mut);font-size:13px">Aucun message. Soyez le premier !</div>';
  zone.scrollTop = 1e5;
}

$('#f').onsubmit = e => {
  e.preventDefault();
  const v = $('#i').value.trim();
  if (!v) return;
  if (!socket || !socket.connected) { toast('Connexion au serveur en cours…'); return; }
  socket.emit('chat:message', { text: v, salon });
  $('#i').value = '';
};

/* ---------- conversation privée (encart en bas à gauche) ---------- */
// Les messages du serveur ont une date « AAAA-MM-JJ HH:MM:SS » en heure universelle
function heurePrivee(d) {
  const t = typeof d === 'string' && !/[TZ]/.test(d) ? d.replace(' ', 'T') + 'Z' : d;
  return hm(t);
}
const lignePrivee = m => ({ id: m.id, me: !!(user && m.sender_id === user.id), text: m.content, time: heurePrivee(m.created_at) });

function dessinerPrive() {
  const zone = $('#pm'), nom = $('#pn'), champ = $('#pi');
  if (!zone) return;
  const a = prive.actif;
  if (nom) nom.textContent = a ? a.name : '—';
  if (champ) { champ.disabled = !a; champ.placeholder = a ? 'Message à ' + a.name + '…' : 'Choisissez un membre…'; }
  if (!a) {
    zone.innerHTML = '<div style="color:var(--mut);font-size:13px;padding:4px 0">Cliquez sur la photo d\'un membre (à droite) pour lui écrire en privé.</div>';
    return;
  }
  zone.innerHTML = a.messages.length
    ? a.messages.map(m => m.me
        ? `<div class="b me">${esc(m.text)}</div><div class="t me">${m.time}</div>`
        : `<div style="display:flex;gap:10px;align-items:flex-start"><div class="av" style="--c:${a.color}">${esc((a.name[0] || '?').toUpperCase())}</div><div class="b">${esc(m.text)}</div></div><div class="t" style="margin-left:46px">${m.time}</div>`
      ).join('')
    : '<div style="color:var(--mut);font-size:13px;padding:4px 0">Aucun message pour le moment : écrivez le premier.</div>';
  zone.scrollTop = 1e5;
}

// Nombre de messages non lus, membre par membre (pour les pastilles)
let chargementNonLus = null;
function chargerNonLusPrives() {
  clearTimeout(chargementNonLus);
  chargementNonLus = setTimeout(async () => {
    try {
      const d = await apiCall('/messages/conversations');
      const n = {};
      (d.conversations || []).forEach(c => { if (c.otherUser && c.unreadCount) n[c.otherUser.id] = c.unreadCount; });
      if (prive.actif) delete n[prive.actif.userId];   // celle qui est ouverte est lue
      prive.nonLus = n;
      drawList();
    } catch (e) {}
  }, 250);
}

async function ouvrirPrive(userId, name, color) {
  if (!user || String(userId) === String(user.id)) { toast('Choisissez un autre membre'); return; }
  try {
    const st = await apiCall('/messages/start', { method: 'POST', body: JSON.stringify({ userId: Number(userId) }) });
    const convId = st.conversation.id;
    const rep = await apiCall('/messages/' + convId);   // l'historique, et la conversation est marquée comme lue
    prive.actif = { userId: Number(userId), name, color: color || '#8b93a3', convId, messages: (rep.messages || []).map(lignePrivee) };
    delete prive.nonLus[userId];
    dessinerPrive(); drawList();
    const champ = $('#pi'); if (champ) champ.focus();
    if (socket && socket.connected) socket.emit('dm:read', { conversationId: convId });
  } catch (e) {
    toast(e.message || 'Messagerie privée indisponible');
  }
}

function fermerPrive() { prive.actif = null; dessinerPrive(); drawList(); }

async function envoyerPrive(e) {
  e.preventDefault();
  const a = prive.actif, champ = $('#pi');
  const texte = ((champ && champ.value) || '').trim();
  if (!a) { toast('Choisissez d\'abord un membre à droite'); return; }
  if (!texte) return;
  champ.value = '';
  try {
    if (socket && socket.connected) {
      socket.emit('dm:send', { conversationId: a.convId, content: texte });   // la réponse arrive par « dm:message »
    } else {
      const rep = await apiCall('/messages/' + a.convId, { method: 'POST', body: JSON.stringify({ content: texte }) });
      if (prive.actif === a && rep.message && !a.messages.some(m => m.id === rep.message.id)) { a.messages.push(lignePrivee(rep.message)); dessinerPrive(); }
    }
  } catch (err) {
    champ.value = texte;
    toast(err.message || 'Message non envoyé');
  }
}

// Un message privé arrive (ou part) : conversation ouverte -> on l'affiche ; sinon pastille sur le logo de la personne
function traiterMessagePrive(data) {
  if (!data || !data.message || !user) return;
  const m = data.message, a = prive.actif, moi = m.sender_id === user.id;
  if (a && a.convId === data.conversationId) {
    if (!a.messages.some(x => x.id === m.id)) a.messages.push(lignePrivee(m));
    dessinerPrive();
    if (!moi && socket && socket.connected) socket.emit('dm:read', { conversationId: data.conversationId });
  } else if (!moi) {
    prive.nonLus[m.sender_id] = (Number(prive.nonLus[m.sender_id]) || 0) + 1;
    drawList();
    toast('💬 Message privé de ' + (m.sender_username || 'un membre'));
  }
}

/* Tout ce qui suit branche les éléments de la page. Si une ancienne version de
   room.html n'a pas un de ces éléments, on l'ignore au lieu de bloquer l'affichage. */
try {
dessinerPrive();
$('#pf').onsubmit = envoyerPrive;
$('#px').onclick = fermerPrive;

/* ---------- menu d'un membre ---------- */
const menu = $('#menu');
$('#list').onclick = e => {
  const pastille = e.target.closest('.av[data-uid]');
  if (pastille) { ouvrirPrive(pastille.dataset.uid, pastille.dataset.n, pastille.dataset.c); return; }
  const d = e.target.closest('.dots');
  if (!d) return;
  const r = d.getBoundingClientRect(), p = menu.parentElement.getBoundingClientRect();
  target = d.dataset.n;
  targetId = d.dataset.id;
  menu.dataset.stream = d.dataset.s || '';
  $('#mn').textContent = target;
  $('#mav').textContent = (target[0] || '?').toUpperCase();
  $('#mav').style.background = d.dataset.c;
  menu.style.top = Math.min(r.top - p.top + 10, p.height - menu.offsetHeight - 10) + 'px';
  menu.hidden = false;
  e.stopPropagation();
};
document.addEventListener('click', e => { if (!menu.contains(e.target)) menu.hidden = true; });
menu.onclick = e => {
  const b = e.target.closest('button');
  if (!b) return;
  menu.hidden = true;
  const a = b.dataset.a;
  if (a === 'pm') { ouvrirPrive(targetId, target, $('#mav').style.background || '#8b93a3'); return; }
  if (a === 'Caméra affichée') {
    const tile = menu.dataset.stream ? document.getElementById('tile-' + menu.dataset.stream) : null;
    if (tile) { tile.scrollIntoView({ block: 'center' }); tile.style.outline = '2px solid var(--yel)'; setTimeout(() => tile.style.outline = '', 1600); }
    else toast(target + ' ne diffuse pas de caméra');
    return;
  }
  if (a === 'Membre bloqué') { toast('Blocage : bientôt disponible'); return; }
  if (a === 'Signalement envoyé') { toast('Signalement : à faire depuis la page Modération'); return; }
  toast(a + ' · ' + target);
};

/* Thème clair / sombre : réglé sur l'accueil, appliqué à toute la page par theme.js */

/* ---------- barre du bas ---------- */
$('#bc').onclick = () => { location.href = 'live.html'; };
$('#bp').onclick = ouvrirLivePrive;
$('#bm').onclick = () => toast('Le micro se règle pendant la diffusion (En direct)');
$('#bq').onclick = () => { location.href = 'salons.html'; };
} catch (errInteraction) {
  console.error('Salon : un élément de la page est absent —', errInteraction);
}

/* ---------- 🔒 live privé : inviter un ou plusieurs membres, puis passer sur la page Live ---------- */
function ouvrirLivePrive() {
  if (typeof LivePrive === 'undefined') { toast('Live privé indisponible'); return; }
  const membres = users.filter(u => user && u.id !== user.id).map(u => ({ id: u.id, username: u.username }));
  if (!membres.length) { toast('Aucun autre membre n\'est connecté pour le moment'); return; }
  LivePrive.ouvrir({
    membres, titre: '🔒 Live privé', bouton: 'Passer en live privé',
    onConfirm: (ids, noms) => {
      try { sessionStorage.setItem('evc-live-prive', JSON.stringify({ invited: ids, names: noms, salon })); } catch (e) {}
      location.href = 'live.html?prive=1';
    }
  });
}

// Une invitation à un live privé arrive : bannière « Regarder »
function invitationLivePrive(d) {
  if (!d || typeof LivePrive === 'undefined') return;
  LivePrive.banniere({
    de: d.broadcasterUsername,
    onRegarder: () => {
      const tuile = document.getElementById('tile-' + d.streamId);
      if (tuile) {   // même salon : la caméra est déjà dans la grille
        tuile.scrollIntoView({ block: 'center' });
        tuile.style.outline = '2px solid var(--yel)'; setTimeout(() => tuile.style.outline = '', 2000);
      } else {
        location.href = 'live.html?join=' + encodeURIComponent(d.streamId) + '&from=' + encodeURIComponent(d.broadcasterUsername || '');
      }
    }
  });
}

/* ---------- 🔔 cloche : nombre de messages non lus ----------
   La cloche est le seul indicateur : le nombre s'affiche dessus, elle se balance tant qu'il
   en reste, sonne et joue un carillon à l'arrivée d'un message. Un clic ouvre la messagerie. */
let majCloche = () => {};
let rafraichirCloche = () => {};
(function cloche() {
  const btn = document.querySelector('header .bell');
  if (!btn) return;
  let badge = btn.querySelector('.n');
  if (!badge) { badge = document.createElement('span'); badge.className = 'n'; btn.appendChild(badge); }
  let dernier = null, ctxSon = null;

  function carillon() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctxSon = ctxSon || new AC();
      if (ctxSon.state === 'suspended') ctxSon.resume();
      const t0 = ctxSon.currentTime;
      [[988, 0], [1319, 0.13]].forEach(p => {
        const o = ctxSon.createOscillator(), g = ctxSon.createGain(), t = t0 + p[1];
        o.type = 'sine'; o.frequency.value = p[0];
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
        o.connect(g); g.connect(ctxSon.destination); o.start(t); o.stop(t + 1.2);
      });
    } catch (e) {}
  }

  majCloche = function(count) {
    count = Number(count) || 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.style.display = count > 0 ? 'block' : 'none';
    btn.classList.toggle('has', count > 0);
    btn.title = count > 0 ? count + ' message' + (count > 1 ? 's' : '') + ' non lu' + (count > 1 ? 's' : '') : 'Aucun nouveau message';
    if (dernier !== null && count > dernier) {
      btn.classList.remove('sonne'); void btn.offsetWidth; btn.classList.add('sonne');
      setTimeout(() => btn.classList.remove('sonne'), 1000);
      carillon();
    }
    dernier = count;
  };

  rafraichirCloche = async function() {
    try { const d = await apiCall('/messages/unread-count'); majCloche(d && d.count); } catch (e) {}
  };

  btn.onclick = () => { location.href = 'messages.html'; };
  rafraichirCloche();
  setInterval(rafraichirCloche, 30000);
})();

/* ---------- enregistrement de l'entrée (compteur de membres réel) ---------- */
function recordJoin(slug) {
  try {
    const base = (typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api');
    if (typeof isLoggedIn === 'function' && !isLoggedIn()) return;
    fetch(base + '/salons/' + encodeURIComponent(slug) + '/join', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }).catch(() => {});
  } catch (e) {}
}

/* ---------- socket ---------- */
function joinSalon() {
  users = []; streams = []; pub.length = 0;
  Object.keys(peers).forEach(id => { try { peers[id].close(); } catch (e) {} delete peers[id]; });
  drawRooms(); drawList(); drawCams(); drawPub();
  recordJoin(SLUGS[cur]);
  try { if (window.history && history.replaceState) history.replaceState(null, '', '?theme=' + SLUGS[cur]); } catch (e) {}
  if (socket) socket.emit('salon:join', salon);
}

function row(m) {
  const isMe = user && m.user_id === user.id;
  const name = m.username || 'Anonyme';
  return { name, color: isMe ? '#ffd60a' : colOf(m.role), text: m.text, time: hm(m.created_at), me: isMe };
}

function initSocket() {
  if (typeof io === 'undefined') {
    // socket.io n'a pas pu être chargé (réseau, bloqueur) : la page reste utilisable
    toast('Connexion au salon indisponible');
    return;
  }
  socket = io('https://api.e-visiocam.com', { withCredentials: true });

  socket.on('connect', () => {
    socket.emit('salon:join', salon);
    socket.emit('salon:request-streams');
    chargerNonLusPrives();
  });

  socket.on('connect_error', err => { toast('Serveur : ' + err.message); });

  // 🔔 Messages privés : le serveur envoie le nombre de non lus à chaque connexion du membre
  socket.on('dm:unread-count', data => { majCloche(data && data.count); chargerNonLusPrives(); });
  socket.on('dm:message', data => { traiterMessagePrive(data); setTimeout(rafraichirCloche, 500); });
  socket.on('live:private-invite', invitationLivePrive);

  socket.on('salon:error', data => toast(data.message || 'Accès au salon refusé'));
  socket.on('salon:joined', data => {
    if (data && data.salon) { salon = data.salon; drawRooms(); }
  });

  socket.on('chat:history', messages => {
    pub.length = 0;
    (messages || []).forEach(m => pub.push(row(m)));
    drawPub();
  });

  socket.on('chat:message', msg => { pub.push(row(msg)); drawPub(); });

  socket.on('system', data => { pub.push({ sys: true, text: data.text }); drawPub(); });

  socket.on('users:list', list => {
    users = list || [];
    drawRooms(); drawList();
  });

  socket.on('salon:streams-list', data => {
    streams = (data && data.streams) || [];
    drawCams();
  });

  socket.on('salon:stream-started', () => socket.emit('salon:request-streams'));
  socket.on('salon:stream-stopped', data => {
    if (data && peers[data.streamId]) { try { peers[data.streamId].close(); } catch (e) {} delete peers[data.streamId]; }
    socket.emit('salon:request-streams');
  });
  socket.on('salon:stream-updated', () => socket.emit('salon:request-streams'));

  socket.on('webrtc:answer', async data => {
    const pc = peers[data.streamId];
    if (pc && pc.setRemoteDescription) { try { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } catch (e) {} }
  });
  socket.on('webrtc:ice-candidate', async data => {
    for (const pc of Object.values(peers)) {
      if (pc && pc.addIceCandidate && data.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {} }
    }
  });
}

/* ---------- départ ---------- */
(async function demarrer() {
  await chargerSalons();                 // liste réelle : noms, icônes, salons VIP
  try {
    drawRooms(); drawList(); drawCams(); drawPub();
  } catch (errAffichage) {
    console.error('Salon : affichage partiel —', errAffichage);
  }
  afficherLaPage();

  // Salon privé demandé : cadenas + demande d'accès si l'accès n'est pas accordé
  if (PRIVATES.includes(SLUGS[cur]) && typeof SalonAccess !== 'undefined') {
    const slugDemande = SLUGS[cur];
    try {
      const st = await SalonAccess.status(slugDemande);
      if (st !== 'approved') {
        const general = SLUGS.indexOf('general');
        cur = general >= 0 ? general : 0;
        salon = NAMES[SLUGS[cur]];
        drawRooms(); drawList(); drawCams(); drawPub();
        try { if (window.history && history.replaceState) history.replaceState(null, '', '?theme=' + SLUGS[cur]); } catch (e) {}
        panneauPrive(slugDemande, st);
      }
    } catch (errPrive) {
      console.error('Salon privé :', errPrive);
    }
  }

  recordJoin(SLUGS[cur]);
  try { initSocket(); } catch (errSocket) { console.error('Salon : connexion —', errSocket); }
})();
window.addEventListener('beforeunload', () => { if (socket) socket.disconnect(); });
