const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const express = require('express');

// Modèles, recherche, favoris et alertes de live : base isolée en mémoire.
const db = new Database(':memory:');
db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, email TEXT, role TEXT, status TEXT DEFAULT 'active', bio TEXT DEFAULT '', gender TEXT DEFAULT '', created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE salons (id INTEGER PRIMARY KEY, slug TEXT, name TEXT, icon TEXT, description TEXT, is_private INTEGER DEFAULT 0, is_hidden INTEGER DEFAULT 0);`);
db.prepare(`INSERT INTO users (id, username, email, role, created_at) VALUES
 (1,'Julie','julie@example.com','user','2026-01-01'),(2,'Luna','luna@example.com','model','2026-01-02'),
 (3,'Lucie','lucie@example.com','model','2026-03-01'),(4,'Marc','marc@example.com','user','2026-01-03'),(5,'Banni','b@example.com','model','2026-01-04')`).run();
db.prepare("UPDATE users SET status = 'banned' WHERE id = 5").run();
db.prepare(`INSERT INTO salons (slug, name, icon) VALUES ('musique','Salon Musique','🎵'),('general','Salon Général','🌍')`).run();

const getUserById = id => db.prepare('SELECT * FROM users WHERE id = ?').get(id);
require.cache[require.resolve('../database')] = { exports: { db, getUserById, isTokenRevoked: () => false, isTokenOutdated: () => false, addLog: () => {} } };
require.cache[require.resolve('../auth')] = { exports: { verifyToken: t => ({ 'julie': { id: 1 }, 'marc': { id: 4 }, 'luna': { id: 2 } })[t] || null } };
const mails = [];
require.cache[require.resolve('../mailer')] = { exports: { sendMail: async m => { mails.push(m); return { success: true }; }, emailTemplate: (t, c) => t + c } };
global.liveStreams = new Map();

const discover = require('../routes/discover');
const app = express();
app.use(express.json());
app.use('/api/models', discover.models);
app.use('/api/favorites', discover.favorites);
const server = app.listen(0, '127.0.0.1');
const ready = new Promise(r => server.on('listening', r));
async function call(path, method = 'GET', body, token) {
    await ready;
    const r = await fetch('http://127.0.0.1:' + server.address().port + path, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return { status: r.status, body: await r.json() };
}
after(() => { server.close(); db.close(); });

test('Annuaire : modèles actifs seulement, en direct d\'abord, recherche', async () => {
    let r = await call('/api/models');
    assert.deepEqual(r.body.models.map(m => m.username).sort(), ['Lucie', 'Luna']);
    global.liveStreams.set('s1', { streamId: 's1', broadcasterId: 3, broadcasterUsername: 'Lucie', salon: 'Salon Musique', isPrivate: false, viewers: [1, 2] });
    global.liveStreams.set('s2', { streamId: 's2', broadcasterId: 2, broadcasterUsername: 'Luna', salon: 'Salon Général', isPrivate: true, viewers: [] });
    r = await call('/api/models');
    assert.equal(r.body.models[0].username, 'Lucie');
    assert.equal(r.body.models[0].isLive, true);
    assert.equal(r.body.models.find(m => m.username === 'Luna').isLive, false, 'un live privé n\'est pas affiché');
    assert.deepEqual((await call('/api/models?q=lun')).body.models.map(m => m.username), ['Luna']);
    assert.deepEqual((await call('/api/models?q=%25')).body.models, [], 'les jokers SQL sont neutralisés');
    r = await call('/api/models/search?q=mus');
    assert.deepEqual(r.body.salons.map(s => s.slug), ['musique']);
    assert.deepEqual((await call('/api/models/search?q=l')).body, { models: [], salons: [] });
});

test('Favoris : ajout, compteur, réglage, contrôles, retrait', async () => {
    assert.equal((await call('/api/favorites')).status, 401);
    assert.equal((await call('/api/favorites/model/1', 'PUT', {}, 'julie')).status, 404, 'un membre n\'est pas un modèle');
    assert.equal((await call('/api/favorites/model/2', 'PUT', {}, 'luna')).status, 400, 'pas soi-même');
    assert.equal((await call('/api/favorites/salon/inconnu', 'PUT', {}, 'julie')).status, 404);
    assert.equal((await call('/api/favorites/model/3', 'PUT', {}, 'julie')).status, 200);
    assert.equal((await call('/api/favorites/model/3', 'PUT', { notify: false }, 'marc')).status, 200);
    assert.equal((await call('/api/favorites/salon/musique', 'PUT', {}, 'julie')).status, 200);

    let r = await call('/api/favorites', 'GET', undefined, 'julie');
    assert.equal(r.body.models[0].username, 'Lucie');
    assert.equal(r.body.models[0].isLive, true);
    assert.equal(r.body.salons[0].slug, 'musique');
    const lucie = (await call('/api/models', 'GET', undefined, 'julie')).body.models.find(m => m.username === 'Lucie');
    assert.equal(lucie.followers, 2);
    assert.equal(lucie.isFavorite, true);

    await call('/api/favorites/salon/musique', 'DELETE', undefined, 'julie');
    assert.equal((await call('/api/favorites', 'GET', undefined, 'julie')).body.salons.length, 0);
});

test('Alerte de live : site pour tous les abonnés, email une fois par 6 h et seulement si demandé', () => {
    const emis = [];
    const io = { to: room => ({ emit: (ev, d) => emis.push([room, ev, d.username]) }) };
    const stream = { streamId: 's1', broadcasterId: 3, broadcasterUsername: 'Lucie', salon: 'Salon Musique', isPrivate: false };
    discover.prevenirAbonnes(io, stream);
    assert.deepEqual(emis.map(e => e[0]).sort(), ['user:1', 'user:4']);
    assert.deepEqual(mails.map(m => m.to), ['julie@example.com'], 'Marc a coupé les emails');
    discover.prevenirAbonnes(io, stream);
    assert.equal(mails.length, 1, 'pas de second email dans les 6 h');
    assert.equal(discover.prevenirAbonnes(io, Object.assign({}, stream, { isPrivate: true })), 0, 'live privé : aucune alerte');
});
