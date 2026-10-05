// Programme de récompenses : gains, plafonds, série, parrainage, garde-fous, retrait
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'evc-recomp-'));
process.env.DB_PATH = path.join(dir, 'test.sqlite');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234567890';
delete process.env.EMAIL_VERIFICATION;
const envois = [];
require.cache[require.resolve('../mailer')] = { exports: { sendMail: async m => { envois.push(m); return {}; }, emailTemplate: (t, c) => '<h2>' + t + '</h2>' + c } };
const database = require('../database');
require('../stats');
const R = require('../recompenses');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const { db } = database;
const creer = (n, role = 'user') => db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run(n, n.toLowerCase() + '@t.fr', 'x', role).lastInsertRowid;
const solde = id => database.getBalance(id).balance;

test('Bienvenue, jour, série et plafonds', () => {
    const a = creer('Alice');
    R.connexion(a, '1.1.1.1');
    assert.equal(solde(a), 50 + 5, 'bienvenue + jour');
    R.connexion(a, '1.1.1.1');
    assert.equal(solde(a), 55, 'une seule fois par jour');
    // Série de 7 jours : la veille était le 6e jour → 10 crédits
    db.prepare("UPDATE reward_counters SET day = '2000-01-01' WHERE user_id = ? AND action = 'quotidien'").run(a);
    const hier = (() => { const d = new Date(R.jourParis() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); })();
    db.prepare('UPDATE reward_streaks SET last_day = ?, streak = 6 WHERE user_id = ?').run(hier, a);
    R.connexion(a);
    assert.equal(solde(a), 65);
    assert.equal(R.resumeMembre(a).serie, 7);

    // Temps actif : 15 minutes d'activité = 2 crédits, plafond 20 par jour
    for (let i = 0; i < 15 * 12; i++) { R.activite(a); R.tic(); }
    assert.equal(R.resumeMembre(a).aujourdhui.actif, 20, 'plafond quotidien');
    assert.equal(solde(a), 85);
});

test('Comptes non confirmés ou sanctionnés : aucun gain', () => {
    const b = creer('Bruno');
    db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(b);
    R.connexion(b);
    assert.equal(solde(b), 0);
    db.prepare('UPDATE users SET email_verified = 1, muted_until = ? WHERE id = ?').run(new Date(Date.now() + 3600e3).toISOString(), b);
    R.connexion(b);
    assert.equal(solde(b), 0, 'muet : pas de gain');
    db.prepare('UPDATE users SET muted_until = NULL WHERE id = ?').run(b);
    R.connexion(b);
    assert.equal(solde(b), 55);
});

test('Parrainage validé après 3 jours actifs, refusé sur la même IP', () => {
    const p = creer('Parrain');
    R.connexion(p, '9.9.9.9');
    const avant = solde(p);
    const f1 = creer('Filleul1');
    assert.equal(R.enregistrerParrain(f1, 'Parrain', '8.8.8.8'), 'Parrain');
    R.connexion(f1, '8.8.8.8');
    assert.equal(solde(p), avant, 'pas encore 3 jours actifs');
    ['2026-01-01', '2026-01-02', '2026-01-03'].forEach(d => db.prepare('INSERT OR IGNORE INTO daily_activity VALUES (?, ?)').run(d, f1));
    R.verifierParrainage(f1);
    assert.equal(solde(p), avant + 100);
    assert.ok(R.badges(p).some(b => b.id === 'parrain'));

    const f2 = creer('Filleul2');
    R.enregistrerParrain(f2, 'Parrain', '9.9.9.9');            // même IP que le parrain
    ['2026-01-01', '2026-01-02', '2026-01-03'].forEach(d => db.prepare('INSERT OR IGNORE INTO daily_activity VALUES (?, ?)').run(d, f2));
    R.connexion(f2, '9.9.9.9');
    assert.equal(solde(p), avant + 100, 'refusé');
    assert.equal(db.prepare('SELECT status FROM reward_referrals WHERE filleul_id = ?').get(f2).status, 'refused');
    assert.equal(R.enregistrerParrain(creer('Seul'), 'Inconnu'), null);
});

