// Sanction → e-mail explicite au membre → contestation par lien personnel → décision envoyée par e-mail
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-appel-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234567890';
process.env.SITE_URL = 'https://site.test';

// Faux service d'e-mail : on garde chaque envoi pour le vérifier
const envois = [];
require.cache[require.resolve('../mailer')] = { exports: {
    sendMail: async m => { envois.push(m); return { simulated: true }; },
    emailTemplate: (titre, contenu, cta, url) => '<h2>' + titre + '</h2>' + contenu + (cta ? '<a href="' + url + '">' + cta + '</a>' : '')
} };
const database = require('../database');
const sanctions = require('../sanctions');
const appels = require('../sanctions-mail');
const express = require('express');

let srv, BASE;
after(() => { if (srv) srv.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('Sanction notifiée par e-mail, contestée puis acceptée', async () => {
    const { db } = database;
    const id = (n, role) => db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(n, n.toLowerCase() + '@t.fr', 'x', role).lastInsertRowid;
    const modo = database.getUserById(id('Modo', 'moderator'));
    const boss = database.getUserById(id('Boss', 'super_admin'));
    const bob = database.getUserById(id('Bob', 'user'));

    // 1) Suspension de 3 jours : e-mail explicite avec lien de contestation
    const r = sanctions.appliquer({ cible: bob, auteur: modo, type: 'ban', minutes: 3 * 1440, raison: 'Insultes répétées' });
    assert.ok(r.ok);
    const mail = envois.find(m => m.to === 'bob@t.fr');
    assert.ok(mail, 'e-mail envoyé au membre');
    assert.match(mail.subject, /suspendu/);
    for (const attendu of ['Suspension du compte', '3 jours', 'Fin de la mesure', 'Insultes répétées', 'Article 6', 'cgu.html#sanctions', 'Contester la décision'])
        assert.ok(mail.html.includes(attendu), 'e-mail : ' + attendu);
    const jeton = /contestation\.html\?t=([a-f0-9]{48})/.exec(mail.html)[1];

    // 2) Page publique de contestation (sans connexion)
    const app = express(); app.use(express.json()); app.use('/api/appeals', require('../routes/appeals'));
    await new Promise(ok => { srv = app.listen(0, '127.0.0.1', ok); });
    BASE = 'http://127.0.0.1:' + srv.address().port + '/api/appeals/';
    let res = await fetch(BASE + jeton); let d = await res.json();
    assert.equal(res.status, 200); assert.equal(d.pseudo, 'Bob'); assert.equal(d.mesure, 'Suspension du compte'); assert.equal(d.contestation, null);
    assert.equal((await fetch(BASE + 'f'.repeat(48))).status, 404);
    res = await fetch(BASE + jeton, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'court' }) });
    assert.equal(res.status, 400);
    envois.length = 0;
    res = await fetch(BASE + jeton, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Ce n\'était pas moi, mon frère a utilisé mon ordinateur ce soir-là.' }) });
    assert.equal(res.status, 200);
    assert.ok(envois.some(m => m.to === 'bob@t.fr' && /bien reçu/.test(m.subject)), 'accusé de réception');
    assert.ok(envois.some(m => /Contestation de Bob/.test(m.subject)), 'équipe prévenue');
    res = await fetch(BASE + jeton, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Deuxième tentative de contestation pour la même chose.' }) });
    assert.equal(res.status, 409);

    // 3) Décision : un modérateur ne peut pas lever un ban ; le Super Admin oui
    const a = appels.lister('pending')[0];
    assert.equal(a.username, 'Bob');
    assert.equal(appels.decider({ id: a.id, auteur: modo, decision: 'accepted', note: 'Explication acceptée' }).code, 403);
    assert.equal(appels.decider({ id: a.id, auteur: boss, decision: 'accepted', note: 'court' }).code, 400);
    envois.length = 0;
    assert.ok(appels.decider({ id: a.id, auteur: boss, decision: 'accepted', note: 'Explication crédible, la suspension est levée.' }).ok);
    assert.equal(sanctions.etat(bob.id).bloque, false);
    const rep = envois.find(m => m.to === 'bob@t.fr');
    assert.match(rep.subject, /acceptée/); assert.ok(rep.html.includes('Explication crédible'));
    d = await (await fetch(BASE + jeton)).json();
    assert.equal(d.contestation.statut, 'accepted');

    // 4) Avertissement et mute automatique : e-mails aussi
    envois.length = 0;
    sanctions.appliquer({ cible: bob, auteur: null, type: 'mute', minutes: 10, raison: 'Mot interdit : x' });
    const m2 = envois.find(m => m.to === 'bob@t.fr');
    assert.ok(m2 && m2.html.includes('filtre automatique') && m2.html.includes('10 minutes'));
});
