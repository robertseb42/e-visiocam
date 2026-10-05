// Statistiques du panneau admin : inscriptions, membres actifs, pic, crédits vendus (par jour, heure de Paris)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-stats-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234567890';
const database = require('../database');
const stats = require('../stats');

test('Statistiques : chiffres du jour et de la période', () => {
    const { db } = database;
    const a = db.prepare("INSERT INTO users (username, email, password_hash) VALUES ('A', 'a@t.fr', 'x')").run().lastInsertRowid;
    const b = db.prepare("INSERT INTO users (username, email, password_hash) VALUES ('B', 'b@t.fr', 'x')").run().lastInsertRowid;
    db.prepare("INSERT INTO users (username, email, password_hash, created_at) VALUES ('Vieux', 'v@t.fr', 'x', datetime('now', '-60 days'))").run();
    database.addCredits(a, 100, 'purchase', 'Ancien achat (simulation)', null, { simulated: true });   // ignoré : site gratuit
    database.addCredits(a, 50, 'reward', 'Bonus de bienvenue');
    database.addCredits(b, 30, 'reward', 'Connexion quotidienne');
    database.addCredits(a, -20, 'spend', 'Cadeau');

    stats.noterPresence(a, 1);
    stats.noterPresence(b, 2);
    stats.noterPresence(a, 1);          // le pic reste à 2, A n'est compté qu'une fois

    const r = stats.resume(7);
    assert.equal(r.jours.length, 7);
    const t = r.aujourdhui;
    assert.equal(t.jour, stats.jourParis());
    assert.equal(t.inscriptions, 2);    // l'inscription d'il y a 60 jours est hors période
    assert.equal(t.actifs, 2);
    assert.equal(t.pic, 2);
    assert.equal(t.creditsDistribues, 80);   // les anciens achats ne comptent pas
    assert.equal(t.creditsDepenses, 20);
    assert.equal(t.depenses, 1);
    assert.equal(r.total.creditsEnCirculation, 160);
    assert.equal(r.total.membres, 3);
    assert.equal(r.periode.inscriptions, 2);
    fs.rmSync(dir, { recursive: true, force: true });
});
