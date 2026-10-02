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
  SALONS = liste.map(s => [s.slug, s.name, s.icon || '💬']);
  PRIVATES = liste.filter(s => s.isPrivate).map(s => s.slug);
  SLUGS = SALONS.map(s => s[0]);
  NAMES = {};
  SALONS.forEach(s => NAMES[s[0]] = s[1]);
  const i = SLUGS.indexOf(demande);
  cur = i >= 0 ? i : 0;
  salon = NAMES[SLUGS[cur]];
}
let socket = null, user = null, users = [], streams = [], peers = {}, onlyCam = false, target = '';
const pub = [];   // messages affichés dans la discussion publique

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
  if (av) av.textContent = user.username[0].toUpperCase();
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
    `<button class="room ${i === cur ? 'act' : ''}" data-i="${i}"><b class="ic">${s[2]}</b>${s[1]}${PRIVATES.includes(s[0]) ? ' 🔒' : ''}</button>`
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
        const n = u.username || '?', c = colOf(u.role);
        return `<div class="m"><div class="av on" style="--c:${c}">${esc(n[0].toUpperCase())}</div><span>${ROLE_ICONS[u.role] || ''} ${esc(n)}</span>` +
          (u.streamId ? camIco : '<span class="cm"></span>') +
          `<button class="dots" data-n="${esc(n)}" data-c="${c}" data-s="${esc(u.streamId || '')}" aria-label="Options ${esc(n)}">` +
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
    `<div class="n${s.isMicMuted ? ' mute' : ''}" style="left:auto;right:8px">${esc(s.broadcasterUsername || '')}` +
    (user && s.broadcasterId === user.id ? ' (moi)' : '') +
    (s.isMicMuted ? ' <span style="color:var(--pink)">micro coupé</span>' : '') + '</div></div>'
  ).join('');

  streams.forEach(s => {
    if (user && s.broadcasterId === user.id) return;
    if (!peers[s.streamId]) viewStream(s.streamId);
  });
}

function viewStream(streamId) {
  try {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
      ]
    });
    peers[streamId] = pc;
    pc.ontrack = ev => { const v = document.getElementById('cam-' + streamId); if (v) { v.srcObject = ev.streams[0]; v.play().catch(() => {}); } };
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

/* ---------- conversation privée (renvoi vers la page Messages) ---------- */
/* Tout ce qui suit branche les éléments de la page. Si une ancienne version de
   room.html n'a pas un de ces éléments, on l'ignore au lieu de bloquer l'affichage. */
try {
$('#pm').innerHTML = '<div style="color:var(--mut);font-size:13px;padding:4px 0">Les messages privés s\'ouvrent depuis la page <b>Messages</b>.</div>';
$('#pi').placeholder = 'Ouvrir la page Messages…';
$('#pf').onsubmit = e => { e.preventDefault(); location.href = 'messages.html'; };
$('#px').onclick = () => { $('#pn').textContent = '—'; toast('Panneau fermé'); };

/* ---------- menu d'un membre ---------- */
const menu = $('#menu');
$('#list').onclick = e => {
  const d = e.target.closest('.dots');
  if (!d) return;
  const r = d.getBoundingClientRect(), p = menu.parentElement.getBoundingClientRect();
  target = d.dataset.n;
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
  if (a === 'pm') { $('#pn').textContent = target; $('#pi').placeholder = 'Écrire à ' + target + ' (page Messages)…'; $('#pi').focus(); return; }
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

/* ---------- thème clair / sombre ---------- */
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('evc-theme', t); } catch (e) {}
  $('#tt').textContent = t === 'light' ? '🌙' : '☀️';
}
setTheme(document.documentElement.dataset.theme || 'dark');
$('#tt').onclick = () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');

/* ---------- barre du bas ---------- */
$('#bc').onclick = () => { location.href = 'live.html'; };
$('#bm').onclick = () => toast('Le micro se règle pendant la diffusion (En direct)');
$('#bs').onclick = () => toast('Réglages : bientôt disponibles');
$('#bq').onclick = () => { location.href = 'salons.html'; };
} catch (errInteraction) {
  console.error('Salon : un élément de la page est absent —', errInteraction);
}

/* ---------- enregistrement de l'entrée (compteur de membres réel) ---------- */
function recordJoin(slug) {
  try {
    const base = (typeof API_URL !== 'undefined' ? API_URL : 'https://e-visiocam-api.onrender.com/api');
    const tk = (typeof getToken === 'function' ? getToken() : null);
    if (!tk) return;
    fetch(base + '/salons/' + encodeURIComponent(slug) + '/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tk }
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
  socket = io('https://e-visiocam-api.onrender.com', { auth: { token: typeof getToken === 'function' ? getToken() : null } });

  socket.on('connect', () => {
    socket.emit('salon:join', salon);
    socket.emit('salon:request-streams');
  });

  socket.on('connect_error', err => { toast('Serveur : ' + err.message); });

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
    if (pc) { try { await pc.setRemoteDescription(new RTCSessionDescription(data.answer)); } catch (e) {} }
  });
  socket.on('webrtc:ice-candidate', async data => {
    for (const pc of Object.values(peers)) {
      if (pc && data.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)); } catch (e) {} }
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
