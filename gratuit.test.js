// Passage au tout gratuit : plus d'achat de crédits, soldes remis à zéro une seule fois
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-gratuit-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234567890';
process.env.COOKIE_INSECURE = '1';
delete process.env.PAYMENTS_ENABLED; delete process.env.STRIPE_SECRET_KEY;
require.cache[require.resolve('../mailer')] = { exports: { sendMail: async () => ({}), sendCreditsPurchaseEmail: async () => ({}), emailTemplate: () => '' } };

const database = require('../database');
const { generateToken } = require('../auth');
const express = require('express');
let srv;
after(() => { if (srv) srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Plus aucun crédit sans action, soldes remis à zéro une fois', async () => {
    const { db } = database;
    const id = db.prepare("INSERT INTO users (username, email, password_hash) VALUES ('Ana', 'ana@t.fr', 'x')").run().lastInsertRowid;
    database.addCredits(id, 575, 'purchase', 'Achat (simulation)', null, { simulated: true });
    assert.equal(database.getBalance(id).balance, 575);

    // Remise à zéro unique
    const gratuit = require('../gratuit');
    assert.equal(gratuit.remettreAZero(), 1);
    assert.equal(database.getBalance(id).balance, 0);
    const reset = db.prepare("SELECT amount FROM credits_transactions WHERE user_id = ? AND type = 'reset'").get(id);
    assert.equal(reset.amount, -575);
    database.addCredits(id, 50, 'reward', 'Bonus de bienvenue');
    assert.equal(gratuit.remettreAZero(), 0, 'ne repasse jamais');
    assert.equal(database.getBalance(id).balance, 50);

    // Achat impossible
    const app = express(); app.use(express.json()); app.use('/api/credits', require('../routes/credits'));
    await new Promise(ok => { srv = app.listen(0, '127.0.0.1', ok); });
    const base = 'http://127.0.0.1:' + srv.address().port + '/api/credits';
    const cookie = 'evc_session=' + generateToken(database.getUserById(id));
    let r = await fetch(base + '/packs'); let d = await r.json();
    assert.equal(d.gratuit, true); assert.deepEqual(d.packs, []);
    r = await fetch(base + '/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ packId: 'pack-1000' }) });
    assert.equal(r.status, 410);
    assert.equal(database.getBalance(id).balance, 50, 'aucun crédit ajouté');
    r = await fetch(base + '/confirm', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ sessionId: 'cs_x' }) });
    assert.equal(r.status, 410);
    // Historique du membre : ni les anciens achats simulés, ni leur remise à zéro
    d = await (await fetch(base + '/transactions', { headers: { Cookie: cookie } })).json();
    assert.deepEqual(d.transactions.map(t => t.type), ['reward']);
});
