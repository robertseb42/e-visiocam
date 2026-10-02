// Teste la décision d'affichage de maintenance.js.  Lancer : node --test maintenance.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = { window: {}, document: { readyState: 'complete', addEventListener() {}, body: null }, location: { hostname: 'x', pathname: '/' },
    localStorage: { getItem() { return null; } }, fetch: async () => ({ ok: false }), setInterval() {}, setTimeout, clearTimeout };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, 'maintenance.js'), 'utf8'), ctx);
const decide = ctx.window.EvcMaintenance._decide;
const on = { enabled: true, message: 'x' };

test('site ouvert : rien à afficher', () => {
    assert.equal(decide({ enabled: false }, 'index.html', null), 'none');
    assert.equal(decide(null, 'index.html', null), 'none');
});
test('maintenance : page d\'attente pour visiteurs et membres', () => {
    assert.equal(decide(on, 'index.html', null), 'overlay');
    assert.equal(decide(on, 'live.html', 'user'), 'overlay');
    assert.equal(decide(on, 'moderation.html', 'moderator'), 'overlay');
});
test('maintenance : connexion et pages légales restent utilisables', () => {
    for (const p of ['login.html', 'cgu.html', 'mentions-legales.html', 'confidentialite.html', 'rgpd.html', 'cookies.html', 'forgot-password.html'])
        assert.equal(decide(on, p, null), 'banner-info', p);
});
test('maintenance : le super admin garde le site et voit un bandeau', () => {
    assert.equal(decide(on, 'index.html', 'super_admin'), 'banner-admin');
    assert.equal(decide(on, 'admin.html', 'super_admin'), 'banner-admin');
});
