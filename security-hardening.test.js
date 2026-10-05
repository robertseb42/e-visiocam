'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-security-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';
process.env.REWARDS_ENABLED = '0';   // soldes testés au crédit près : pas de récompenses ici
delete process.env.SENDGRID_API_KEY;
delete process.env.STRIPE_SECRET_KEY;
const express = require('express');
const bcrypt = require('bcryptjs');
const { io: client } = require('socket.io-client');
const db = require('../database');
const { generateToken } = require('../auth');
const { initializeSocket } = require('../socket');
const salonRoutes = require('../routes/salons');
const { salonRoom } = require('../salon-security');
const privateLive = require('../private-live');
const wait = ms => new Promise(r => setTimeout(r, ms));

test('Sécurité : rooms, cadeaux, bootstrap et fichiers sensibles', async t => {
    assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 0, 'aucun utilisateur créé au chargement de la base');
    const app = express();
    app.use(require('../sensitive-files'));
    app.use(express.json());
    app.use('/api/salons', salonRoutes);
    app.use('/api/credits', require('../routes/credits'));
    const server = http.createServer(app);
    const io = initializeSocket(server);
    global.io = io;
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + server.address().port;
    const sockets = [];
    const accounts = {};
    async function account(name, role = 'user') {
        const id = db.createUser(name, name + '@example.invalid', bcrypt.hashSync(randomBytes(20).toString('hex'), 4), role);
        const token = generateToken(db.getUserById(id));
        const socket = client(base, { auth: { token }, transports: ['websocket'], reconnection: false });
        sockets.push(socket);
        await new Promise((r, j) => { socket.once('connect', r); socket.once('connect_error', j); });
        const messages = [], gifts = [], histories = [], streams = [];
        socket.on('chat:message', d => messages.push(d));
        socket.on('gift', d => gifts.push(d));
        socket.on('chat:history', d => histories.push(d));
        socket.on('live:started', d => streams.push(d));
        return accounts[name] = { id, token, socket, messages, gifts, histories, streams };
    }
    const A = await account('AuditBuyer'), B = await account('AuditOther'), admin = await account('AuditAdmin', 'super_admin');
    const join = (a, salon) => new Promise((r, j) => a.socket.timeout(2000).emit('salon:join', salon, (err, response) => err ? j(err) : r(response)));
    async function api(a, route, body) {
        const response = await fetch(base + route, { method: 'POST', headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        return { status: response.status, body: await response.json() };
    }
    try {
        await t.test('Rooms internes, tableaux, noms inconnus et VIP refusés', async () => {
            for (const value of ['user:' + B.id, 'stream:x', B.socket.id, ['general', 'user:' + B.id], {}, null, 'inexistant', 'VIP Lounge', 'premium']) {
                assert.equal((await join(A, value)).ok, false, JSON.stringify(value));
            }
            const serverSocket = io.sockets.sockets.get(A.socket.id);
            assert.equal(serverSocket.rooms.has('user:' + B.id), false);
            let leaked = false;
            A.socket.on('dm:message', () => { leaked = true; });
            io.to('user:' + B.id).emit('dm:message', { message: 'private-test' });
            await wait(50);
            assert.equal(leaked, false);
        });
        await t.test('Salon public, chat et passage entre salons conservés', async () => {
            assert.equal((await join(A, 'general')).ok, true);
            A.socket.emit('chat:message', { text: 'message normal', salon: 'Salon Général' });
            await wait(60);
            assert.equal(B.messages.at(-1).text, 'message normal');
            assert.equal((await join(A, 'francais')).ok, true);
            const n = B.messages.length;
            A.socket.emit('chat:message', { text: 'hors salon', salon: 'Salon Général' });
            await wait(60);
            assert.equal(B.messages.length, n);
            assert.equal(io.sockets.sockets.get(A.socket.id).rooms.has(salonRoom('general')), false);
        });
        await t.test('Membre approuvé et administrateur entrent dans le VIP', async () => {
            db.db.prepare("INSERT INTO salon_access (slug, user_id, status) VALUES ('vip', ?, 'approved')").run(A.id);
            assert.equal((await join(A, 'VIP Lounge')).ok, true);
            assert.equal((await join(admin, 'vip')).ok, true);
            A.socket.emit('chat:message', { text: 'réservé VIP', salon: 'vip' });
            await wait(60);
            assert.equal(admin.messages.at(-1).text, 'réservé VIP');
            assert.ok(!B.messages.some(m => m.text === 'réservé VIP'));
        });
        await t.test('Live et historique ne contournent pas le salon privé', async () => {
            const before = global.liveStreams.size;
            B.socket.emit('live:start', { streamId: 'unauthorized', salon: 'vip' });
            await wait(60);
            assert.equal(global.liveStreams.size, before);
            A.socket.emit('live:start', { streamId: 'vip-live', salon: 'vip' });
            await wait(60);
            assert.ok(global.liveStreams.has('vip-live'));
            assert.equal(privateLive.canWatch(global.liveStreams.get('vip-live'), db.getUserById(B.id)), false);
            assert.ok(!B.streams.some(s => s.streamId === 'vip-live'));
            assert.equal((await join(B, 'vip')).ok, false);
            assert.ok(!B.histories.flat().some(m => m.text === 'réservé VIP'));
        });
        await t.test('Retrait d’accès effectif sur les prochains messages', async () => {
            db.db.prepare("UPDATE salon_access SET status='refused' WHERE user_id=?").run(A.id);
            const n = A.messages.length;
            admin.socket.emit('chat:message', { text: 'après révocation', salon: 'vip' });
            await wait(60);
            assert.equal(A.messages.length, n);
            assert.equal(io.sockets.sockets.get(A.socket.id).rooms.has(salonRoom('vip')), false);
        });
        await t.test('Identifiants live HTML rejetés', async () => {
            B.socket.emit('live:start', { streamId: '<img src=x>', salon: 'general' });
            await wait(60);
            assert.equal(global.liveStreams.has('<img src=x>'), false);
        });
        await t.test('Le salon par défaut ne contourne pas son passage en privé', async () => {
            db.db.prepare("UPDATE salons SET is_private=1 WHERE slug='general'").run();
            try {
                const newcomer = await account('AuditNewcomer');
                assert.equal(io.sockets.sockets.get(newcomer.socket.id).rooms.has(salonRoom('general')), false);
                assert.equal((await join(newcomer, 'general')).ok, false);
            } finally { db.db.prepare("UPDATE salons SET is_private=0 WHERE slug='general'").run(); }
        });
        await t.test('Cadeau Socket.IO fabriqué ignoré', async () => {
            await join(A, 'general');
            const n = B.gifts.length;
            A.socket.emit('gift', { gift: '<img src=x onerror=alert(1)>', giftName: 'forgé' });
            await wait(60);
            assert.equal(B.gifts.length, n);
        });
        await t.test('Cadeau HTTP payé : un débit et une annonce serveur', async () => {
            db.addCredits(A.id, 100, 'test', 'fixture', null, null);
            const gift = db.getGifts()[0];
            const n = B.gifts.length;
            const r = await api(A, '/api/credits/gifts/send', { giftId: gift.id, salon: 'general', receiverUsername: 'AuditOther', gift: '<b>forgé</b>' });
            assert.equal(r.status, 200);
            await wait(60);
            assert.equal(B.gifts.length, n + 1);
            assert.equal(B.gifts.at(-1).gift, gift.emoji);
            assert.equal(db.getBalance(A.id).balance, 100 - gift.price);
        });
        await t.test('Cadeau refusé sans accès, présence, solde ou catalogue valide', async () => {
            const gift = db.getGifts()[0];
            const count = db.db.prepare('SELECT COUNT(*) AS n FROM gifts_sent').get().n;
            assert.equal((await api(A, '/api/credits/gifts/send', { giftId: gift.id, salon: 'vip' })).status, 403);
            assert.equal((await api(A, '/api/credits/gifts/send', { giftId: gift.id, salon: 'francais' })).status, 403);
            assert.equal((await api(B, '/api/credits/gifts/send', { giftId: gift.id, salon: 'general' })).status, 400);
            assert.equal((await api(A, '/api/credits/gifts/send', { giftId: '1', salon: 'general' })).status, 400);
            assert.equal((await api(A, '/api/credits/gifts/send', { giftId: gift.id, salon: 'general', receiverUsername: '<img src=x>' })).status, 404);
            assert.equal(db.db.prepare('SELECT COUNT(*) AS n FROM gifts_sent').get().n, count);
        });
        await t.test('Erreur d’écriture cadeau : aucun débit partiel', async () => {
            const original = db.sendGift;
            const balance = db.getBalance(A.id).balance;
            db.sendGift = () => { throw new Error('test rollback'); };
            try {
                assert.equal((await api(A, '/api/credits/gifts/send', { giftId: db.getGifts()[0].id, salon: 'general' })).status, 500);
                assert.equal(db.getBalance(A.id).balance, balance);
            } finally { db.sendGift = original; }
        });
        await t.test('Bases et configurations ne sont jamais servies', async () => {
            for (const p of ['/database.sqlite', '/database.sqlite-wal', '/public/backup.db', '/.env', '/.env.production', '/.git/config', '/database%2esqlite']) {
                assert.equal((await fetch(base + p)).status, 404, p);
            }
        });
        await t.test('Bootstrap explicite, sans secret par défaut et sans écrasement', () => {
            const password = randomBytes(24).toString('base64') + 'A1';
            const env = { ...process.env, DB_PATH: path.join(dir, 'bootstrap.sqlite'), ADMIN_USERNAME: 'BootstrapAdmin', ADMIN_EMAIL: 'bootstrap@example.invalid', ADMIN_PASSWORD: password };
            const run = () => spawnSync(process.execPath, [path.join(__dirname, '../scripts/create-admin.cjs')], { env, encoding: 'utf8' });
            const first = run();
            assert.equal(first.status, 0, first.stderr);
            assert.ok(!first.stdout.includes(password));
            assert.equal(run().status, 1, 'aucun admin existant écrasé');
            delete env.ADMIN_PASSWORD;
            env.DB_PATH = path.join(dir, 'no-secrets.sqlite');
            assert.equal(run().status, 1);
        });
    } finally {
        sockets.forEach(s => s.close());
        await new Promise(r => io.close(r));
        db.db.close();
        fs.rmSync(dir, { recursive: true, force: true });
        delete global.io;
    }
});
