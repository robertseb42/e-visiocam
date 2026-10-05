// Modération : filtre des mots interdits, kick / ban / mute avec durée, levée automatique.
// Lance le VRAI serveur sur une base temporaire.
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
     'chat:message', 'salon:error', 'moderation:sanction', 'disconnect', 'dm:error'].forEach(ecoute);
    await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
    sockets.push(s);
    return { nom, s, recu, dernier: e => (recu[e] || [])[(recu[e] || []).length - 1],
             liste: () => { const d = (recu['salon:streams-list'] || []).slice(-1)[0]; return d ? d.streams.map(x => x.streamId) : []; } };
}

before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-sanctions-'));
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


const Database = require('better-sqlite3');
const connexion = async (nom, mdp) => { const r = await api('/api/auth/login', 'POST', { username: nom, password: mdp || 'MotDePasse123!' }); return r; };

test('Mots interdits, kick, ban et mute avec durée', async () => {
    const compte = async (nom, mail) => { const r = await api('/api/auth/register', 'POST', { username: nom, email: mail, password: 'MotDePasse123!' }); assert.equal(r.status, 201, nom); return { id: r.json.user.id, jeton: r.json.token }; };
    const admin = (await connexion('SuperBoss', adminPassword)).json.token;
    const M = await compte('Modo', 'm@test.fr'), A = await compte('Alice', 'a@test.fr'), B = await compte('Bob', 'b@test.fr');
    assert.equal((await api('/api/admin/users/' + M.id + '/role', 'POST', { role: 'moderator' }, admin)).status, 200);
    const modo = (await connexion('Modo')).json.token;

    // ---------- Filtre des mots interdits ----------
    await api('/api/mod/banned-words', 'POST', { word: 'patate', severity: 2 }, admin);
    let a = await membre('Alice', A.jeton), b = await membre('Bob', B.jeton);
    a.s.emit('salon:join', 'general'); b.s.emit('salon:join', 'general'); await sleep(400);
    a.s.emit('chat:message', { text: 'quelle P4TAAATE celui-là' }); await sleep(300);
    assert.match(b.dernier('chat:message').text, /^quelle ★+ celui-là$/);              // gravité 2 : masqué
    a.s.emit('chat:message', { text: 'espèce de f.d.p' }); await sleep(300);
    assert.match(a.dernier('salon:error').message, /bloqué/);                          // gravité 3 : bloqué
    assert.ok(!(b.recu['chat:message'] || []).some(m => /f\.d\.p/.test(m.text)));
    a.s.emit('chat:message', { text: 'Une armée de fans, il a du charme' }); await sleep(300);
    assert.equal(b.dernier('chat:message').text, 'Une armée de fans, il a du charme'); // pas de faux positif
    a.s.emit('chat:message', { text: 'tu vends de la cocaïne ?' }); await sleep(300);
    assert.match(a.dernier('salon:error').message, /10 minutes/);                      // gravité 5 : bloqué + muet
    a.s.emit('chat:message', { text: 'bonjour' }); await sleep(300);
    assert.match(a.dernier('salon:error').message, /ne pouvez pas écrire/);
    const flag = await api('/api/mod/flagged-messages', 'GET', null, modo);
    assert.ok(flag.json.messages.length >= 2);
    assert.equal((await api('/api/mod/users/' + A.id + '/lift', 'POST', { type: 'mute' }, modo)).status, 200);
    await sleep(5000);   // anti-spam : 5 messages max en 5 s
    a.s.emit('chat:message', { text: 'me revoilà' }); await sleep(300);
    assert.equal(b.dernier('chat:message').text, 'me revoilà');

    // ---------- Kick 1 h : déconnecté, ne peut pas revenir ----------
    let r = await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'kick', minutes: 60, reason: 'spam' }, modo);
    assert.equal(r.status, 200, JSON.stringify(r.json));
    await sleep(700);
    assert.equal(b.dernier('moderation:sanction').type, 'kick');
    assert.ok(!b.s.connected, 'Bob est déconnecté');
    r = await connexion('Bob');
    assert.equal(r.status, 403); assert.match(r.json.error, /exclu du site jusqu/);
    assert.equal((await api('/api/credits/balance', 'GET', null, B.jeton)).status, 403);   // ancienne session bloquée
    await api('/api/mod/users/' + B.id + '/lift', 'POST', { type: 'kick' }, modo);
    assert.equal((await connexion('Bob')).status, 200);

    // ---------- Kick simple (0) : déconnecté mais peut revenir ----------
    b = await membre('Bob', B.jeton);
    await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'kick', minutes: 0 }, modo);
    await sleep(700);
    assert.ok(!b.s.connected);
    b = await membre('Bob', B.jeton);                    // reconnexion acceptée
    assert.ok(b.s.connected);

    // ---------- Ban : limites du modérateur ----------
    assert.equal((await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'ban', minutes: null }, modo)).status, 403);
    assert.equal((await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'ban', minutes: 60 * 24 * 31 }, modo)).status, 403);
    r = await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'ban', minutes: 1440 * 3, reason: 'insultes' }, modo);
    assert.equal(r.status, 200);
    await sleep(700);
    assert.ok(!b.s.connected);
    r = await connexion('Bob');
    assert.equal(r.status, 403); assert.match(r.json.error, /suspendu jusqu.*Motif : insultes/);
    assert.equal((await api('/api/mod/users/' + B.id + '/lift', 'POST', { type: 'ban' }, modo)).status, 403);   // débannir : Super Admin

    // Fin du bannissement temporaire : levée automatique à la connexion suivante
    const base = new Database(path.join(dir, 'test.sqlite'));
    base.prepare("UPDATE users SET banned_until = ? WHERE id = ?").run(new Date(Date.now() - 1000).toISOString(), B.id);
    base.close();
    assert.equal((await connexion('Bob')).status, 200);

    // ---------- Ban définitif par le Super Admin ----------
    r = await api('/api/mod/users/' + B.id + '/sanction', 'POST', { type: 'ban', minutes: null }, admin);
    assert.equal(r.status, 200);
    r = await connexion('Bob');
    assert.match(r.json.error, /banni définitivement/);
    const hist = await api('/api/mod/users/' + B.id + '/sanctions', 'GET', null, admin);
    assert.ok(hist.json.historique.length >= 4);
    assert.equal((await api('/api/mod/users/' + B.id + '/lift', 'POST', { type: 'ban' }, admin)).status, 200);
    assert.equal((await connexion('Bob')).status, 200);

    // Un modérateur ne sanctionne pas le Super Admin ni un autre modérateur
    const sa = (await api('/api/mod/users', 'GET', null, admin)).json.users.find(u => u.username === 'SuperBoss');
    assert.equal((await api('/api/mod/users/' + sa.id + '/sanction', 'POST', { type: 'kick', minutes: 0 }, modo)).status, 403);
});
