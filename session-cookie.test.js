const { test } = require('node:test');
const assert = require('node:assert/strict');
const session = require('../session');

test('Cookie de session : lecture, priorité à l\'en-tête, attributs de sécurité', () => {
    assert.equal(session.tokenFromHeaders({ cookie: 'a=1; evc_session=abc.def; b=2' }), 'abc.def');
    assert.equal(session.tokenFromHeaders({ authorization: 'Bearer xyz', cookie: 'evc_session=abc' }), 'xyz');
    assert.equal(session.tokenFromHeaders({ authorization: 'Bearer null', cookie: 'evc_session=abc' }), 'abc');
    assert.equal(session.tokenFromHeaders({}), null);

    const poses = [];
    const res = { append: (k, v) => poses.push([k, v]) };
    session.poserSession(res, require('jsonwebtoken').sign({ id: 1 }, 'secret-de-test', { expiresIn: '1h' }));
    session.effacerSession(res);
    assert.equal(poses[0][0], 'Set-Cookie');
    assert.match(poses[0][1], /^evc_session=.+; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=3\d{3}$/);
    assert.match(poses[1][1], /^evc_session=; .*Max-Age=0$/);
});
