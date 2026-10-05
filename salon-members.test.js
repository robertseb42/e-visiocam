// Salon : liste « Dans ce salon » et messages privés sans écrire dans le salon.
// Lance le VRAI serveur sur une base temporaire et connecte trois comptes en temps réel.
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
     'salon:stream-started', 'salon:stream-stopped', 'salon:streams-list', 'webrtc:offer', 'users:list',
     'salon:members', 'salon:joined', 'chat:message', 'dm:message', 'dm:typing'].forEach(ecoute);
    await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
    sockets.push(s);
    return { nom, s, recu, dernier: e => (recu[e] || [])[(recu[e] || []).length - 1],
             liste: () => { const d = (recu['salon:streams-list'] || []).slice(-1)[0]; return d ? d.streams.map(x => x.streamId) : []; } };
}

before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-membres-'));
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

test('Salon : membres du salon uniquement, et message privé invisible dans le salon', async () => {
    const compte = async (nom, mail) => { const r = await api('/api/auth/register', 'POST', { username: nom, email: mail, password: 'MotDePasse123!' }); assert.equal(r.status, 201, nom); return { id: r.json.user.id, jeton: r.json.token }; };
    const A = await compte('Alice', 'a@test.fr'), B = await compte('Bruno', 'b@test.fr'), C = await compte('Chloe', 'c@test.fr');
    const a = await membre('Alice', A.jeton), b = await membre('Bruno', B.jeton), c = await membre('Chloe', C.jeton);
    // Connexion « cloche » (sans salon choisi) : ne doit pas compter dans les membres
    await membre('Alice-cloche', A.jeton);

    a.s.emit('salon:join', 'musique'); b.s.emit('salon:join', 'musique'); c.s.emit('salon:join', 'francais');
    await sleep(600);
    assert.equal(a.dernier('salon:joined').slug, 'musique');
    const noms = d => d.users.map(u => u.username).sort();
    assert.deepEqual(noms(a.dernier('salon:members')), ['Alice', 'Bruno']);
    assert.deepEqual(noms(c.dernier('salon:members')), ['Chloe']);

    // Message privé d'Alice à Bruno : Bruno le reçoit, le salon non
    const conv = await api('/api/messages/start', 'POST', { userId: B.id }, A.jeton);
    assert.equal(conv.status, 200);
    a.s.emit('dm:send', { conversationId: conv.json.conversation.id, content: 'Rien que pour toi' });
    await sleep(500);
    assert.equal(b.dernier('dm:message').message.content, 'Rien que pour toi');
    assert.equal((c.recu['dm:message'] || []).length, 0);
    assert.ok(![a, b, c].some(m => (m.recu['chat:message'] || []).some(x => x.text === 'Rien que pour toi')));

    // Chloé ne peut pas espionner la frappe d'une conversation qui n'est pas la sienne
    c.s.emit('dm:typing', { conversationId: conv.json.conversation.id });
    await sleep(300);
    assert.equal((b.recu['dm:typing'] || []).length, 0);

    // Bruno change de salon : il disparaît de la liste de Musique
    b.s.emit('salon:join', 'francais');
    await sleep(500);
    assert.deepEqual(noms(a.dernier('salon:members')), ['Alice']);
    assert.deepEqual(noms(c.dernier('salon:members')), ['Bruno', 'Chloe']);

    // Déconnexion : retiré de la liste
    c.s.close();
    await sleep(500);
    assert.deepEqual(noms(b.dernier('salon:members')), ['Bruno']);
});
