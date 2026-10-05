// Live privé sur invitation : essai de bout en bout.
// Lance le VRAI serveur sur une base temporaire, connecte six comptes en temps réel et vérifie
// que seuls le diffuseur, ses invités et la modération voient et peuvent rejoindre le live.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const adminPassword = require('node:crypto').randomBytes(24).toString('base64') + 'A1';
const net = require('node:net');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');
const { io } = require('socket.io-client');

let srv, BASE, dir;
const sockets = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const libre = () => new Promise(res => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });

async function api(chemin, methode = 'GET', corps, jeton) {
    const r = await fetch(BASE + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    // Le jeton de connexion arrive désormais dans le cookie de session HttpOnly
    const m = /evc_session=([^;]+)/.exec(r.headers.get('set-cookie') || '');
    if (m && j && !j.token) j.token = decodeURIComponent(m[1]);
    return { status: r.status, json: j };
}

// Un membre connecté en temps réel, qui garde en mémoire tout ce qu'il reçoit
async function membre(nom, jeton) {
    const s = io(BASE, { auth: { token: jeton }, transports: ['websocket'], reconnection: false });
    const recu = {};
    const ecoute = e => s.on(e, d => { (recu[e] = recu[e] || []).push(d); });
    ['live:private-invite', 'live:invited', 'live:started', 'live:stopped', 'live:error', 'live:viewer-count', 'live:joined',
     'salon:stream-started', 'salon:stream-stopped', 'salon:streams-list', 'webrtc:offer', 'users:list'].forEach(ecoute);
    await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
    sockets.push(s);
    return { nom, s, recu, dernier: e => (recu[e] || [])[(recu[e] || []).length - 1],
             liste: () => { const d = (recu['salon:streams-list'] || []).slice(-1)[0]; return d ? d.streams.map(x => x.streamId) : []; } };
}

before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-live-'));
    const port = await libre();
    BASE = 'http://127.0.0.1:' + port;
    const setup = spawnSync(process.execPath, ['scripts/create-admin.cjs'], {
        cwd: path.join(__dirname, '..'), encoding: 'utf8',
        env: { ...process.env, DB_PATH: path.join(dir, 'test.sqlite'), JWT_SECRET: 'test-secret-test-secret-test-secret-1234567890',
            ADMIN_USERNAME: 'SuperBoss', ADMIN_EMAIL: 'admin@example.invalid', ADMIN_PASSWORD: adminPassword }
    });
    assert.equal(setup.status, 0, setup.stderr);
    srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, EMAIL_VERIFICATION: '0', PORT: String(port), NODE_ENV: 'development', DB_PATH: path.join(dir, 'test.sqlite'), JWT_SECRET: 'test-secret-test-secret-test-secret-1234567890' } });
    for (let i = 0; i < 80; i++) { try { if ((await fetch(BASE + '/api/health')).ok) return; } catch (e) {} await sleep(250); }
    throw new Error('le serveur de test ne démarre pas');
});
after(() => { sockets.forEach(s => s.close()); if (srv) srv.kill(); try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) {} });

