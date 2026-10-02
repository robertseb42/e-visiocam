// Teste sfu-client.js avec un faux navigateur (aucun réseau).  Lancer : node --test sfu-client.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC = path.join(__dirname, 'sfu-client.js');

function load(api) {
    const pcs = [];
    class FakePC {
        constructor(cfg) { this.cfg = cfg; this.iceGatheringState = 'complete'; this.connectionState = 'connected';
            this.transceivers = []; this.listeners = {}; pcs.push(this); }
        addEventListener() {} removeEventListener() {}
        addTransceiver(track, init) { const t = { mid: String(this.transceivers.length), track, init }; this.transceivers.push(t); return t; }
        async createOffer() { return { type: 'offer', sdp: 'OFFER' }; }
        async createAnswer() { return { type: 'answer', sdp: 'ANSWER' }; }
        async setLocalDescription(d) { this.localDescription = d; }
        async setRemoteDescription(d) { this.remote = d; }
        close() { this.closed = true; }
    }
    class FakeMS { constructor() { this.tracks = []; } addTrack(t) { this.tracks.push(t); } }
    const ctx = { window: {}, RTCPeerConnection: FakePC, MediaStream: FakeMS, apiCall: api, setTimeout, clearTimeout, console, Promise, Object, Array, Date, Error, encodeURIComponent };
    vm.createContext(ctx);
    vm.runInContext(fs.readFileSync(SRC, 'utf8'), ctx);
    return { sfu: ctx.window.EvcSfu, pcs };
}

const local = { getVideoTracks: () => [{ kind: 'video' }], getAudioTracks: () => [{ kind: 'audio' }] };

test('publish : simulcast f/h/q, pistes video+audio, réponse appliquée', async () => {
    const calls = [];
    const { sfu, pcs } = load(async (p, o) => {
        calls.push([p, o && o.method, o && o.body && JSON.parse(o.body)]);
        if (p === '/turn/credentials') return { iceServers: [{ urls: 'turn:x' }], iceTransportPolicy: 'relay', relay: true };
        if (p === '/sfu/config') return { enabled: true, simulcast: true };
        if (p === '/sfu/session') return { sessionId: 'S1' };
        if (p === '/sfu/publish') return { sessionDescription: { type: 'answer', sdp: 'SFU' } };
        return { ok: true };
    });
    const h = await sfu.publish(local, 'live1');
    assert.equal(pcs[0].cfg.iceTransportPolicy, 'relay');
    assert.equal(JSON.stringify(pcs[0].transceivers[0].init.sendEncodings.map(e => e.rid)), '["q","h","f"]');
    assert.equal(pcs[0].transceivers[0].init.direction, 'sendonly');
    const pub = calls.find(c => c[0] === '/sfu/publish')[2];
    assert.equal(JSON.stringify(pub.tracks), JSON.stringify([{ mid: '0', trackName: 'video' }, { mid: '1', trackName: 'audio' }]));
    assert.equal(pub.sessionDescription.type, 'offer');
    assert.equal(pcs[0].remote.sdp, 'SFU');
    h.close();
    assert.ok(pcs[0].closed);
    assert.ok(calls.some(c => c[0] === '/sfu/close' && c[2].sessionId === 'S1'));
});

test('publish : un seul flux (sans simulcast) et SFU désactivé -> null', async () => {
    let enabled = true;
    const { sfu, pcs } = load(async p => {
        if (p === '/turn/credentials') return { iceServers: [{ urls: 'turn:x' }], iceTransportPolicy: 'relay', relay: true };
        if (p === '/sfu/config') return { enabled, simulcast: false };
        if (p === '/sfu/session') return { sessionId: 'S2' };
        return { sessionDescription: { type: 'answer', sdp: 'SFU' } };
    });
    await sfu.publish(local, 'live1');
    assert.equal(pcs[0].transceivers[0].init.sendEncodings.length, 1);
    const off = load(async p => p === '/sfu/config' ? { enabled: false } : { iceServers: [] });
    assert.equal(await off.sfu.publish(local, 'x'), null);
});

test('subscribe : réception, flux regroupé, repli quand le live n\'est pas sur le SFU', async () => {
    const seen = [];
    const { sfu, pcs } = load(async (p, o) => {
        if (p === '/turn/credentials') return { iceServers: [], iceTransportPolicy: 'relay', relay: true };
        if (p === '/sfu/config') return { enabled: true, simulcast: true };
        if (p === '/sfu/live/liveA') return { sfu: true, pending: false };
        if (p === '/sfu/live/liveB') return { sfu: false, pending: false };
        if (p === '/sfu/session') return { sessionId: 'SUB' };
        if (p === '/sfu/subscribe') { seen.push(JSON.parse(o.body)); return { sfu: true, sessionDescription: { type: 'offer', sdp: 'OFFER' } }; }
        return { ok: true };
    });
    const streams = [];
    const h = await sfu.subscribe('liveA', { preferredRid: 'h', onStream: s => streams.push(s) });
    assert.ok(h);
    assert.equal(seen[0].preferredRid, 'h');
    assert.equal(pcs[0].localDescription.type, 'answer');
    pcs[0].ontrack({ track: { kind: 'video' } });
    pcs[0].ontrack({ track: { kind: 'audio' } });
    assert.equal(streams[1].tracks.length, 2, 'audio et vidéo dans le même MediaStream');
    assert.equal(h.evcStream, streams[1]);
    assert.equal(await sfu.subscribe('liveB', {}), null, 'live hors SFU -> repli');
});

test('subscribe : échec du SFU -> null (repli) et connexion nettoyée', async () => {
    const { sfu, pcs } = load(async p => {
        if (p === '/turn/credentials') return { iceServers: [], iceTransportPolicy: 'relay', relay: true };
        if (p === '/sfu/config') return { enabled: true, simulcast: false };
        if (p.startsWith('/sfu/live/')) return { sfu: true, pending: false };
        if (p === '/sfu/session') return { sessionId: 'S9' };
        if (p === '/sfu/subscribe') throw new Error('Diffusion indisponible');
        return { ok: true };
    });
    assert.equal(await sfu.subscribe('liveA', {}), null);
    assert.ok(pcs[0].closed);
});
