// ============================================================
// E-VISIOCAM - Client de diffusion (Cloudflare Realtime SFU + TURN)
// ------------------------------------------------------------
// À charger APRÈS auth-api.js (utilise apiCall).
//
//   EvcSfu.loadConfig()                    -> { rtc, relay, sfu }
//   EvcSfu.publish(stream, streamId)       -> handle | null
//   EvcSfu.subscribe(streamId, options)    -> handle | null
//
// null = SFU indisponible : l'appelant garde l'ancien mode (une connexion
// par spectateur), qui continue de fonctionner. Un handle expose close().
// ============================================================
(function () {
    'use strict';

    var CONFIG_MAX_AGE_MS = 6 * 60 * 60 * 1000;   // identifiants TURN valables 24 h côté serveur
    var cache = null;                              // { at, value }
    var pending = null;

    var SIMULCAST = [
        { rid: 'q', scaleResolutionDownBy: 4, maxBitrate: 150000 },
        { rid: 'h', scaleResolutionDownBy: 2, maxBitrate: 450000 },
        { rid: 'f', maxBitrate: 1200000 }
    ];
    var SINGLE = [{ maxBitrate: 1000000 }];

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function post(path, body) { return apiCall(path, { method: 'POST', body: JSON.stringify(body || {}) }); }

    // ---------- configuration (TURN + SFU) ----------
    async function fetchConfig() {
        var rtc = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], iceTransportPolicy: 'all' };
        var relay = false;
        try {
            var t = await apiCall('/turn/credentials');
            if (t && Array.isArray(t.iceServers) && t.iceServers.length) {
                rtc = { iceServers: t.iceServers, iceTransportPolicy: t.iceTransportPolicy || 'all' };
                relay = !!t.relay;
            }
        } catch (e) { /* on garde le STUN seul */ }
        var sfu = { enabled: false, simulcast: false };
        try { sfu = await apiCall('/sfu/config'); } catch (e) { /* SFU indisponible */ }
        return { rtc: rtc, relay: relay, sfu: sfu };
    }

    function loadConfig() {
        if (cache && Date.now() - cache.at < CONFIG_MAX_AGE_MS) return Promise.resolve(cache.value);
        if (!pending) {
            pending = fetchConfig().then(function (v) { cache = { at: Date.now(), value: v }; return v; })
                .finally(function () { pending = null; });
        }
        return pending;
    }

    // ---------- utilitaires WebRTC ----------
    function waitIce(pc, ms) {
        return new Promise(function (resolve) {
            if (pc.iceGatheringState === 'complete') return resolve();
            var timer = setTimeout(done, ms || 4000);
            function done() { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', check); resolve(); }
            function check() { if (pc.iceGatheringState === 'complete') done(); }
            pc.addEventListener('icegatheringstatechange', check);
        });
    }

    function waitConnected(pc, ms) {
        return new Promise(function (resolve, reject) {
            if (pc.connectionState === 'connected') return resolve();
            var timer = setTimeout(function () { cleanup(); reject(new Error('connexion SFU trop longue')); }, ms || 10000);
            function cleanup() { clearTimeout(timer); pc.removeEventListener('connectionstatechange', check); }
            function check() {
                if (pc.connectionState === 'connected') { cleanup(); resolve(); }
                else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') { cleanup(); reject(new Error('connexion SFU échouée')); }
            }
            pc.addEventListener('connectionstatechange', check);
        });
    }

    function makeHandle(pc) {
        var closed = false;
        var handle = {
            pc: pc,
            sessionId: null,       // renseigné une fois la session créée
            evcStream: null,
            close: function () {
                if (closed) return;
                closed = true;
                try { pc.close(); } catch (e) { /* déjà fermé */ }
                if (handle.sessionId) post('/sfu/close', { sessionId: handle.sessionId }).catch(function () {});
            }
        };
        return handle;
    }

    // ---------- diffuseur : publier caméra + micro ----------
    async function publish(localStream, streamId) {
        var cfg = await loadConfig();
        if (!cfg.sfu || !cfg.sfu.enabled || !localStream) return null;

        var pc = new RTCPeerConnection(cfg.rtc);
        var handle = makeHandle(pc);
        try {
            var session = await post('/sfu/session');
            handle.sessionId = session.sessionId;

            var entries = [];
            var video = localStream.getVideoTracks()[0];
            var audio = localStream.getAudioTracks()[0];
            if (video) {
                entries.push(['video', pc.addTransceiver(video, {
                    direction: 'sendonly',
                    streams: [localStream],
                    sendEncodings: (cfg.sfu.simulcast ? SIMULCAST : SINGLE).map(function (e) { return Object.assign({}, e); })
                })]);
            }
            if (audio) entries.push(['audio', pc.addTransceiver(audio, { direction: 'sendonly', streams: [localStream] })]);
            if (!entries.length) throw new Error('aucune piste à publier');

            var offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await waitIce(pc);

            var body = {
                sessionId: handle.sessionId,
                streamId: streamId,
                sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
                tracks: entries.map(function (e) { return { mid: e[1].mid, trackName: e[0] }; })
            };
            var res = null;
            for (var attempt = 0; attempt < 3; attempt++) {
                try { res = await post('/sfu/publish', body); break; }
                catch (e) {
                    // Le serveur enregistre le live via le socket : on laisse une chance à "live:start" d'arriver.
                    if (attempt < 2 && /appartient/.test(e.message || '')) await sleep(700); else throw e;
                }
            }
            await pc.setRemoteDescription(res.sessionDescription);
            await waitConnected(pc, 10000);
            return handle;
        } catch (err) {
            handle.close();
            throw err;
        }
    }

    // ---------- spectateur : recevoir un live ----------
    // options : { preferredRid:'f'|'h'|'q', onStream:function(MediaStream) }
    async function subscribe(streamId, options) {
        options = options || {};
        var cfg = await loadConfig();
        if (!cfg.sfu || !cfg.sfu.enabled) return null;

        // Le diffuseur publie 1 à 2 s après le démarrage : on patiente au plus ~7 s.
        var ready = false;
        for (var i = 0; i < 5; i++) {
            var info;
            try { info = await apiCall('/sfu/live/' + encodeURIComponent(streamId)); } catch (e) { return null; }
            if (info.sfu) { ready = true; break; }
            if (!info.pending) return null;
            await sleep(1500);
        }
        if (!ready) return null;

        var pc = new RTCPeerConnection(cfg.rtc);
        var handle = makeHandle(pc);
        var media = new MediaStream();
        pc.ontrack = function (ev) {
            media.addTrack(ev.track);
            handle.evcStream = media;
            if (options.onStream) options.onStream(media);
        };
        try {
            var session = await post('/sfu/session');
            handle.sessionId = session.sessionId;

            var sub = await post('/sfu/subscribe', {
                sessionId: handle.sessionId, streamId: streamId, preferredRid: options.preferredRid || 'f'
            });
            if (!sub.sfu) { handle.close(); return null; }

            await pc.setRemoteDescription(sub.sessionDescription);
            var answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await waitIce(pc);
            await apiCall('/sfu/renegotiate', {
                method: 'PUT',
                body: JSON.stringify({ sessionId: handle.sessionId, sessionDescription: { type: 'answer', sdp: pc.localDescription.sdp } })
            });
            await waitConnected(pc, 10000);
            return handle;
        } catch (err) {
            handle.close();
            return null;      // l'appelant se rabat sur la connexion directe
        }
    }

    window.EvcSfu = { loadConfig: loadConfig, publish: publish, subscribe: subscribe };
})();
