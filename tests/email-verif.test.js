// Inscription → e-mail avec lien de confirmation → connexion refusée tant que non confirmé →
// confirmation → connexion. Changement d'adresse : appliqué seulement après confirmation.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-verif-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234567890';
process.env.SITE_URL = 'https://site.test';
process.env.COOKIE_INSECURE = '1';
delete process.env.EMAIL_VERIFICATION;

const envois = [];
require.cache[require.resolve('../mailer')] = { exports: {
    sendMail: async m => { envois.push(m); return { simulated: true }; },
    sendWelcomeEmail: async u => { envois.push({ to: u.email, subject: 'Bienvenue', html: '' }); },
    emailTemplate: (t, c, cta, url) => '<h2>' + t + '</h2>' + c + (cta ? '<a href="' + url + '">' + cta + '</a>' : '')
} };
const database = require('../database');
const express = require('express');
const app = express(); app.use(express.json());
app.use('/api/auth', require('../routes/auth'));
app.use('/api/users', require('../routes/users'));
let srv, BASE;
after(() => { if (srv) srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

async function api(chemin, methode = 'GET', corps, cookie) {
    const r = await fetch(BASE + chemin, { method: methode, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, body: corps ? JSON.stringify(corps) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { status: r.status, json: j, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const lienDe = m => /verifier-email\.html\?t=([a-f0-9]{64})/.exec(m.html)[1];

test('Confirmation de l\'adresse e-mail', async () => {
    await new Promise(ok => { srv = app.listen(0, '127.0.0.1', ok); });
    BASE = 'http://127.0.0.1:' + srv.address().port;

    // Inscription : pas de session, un e-mail de confirmation
    let r = await api('/api/auth/register', 'POST', { username: 'Lea', email: 'lea@exemple.fr', password: 'MotDePasse123!' });
    assert.equal(r.status, 201);
    assert.equal(r.json.needVerification, true);
    assert.equal(r.json.email, 'l*a@e****e.fr');
    assert.equal(r.cookie, '', 'aucune session avant confirmation');
    const mail = envois.find(m => m.to === 'lea@exemple.fr');
    assert.match(mail.subject, /Confirmez votre adresse/);
    assert.ok(mail.html.includes('48 heures'));
    const jeton = lienDe(mail);

    // Connexion refusée tant que l'adresse n'est pas confirmée
    r = await api('/api/auth/login', 'POST', { username: 'Lea', password: 'MotDePasse123!' });
    assert.equal(r.status, 403); assert.equal(r.json.needVerification, true);
    // Mauvais mot de passe : on ne révèle rien sur la confirmation
    r = await api('/api/auth/login', 'POST', { username: 'Lea', password: 'Faux123456!' });
    assert.equal(r.status, 401); assert.equal(r.json.needVerification, undefined);

    // Renvoi trop rapproché refusé ; pseudo inconnu : réponse identique
    assert.equal((await api('/api/auth/resend-verification', 'POST', { login: 'Lea' })).status, 429);
    assert.equal((await api('/api/auth/resend-verification', 'POST', { login: 'Personne' })).status, 200);

    // Lien invalide / confirmation / lien réutilisé
    assert.equal((await api('/api/auth/verify-email', 'POST', { token: 'abc' })).status, 400);
    assert.equal((await api('/api/auth/verify-email', 'POST', { token: 'f'.repeat(64) })).status, 404);
    envois.length = 0;
    r = await api('/api/auth/verify-email', 'POST', { token: jeton });
    assert.equal(r.status, 200); assert.equal(r.json.username, 'Lea');
    assert.ok(envois.some(m => m.subject === 'Bienvenue'), 'bienvenue après confirmation');
    r = await api('/api/auth/verify-email', 'POST', { token: jeton });
    assert.equal(r.status, 200); assert.equal(r.json.deja, true);

    // Connexion acceptée
    r = await api('/api/auth/login', 'POST', { username: 'Lea', password: 'MotDePasse123!' });
    assert.equal(r.status, 200); assert.ok(r.cookie.startsWith('evc_session='));
    const session = r.cookie;

    // Changement d'adresse : lien envoyé à la NOUVELLE adresse, rien ne change avant le clic
    envois.length = 0;
    r = await api('/api/users/me', 'PUT', { email: 'lea.nouvelle@exemple.fr' }, session);
    assert.equal(r.status, 200); assert.match(r.json.message, /lien de confirmation/);
    assert.equal(r.json.user.email, 'lea@exemple.fr');
    const m2 = envois.find(m => m.to === 'lea.nouvelle@exemple.fr');
    assert.match(m2.subject, /nouvelle adresse/);
    r = await api('/api/auth/verify-email', 'POST', { token: lienDe(m2) });
    assert.equal(r.status, 200); assert.equal(r.json.purpose, 'change');
    assert.equal(database.getUserById(1).email, 'lea.nouvelle@exemple.fr');

    // Lien expiré
    await api('/api/auth/register', 'POST', { username: 'Tom', email: 'tom@exemple.fr', password: 'MotDePasse123!' });
    const jt = lienDe(envois.find(m => m.to === 'tom@exemple.fr'));
    database.db.prepare("UPDATE email_verifications SET expires_at = '2000-01-01T00:00:00Z' WHERE email = 'tom@exemple.fr'").run();
    r = await api('/api/auth/verify-email', 'POST', { token: jt });
    assert.equal(r.status, 410); assert.equal(r.json.expire, true);

    // Purge : compte jamais confirmé depuis plus de 7 jours supprimé
    database.db.prepare("UPDATE users SET created_at = datetime('now', '-8 days') WHERE username = 'Tom'").run();
    assert.equal(require('../email-verif').purger(), 1);
    assert.equal(database.getUserByUsername('Tom'), undefined);
    assert.ok(database.getUserByUsername('Lea'), 'les comptes confirmés ne sont jamais purgés');
});
