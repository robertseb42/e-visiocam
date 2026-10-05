const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const bcrypt = require('bcryptjs');

// ---------- faux utilisateurs en mémoire ----------
const users = {
    1: { id: 1, username: 'SuperBoss', role: 'super_admin', status: 'active', password_hash: bcrypt.hashSync('AncienMdp1', 4) },
    2: { id: 2, username: 'Julie', role: 'user', status: 'active', password_hash: bcrypt.hashSync('JulieMdp1', 4) }
};
const journal = [];
let sessionPerimee = false;

const fakeDb = {
    getUserById: id => users[id],
    getUserByUsername: n => Object.values(users).find(u => u.username === n),
    getAllUsers: () => Object.values(users),
    isTokenRevoked: () => false,
    isTokenOutdated: () => sessionPerimee,
    setPasswordState: (id, hash, flag) => {
        users[id].password_hash = hash;
        users[id].must_change_password = flag ? 1 : 0;
    },
    touchTokensValidFrom: id => { users[id].tokens_valid_from = '2026-10-02 08:30:00'; },
    addLog: (type, message) => journal.push(type + ': ' + message)
};

require.cache[require.resolve('../database')] = { exports: fakeDb };
require.cache[require.resolve('../auth')] = {
    exports: {
        verifyToken: t => t === 'admin-test' ? { id: 1, iat: 100 } : t === 'user-test' ? { id: 2, iat: 100 } : null,
        generateToken: () => 'jeton-frais'
    }
};
require.cache[require.resolve('../mailer')] = { exports: {} };

const app = express();
app.use(express.json());
app.use('/api/admin', require('../routes/admin'));
// Même ordre que server.js : routes/auth.js d'abord, puis routes/password.js.
// (Avant, seul password.js était monté ici : une ancienne route en double dans auth.js passait inaperçue.)
app.use('/api/auth', require('../routes/auth'));
app.use('/api/auth', require('../routes/password'));
const server = app.listen(0, '127.0.0.1');
const ready = new Promise(resolve => server.on('listening', resolve));

async function call(path, method = 'GET', body, token) {
    await ready;
    return fetch('http://127.0.0.1:' + server.address().port + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

after(() => { server.close(); });

test('Réinitialisation du mot de passe par le super admin puis changement obligatoire', async () => {
    // 1. Réservé au super administrateur
    assert.equal((await call('/api/admin/users', 'GET', undefined, undefined)).status, 401);
    assert.equal((await call('/api/admin/users', 'GET', undefined, 'user-test')).status, 403);
    assert.equal((await call('/api/admin/users', 'GET', undefined, 'admin-test')).status, 200);

    // 2. Réinitialisation : mot de passe temporaire + obligation de le changer
    let r = await call('/api/admin/users/2/reset-password', 'POST', undefined, 'admin-test');
    assert.equal(r.status, 200);
    const temp = (await r.json()).tempPassword;
    assert.match(temp, /^[A-Za-z]+\d{4}!$/);
    assert.equal(await bcrypt.compare(temp, users[2].password_hash), true, 'le mot de passe temporaire doit être actif');
    assert.equal(users[2].must_change_password, 1, 'le membre devra choisir un nouveau mot de passe');
    assert.equal(users[2].tokens_valid_from, '2026-10-02 08:30:00', 'les anciennes sessions sont invalidées');
    assert.equal(journal.some(l => l.startsWith('PASSWORD_RESET_ADMIN')), true);

    // 3. Compte inconnu
    assert.equal((await call('/api/admin/users/999/reset-password', 'POST', undefined, 'admin-test')).status, 404);

    // 4. Nouveau mot de passe trop faible refusé
    assert.equal((await call('/api/auth/change-password', 'POST', { newPassword: 'court' }, 'user-test')).status, 400);
    assert.equal((await call('/api/auth/change-password', 'POST', { newPassword: 'sansmajuscule1' }, 'user-test')).status, 400);

    // 5. Mauvais mot de passe actuel refusé
    assert.equal((await call('/api/auth/change-password', 'POST', { currentPassword: 'faux', newPassword: 'NouveauMdp1' }, 'user-test')).status, 401);

    // 6. Changement accepté (avec le mot de passe temporaire) : obligation levée et nouveau jeton
    r = await call('/api/auth/change-password', 'POST', { currentPassword: temp, newPassword: 'NouveauMdp1' }, 'user-test');
    assert.equal(r.status, 200);
    await r.json();
    assert.match(r.headers.get('set-cookie') || '', /evc_session=jeton-frais;.*HttpOnly/);
    assert.equal(users[2].must_change_password, 0);
    assert.equal(await bcrypt.compare('NouveauMdp1', users[2].password_hash), true);
    assert.equal(journal.some(l => l.startsWith('PASSWORD_CHANGED')), true);

    // 7. Une session ouverte avant la réinitialisation n'est plus acceptée
    sessionPerimee = true;
    assert.equal((await call('/api/admin/users', 'GET', undefined, 'admin-test')).status, 401);
    sessionPerimee = false;
});


test('Membre connecté avec son mot de passe temporaire : il choisit le nouveau SANS redonner l\'ancien', async () => {
    // Le compte est de nouveau réinitialisé par le super admin
    let r = await call('/api/admin/users/2/reset-password', 'POST', undefined, 'admin-test');
    const temp = (await r.json()).tempPassword;
    assert.equal(users[2].must_change_password, 1);

    // Le temporaire ne peut pas être gardé comme nouveau mot de passe (l'administrateur le connaît)
    r = await call('/api/auth/change-password', 'POST', { newPassword: temp }, 'user-test');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /différent/);
    assert.equal(users[2].must_change_password, 1, 'toujours obligatoire après un refus');

    // Cas de la page nouveau-mdp.html : uniquement le nouveau mot de passe
    r = await call('/api/auth/change-password', 'POST', { newPassword: 'ChoixDuMembre7' }, 'user-test');
    assert.equal(r.status, 200, 'ne doit plus répondre 500');
    const body = await r.json();
    assert.equal(body.success, true);
    assert.equal(body.token, undefined);   // le jeton n'est plus renvoyé au JavaScript…
    assert.match(r.headers.get('set-cookie') || '', /evc_session=jeton-frais;.*HttpOnly/);   // …mais déposé dans le cookie
    assert.equal(users[2].must_change_password, 0, 'obligation levée');
    assert.equal(await bcrypt.compare('ChoixDuMembre7', users[2].password_hash), true);
});

test('Hors réinitialisation, l\'ancien mot de passe reste obligatoire', async () => {
    assert.equal(users[2].must_change_password, 0);
    let r = await call('/api/auth/change-password', 'POST', { newPassword: 'AutreMdp8' }, 'user-test');
    assert.equal(r.status, 400);
    assert.match((await r.json()).error, /actuel requis/);
    assert.equal(await bcrypt.compare('ChoixDuMembre7', users[2].password_hash), true, 'mot de passe inchangé');

    r = await call('/api/auth/change-password', 'POST', { currentPassword: 'ChoixDuMembre7', newPassword: 'AutreMdp8' }, 'user-test');
    assert.equal(r.status, 200);
    assert.equal(await bcrypt.compare('AutreMdp8', users[2].password_hash), true);
});
