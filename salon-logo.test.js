// Teste salon-logo.js avec un faux navigateur (aucun réseau).  Lancer : node --test salon-logo.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function monde({ nat, tailles } = {}) {
    const etat = { draw: null, canvas: null };
    const ctx = { window: {}, setTimeout, Promise, Math, Error, console,
        URL: { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} },
        Image: class { set src(v) { this.naturalWidth = nat[0]; this.naturalHeight = nat[1]; setTimeout(() => this.onload && this.onload(), 0); } },
        document: { createElement: () => { const cv = { width: 0, height: 0, getContext: () => ({ drawImage: (...a) => { etat.draw = a.slice(1); } }),
            toDataURL: type => { etat.canvas = cv; const t = (tailles || {})[type]; return 'data:' + type + ';base64,' + 'A'.repeat(t === undefined ? 100 : t); } }; return cv; } } };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(path.join(__dirname, 'salon-logo.js'), 'utf8'), ctx);
    return { L: ctx.window.SalonLogo, etat };
}
const refus = async (L, f) => { try { await L.preparerImage(f); return null; } catch (e) { return e.message; } };

test('tailles : 256 px au maximum, jamais agrandie, image centrée sans déformation', () => {
    const { L } = monde();
    assert.equal(L.cotePourImage(1200, 800), 256);
    assert.equal(L.cotePourImage(256, 256), 256);
    assert.equal(L.cotePourImage(100, 100), 100, 'une petite image n\'est pas agrandie');
    assert.equal(L.cotePourImage(120, 60), 120);
    assert.equal(JSON.stringify(L.ajusterDansCarre(1200, 800, 256)), JSON.stringify({ dw: 256, dh: 171, dx: 0, dy: 42 }));
    assert.equal(JSON.stringify(L.ajusterDansCarre(800, 1200, 256)), JSON.stringify({ dw: 171, dh: 256, dx: 42, dy: 0 }));
    assert.equal(JSON.stringify(L.ajusterDansCarre(256, 256, 256)), JSON.stringify({ dw: 256, dh: 256, dx: 0, dy: 0 }));
});

test('fichiers refusés avec un message clair', async () => {
    const { L } = monde({ nat: [500, 500] });
    for (const type of ['image/gif', 'image/svg+xml', 'application/pdf', '']) assert.match(await refus(L, { type, size: 10 }), /Format non accepté/, type);
    assert.match(await refus(L, null), /Format non accepté/);
    const lourd = await refus(L, { type: 'image/png', size: 3 * 1024 * 1024 });
    assert.match(lourd, /3,0 Mo/); assert.match(lourd, /2 Mo maximum/);
    assert.match(await refus(monde({ nat: [40, 40] }).L, { type: 'image/png', size: 5000 }), /40 × 40 px.*64 × 64 px minimum/);
});

test('réduction : carré 256, PNG gardé s\'il est léger, WebP puis JPG sinon', async () => {
    let m = monde({ nat: [1200, 800], tailles: { 'image/png': 1000 } });
    let r = await m.L.preparerImage({ type: 'image/jpeg', size: 500000 });
    assert.equal(m.etat.canvas.width, 256); assert.equal(m.etat.canvas.height, 256); assert.equal(r.cote, 256);
    assert.equal(JSON.stringify(m.etat.draw), JSON.stringify([0, 42, 256, 171]));
    assert.ok(r.data.startsWith('data:image/png'));

    m = monde({ nat: [800, 800], tailles: { 'image/png': 600000, 'image/webp': 20000 } });
    assert.ok((await m.L.preparerImage({ type: 'image/png', size: 900000 })).data.startsWith('data:image/webp'));
    m = monde({ nat: [800, 800], tailles: { 'image/png': 600000, 'image/webp': 600000, 'image/jpeg': 30000 } });
    assert.ok((await m.L.preparerImage({ type: 'image/png', size: 900000 })).data.startsWith('data:image/jpeg'));
    m = monde({ nat: [800, 800], tailles: { 'image/png': 600000, 'image/webp': 600000, 'image/jpeg': 600000 } });
    assert.match(await refus(m.L, { type: 'image/png', size: 900000 }), /trop détaillée/);

    m = monde({ nat: [100, 100], tailles: { 'image/png': 100 } });
    r = await m.L.preparerImage({ type: 'image/png', size: 5000 });
    assert.equal(r.cote, 100); assert.equal(m.etat.canvas.width, 100);
});