test('Live des modèles, signalements, réglages, retrait', () => {
    const m = creer('Mia', 'model');
    R.connexion(m);
    global.liveStreams = new Map([['s1', { broadcasterId: m, isBroadcasting: true, isPrivate: false, viewers: [] }]]);
    for (let i = 0; i < 60 * 6; i++) R.tic();
    assert.equal(R.resumeMembre(m).aujourdhui.live, 50, '10 par heure, plafond 50');
    global.liveStreams = new Map();

    const s = creer('Sam');
    R.connexion(s);
    const base = solde(s);
    for (let i = 0; i < 5; i++) R.signalementConfirme(s);
    assert.equal(solde(s), base + 30, '3 par semaine');

    const boss = { id: 1, username: 'Boss', role: 'super_admin' };
    R.reglerConfig({ quotidien: 8, actif: false }, boss);
    assert.equal(R.config().quotidien, 8);
    const n = creer('Nora'); R.connexion(n);
    assert.equal(solde(n), 0, 'programme en pause');
    R.reglerConfig({ actif: true }, boss);

    const r = R.retirer({ cible: database.getUserById(s), auteur: boss, montant: 1000, raison: 'Comptes multiples' });
    assert.equal(r.retire, base + 30);
    assert.equal(solde(s), 0);
    assert.ok(envois.some(e => /retirés/.test(e.subject)));
    const t = R.tableauAdmin(30);
    assert.ok(t.total > 0 && t.parAction.length >= 4 && t.top.length > 0);
    assert.equal(R.insigne(m).nom, 'Bronze');
});

test('Offrir des crédits à la main (Super Admin)', () => {
    const boss = { id: creer('Boss', 'super_admin'), username: 'Boss' };
    const id = creer('Gentil');
    const cible = database.getUserById(id);
    assert.equal(R.offrir({ cible, auteur: boss, montant: 0, raison: 'merci' }).code, 400);
    assert.equal(R.offrir({ cible, auteur: boss, montant: 99999, raison: 'merci' }).code, 400);
    assert.equal(R.offrir({ cible, auteur: boss, montant: 30, raison: '' }).code, 400);
    const r = R.offrir({ cible, auteur: boss, montant: 30, raison: 'Super ambiance' });
    assert.equal(r.offert, 30);
    assert.equal(solde(id), 30);
    const t = db.prepare("SELECT description FROM credits_transactions WHERE user_id = ? ORDER BY id DESC").get(id);
    assert.match(t.description, /Offert par l'équipe — Super ambiance/);
    assert.ok(R.tableauAdmin(30).manuels.some(m => m.username === 'Gentil' && m.amount === 30));
});

test('Modérateur : offrir avec plafonds', () => {
    const modo = database.getUserById(creer('Modo1', 'moderator'));
    const autreModo = database.getUserById(creer('Modo2', 'moderator'));
    const m = database.getUserById(creer('Membre1'));
    assert.equal(R.offrir({ cible: modo, auteur: modo, montant: 10, raison: 'moi' }).code, 403, 'pas à soi-même');
    assert.equal(R.offrir({ cible: autreModo, auteur: modo, montant: 10, raison: 'collègue' }).code, 403, 'pas à l équipe');
    assert.equal(R.offrir({ cible: m, auteur: modo, montant: 101, raison: 'trop' }).code, 400, 'plafond par envoi');
    for (let i = 0; i < 5; i++) assert.equal(R.offrir({ cible: m, auteur: modo, montant: 100, raison: 'bravo' }).offert, 100);
    const r = R.offrir({ cible: m, auteur: modo, montant: 1, raison: 'encore' });
    assert.equal(r.code, 400, 'plafond du jour');
    assert.match(r.erreur, /limite du jour/);
    assert.equal(R.quotaModo(modo.id).reste, 0);
    assert.ok(R.tableauAdmin(30).manuels.some(x => x.par === 'Modo1' && x.username === 'Membre1'));
    // 0 = modérateurs non autorisés
    R.reglerConfig({ modoOffreMax: 0 }, null);
    assert.equal(R.offrir({ cible: m, auteur: autreModo, montant: 5, raison: 'test' }).code, 403);
    R.reglerConfig({ modoOffreMax: 100 }, null);
});