test('Live privé : seuls le diffuseur, les invités et la modération le voient et le rejoignent', async () => {
    const compte = async (nom, mail) => { const r = await api('/api/auth/register', 'POST', { username: nom, email: mail, password: 'MotDePasse123!' }); assert.equal(r.status, 201, nom); return { id: r.json.user.id, jeton: r.json.token }; };
    const A = await compte('Diffuseur', 'a@test.fr'), B = await compte('Invite', 'b@test.fr'), C = await compte('Curieux', 'c@test.fr'),
          D = await compte('PlusTard', 'd@test.fr'), E = await compte('Hors-ligne', 'e@test.fr');
    const staff = (await api('/api/auth/login', 'POST', { username: 'SuperBoss', password: adminPassword })).json;
    const ma = await membre('A', A.jeton), mb = await membre('B', B.jeton), mc = await membre('C', C.jeton), md = await membre('D', D.jeton), ms = await membre('staff', staff.token);
    await sleep(300);

    // ---- A démarre un live PRIVÉ : B invité (doublon, soi-même et compte inconnu ignorés) ----
    ma.s.emit('live:start', { streamId: 'live-A', salon: 'Salon Général', private: true, invited: [B.id, B.id, A.id, 99999, 'abc'] });
    await sleep(400);

    assert.equal(mb.dernier('live:private-invite').streamId, 'live-A', 'B reçoit son invitation');
    assert.equal(mb.dernier('live:private-invite').broadcasterUsername, 'Diffuseur');
    assert.deepEqual(ma.dernier('live:invited').invited.map(i => i.username), ['Invite'], 'seul B est invité (doublon, soi-même, inconnu ignorés)');
    assert.ok(mb.liste().includes('live-A'), 'la caméra apparaît dans la liste de B');
    assert.equal(mb.recu['salon:streams-list'].slice(-1)[0].streams[0].isPrivate, true);
    assert.ok(ms.liste().includes('live-A'), 'la modération la voit aussi');
    assert.ok(!mc.liste().includes('live-A'), 'C ne la voit pas dans sa liste');
    assert.ok(!md.liste().includes('live-A'), 'D non plus (pas encore invité)');
    for (const x of [mc, md]) {
        assert.equal(x.recu['live:started'], undefined, x.nom + ' : aucune annonce de live');
        assert.equal(x.recu['salon:stream-started'], undefined, x.nom + ' : aucune annonce dans le salon');
        assert.equal(x.recu['live:private-invite'], undefined, x.nom + ' : aucune invitation');
    }
    assert.ok(mb.dernier('live:started').isPrivate && ms.dernier('live:started').isPrivate, 'B et la modération reçoivent l\'annonce');
    const listeA = ma.dernier('users:list').find(u => u.id === A.id);
    assert.equal(listeA.streamId, null, 'la liste des membres ne révèle pas le live privé');
    assert.equal(mc.dernier('users:list').find(u => u.id === A.id).isCameraOn, false);

    // ---- annuaire HTTP ----
    const ids = async jeton => (await api('/api/streams', 'GET', undefined, jeton)).json.streams.map(s => s.streamId);
    assert.ok(!(await ids()).includes('live-A'), 'visiteur anonyme : rien');
    assert.ok(!(await ids(C.jeton)).includes('live-A'), 'C : rien');
    assert.ok((await ids(B.jeton)).includes('live-A'), 'B : le voit');
    assert.ok((await ids(A.jeton)).includes('live-A'), 'le diffuseur : le voit');
    assert.ok((await ids(staff.token)).includes('live-A'), 'modération : le voit');
    assert.equal((await api('/api/streams', 'GET', undefined, B.jeton)).json.streams.find(s => s.streamId === 'live-A').isPrivate, true);

    // ---- rejoindre / vidéo directe ----
    mc.s.emit('live:join', { streamId: 'live-A' });
    mc.s.emit('webrtc:offer', { streamId: 'live-A', offer: { type: 'offer', sdp: 'x' } });
    await sleep(300);
    assert.match(mc.dernier('live:error').message, /privé/, 'C ne peut pas rejoindre');
    assert.equal(ma.recu['webrtc:offer'], undefined, 'son offre vidéo n\'arrive jamais au diffuseur');
    mb.s.emit('live:join', { streamId: 'live-A' });
    mb.s.emit('webrtc:offer', { streamId: 'live-A', offer: { type: 'offer', sdp: 'y' } });
    await sleep(300);
    assert.equal(mb.dernier('live:joined').streamId, 'live-A', 'B rejoint');
    assert.equal(ma.dernier('webrtc:offer').viewerId, B.id, 'l\'offre vidéo de B arrive au diffuseur');
    assert.equal((await api('/api/streams', 'GET', undefined, B.jeton)).json.streams.find(x => x.streamId === 'live-A').viewers, 1, 'un seul spectateur compté (C n\'a pas été ajouté)');

    // ---- inviter d'autres membres en cours de live ----
    mc.s.emit('live:invite', { streamId: 'live-A', invited: [C.id, D.id] });   // C n'est pas le diffuseur
    await sleep(250);
    assert.equal(md.recu['live:private-invite'], undefined, 'seul le diffuseur peut inviter');
    ma.s.emit('live:invite', { streamId: 'live-A', invited: [D.id, B.id] });
    await sleep(350);
    assert.equal(md.dernier('live:private-invite').streamId, 'live-A', 'D reçoit son invitation');
    assert.equal(mb.recu['live:private-invite'].length, 1, 'B (déjà invité) n\'est pas réinvité');
    assert.deepEqual(ma.dernier('live:invited').invited.map(i => i.username).sort(), ['Invite', 'PlusTard']);
    assert.ok(md.liste().includes('live-A'), 'la caméra apparaît maintenant chez D');
    assert.ok(!mc.liste().includes('live-A'), 'et toujours pas chez C');

    // ---- personne d'autre que le diffuseur ne peut l'arrêter ni régler sa caméra ----
    for (const x of [mc, mb]) { x.s.emit('live:stop', { streamId: 'live-A' }); x.s.emit('live:camera-toggle', { streamId: 'live-A' }); x.s.emit('live:mic-toggle', { streamId: 'live-A' }); }
    await sleep(300);
    assert.ok((await ids(B.jeton)).includes('live-A'), 'le live tourne toujours');
    assert.equal(ma.recu['live:camera-toggled'], undefined);
    // ---- on ne peut pas reprendre l'identifiant d'un autre ----
    mb.s.emit('live:start', { streamId: 'live-A', salon: 'Salon Général' });
    await sleep(250);
    assert.match(mb.dernier('live:error').message, /déjà utilisé/);
    assert.equal((await api('/api/streams', 'GET', undefined, B.jeton)).json.streams.find(s => s.streamId === 'live-A').broadcasterId, A.id, 'le live de A n\'a pas été remplacé');

    // ---- fin du live : annoncée seulement à ceux qui le voyaient ----
    ma.s.emit('live:stop', { streamId: 'live-A' });
    await sleep(400);
    assert.equal(mb.dernier('live:stopped').streamId, 'live-A');
    assert.equal(ms.dernier('live:stopped').streamId, 'live-A');
    assert.equal(mc.recu['live:stopped'], undefined, 'C n\'apprend même pas qu\'il y avait un live');
    assert.ok(!(await ids(B.jeton)).includes('live-A'));

    // ---- un invité hors ligne retrouve son invitation en se connectant ----
    ma.s.emit('live:start', { streamId: 'live-A2', salon: 'Salon Général', private: true, invited: [E.id] });
    await sleep(300);
    const me = await membre('E', E.jeton);
    await sleep(300);
    assert.equal(me.dernier('live:private-invite').streamId, 'live-A2', 'invitation rendue à la connexion');
    assert.ok(me.liste().includes('live-A2') || (await ids(E.jeton)).includes('live-A2'));
    ma.s.emit('live:stop', { streamId: 'live-A2' });
    await sleep(200);

    // ---- un live PUBLIC reste ouvert à tous, comme avant ----
    ma.s.emit('live:start', { streamId: 'live-pub', salon: 'Salon Général' });
    await sleep(350);
    assert.ok(mc.liste().includes('live-pub') && md.liste().includes('live-pub'), 'tout le salon le voit');
    assert.ok((await ids()).includes('live-pub'), 'visible sans compte');
    assert.equal(mc.dernier('live:started').isPrivate, false);
    const tard = await membre('C-bis', C.jeton);   // un membre qui arrive pendant le live public
    await sleep(250);
    assert.equal(tard.dernier('users:list').find(u => u.id === A.id).streamId, 'live-pub', 'le membre en live public apparaît avec sa caméra');
    mc.s.emit('live:join', { streamId: 'live-pub' });
    await sleep(250);
    assert.equal(mc.dernier('live:joined').streamId, 'live-pub');
    mc.s.emit('live:invite', { streamId: 'live-pub', invited: [D.id] });
    ma.s.emit('live:invite', { streamId: 'live-pub', invited: [D.id] });
    await sleep(250);
    assert.match(ma.dernier('live:error').message, /public/, 'on n\'invite pas à un live déjà public');
});
