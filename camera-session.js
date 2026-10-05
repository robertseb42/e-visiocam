// ============================================================
// E-VISIOCAM — CAMÉRA PERSISTANTE (même principe que la radio)
// ------------------------------------------------------------
// Chargé UNIQUEMENT dans app-shell.html (la fenêtre qui ne se recharge jamais).
// La caméra, la connexion socket du diffuseur, les connexions WebRTC des spectateurs
// et la publication SFU vivent ici : changer de page (En direct → Salons → MP)
// ne coupe plus rien.
//
// Arrêt uniquement : bouton « Arrêter la caméra », déconnexion, ou fermeture de l'appli.
//
// Les pages (dans l'iframe) utilisent : window.top.EvcCamSession
//   .start()              -> MediaStream (réutilise le flux existant)
//   .stop()
//   .startBroadcast(opts) -> streamId     opts : { private, invited, names, salon }
//   .stopBroadcast()
//   .toggleCamera() / .toggleMic()  -> état
//   .invite(ids, names)
//   .getState()
// Et reçoivent l'événement window « evc:cam » (detail.type : state | log | invited | error)
// ============================================================
(function () {
    'use strict';
    if (window.EvcCamSession) return;

    var SOCKET_URL = 'https://api.e-visiocam.com';
    var CONTRAINTES = { video: { width: 1280, height: 720 }, audio: true };

    var stream = null;
    var socket = null;
    var demarrage = null;          // getUserMedia en cours
    var broadcasting = false;
    var streamId = null;
    var options = null;            // options du live en cours (privé, invités, salon)
    var cameraOff = false;
    var micMuted = false;
    var invited = [];
    var names = {};
    var peers = {};                // viewerSocketId -> RTCPeerConnection
    var sfu = null;                // publication SFU
    var reprendreLive = false;     // le socket a sauté pendant un live : on relance au retour
    var recuperation = null;

    // ---------- communication avec la page affichée ----------
    function pageWin() {
        try { var f = document.getElementById('evcPage'); return f && f.contentWindow; } catch (e) { return null; }
    }
    function notifier(type, data) {
        var w = pageWin();
        if (!w) return;
        try {
            var detail = { type: type };
            if (data) Object.keys(data).forEach(function (k) { detail[k] = data[k]; });
            w.dispatchEvent(new w.CustomEvent('evc:cam', { detail: detail }));
        } catch (e) { /* page en cours de chargement */ }
    }
    function log(msg) { notifier('log', { message: msg }); }
    function getState() {
        return {
            active: !!stream,
            stream: stream,
            broadcasting: broadcasting,
            streamId: streamId,
            cameraOff: cameraOff,
            micMuted: micMuted,
            prive: !!(options && options.private),
            salon: options && options.salon || null,
            invited: invited.slice(),
            names: Object.assign({}, names)
        };
    }
    function changement() { notifier('state', getState()); }

    // ---------- configuration ICE (TURN Cloudflare) ----------
    function rtcConfig() {
        var defaut = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], iceTransportPolicy: 'all' };
        if (!window.EvcSfu) return Promise.resolve(defaut);
        return EvcSfu.loadConfig().then(function (c) { return (c && c.rtc) || defaut; }).catch(function () { return defaut; });
    }

    // ---------- socket du diffuseur (indépendant des pages) ----------
    function connecter() {
        if (socket) return socket;
        if (typeof io !== 'function') throw new Error('Connexion au serveur indisponible');
        socket = io(SOCKET_URL, {
            withCredentials: true,
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000
        });

        socket.on('connect', function () {
            if (stream) socket.emit('camera:start', { streamId: streamId });
            if (reprendreLive && stream && options) {
                reprendreLive = false;
                log('🔄 Connexion rétablie : reprise du live');
                startBroadcast(options).catch(function (e) { log('❌ Reprise du live : ' + e.message); });
            }
        });

        socket.on('disconnect', function () {
            if (broadcasting) {
                fermerLive(false);
                reprendreLive = true;
                log('⚠️ Connexion perdue : le live reprendra automatiquement');
            }
        });

        // Un spectateur (ou la modération) demande à voir ma caméra
        socket.on('webrtc:offer', repondreSpectateur);

        socket.on('webrtc:ice-candidate', function (d) {
            var pc = d && d.fromSocketId && peers[d.fromSocketId];
            if (pc && d.candidate) pc.addIceCandidate(new RTCIceCandidate(d.candidate)).catch(function () {});
        });

        socket.on('live:invited', function (d) {
            invited = ((d && d.invited) || []).map(function (i) { return i.id; });
            ((d && d.invited) || []).forEach(function (i) { names[i.id] = i.username; });
            notifier('invited', { invited: invited.slice(), names: Object.assign({}, names), list: (d && d.invited) || [] });
            changement();
        });

        socket.on('live:error', function (d) { notifier('error', { message: (d && d.message) || 'Erreur du live' }); });
        return socket;
    }

    function socketPret() {
        var s = connecter();
        if (s.connected) return Promise.resolve(s);
        return new Promise(function (resolve, reject) {
            var t = setTimeout(function () { s.off('connect', ok); reject(new Error('Serveur injoignable')); }, 10000);
            function ok() { clearTimeout(t); resolve(s); }
            s.once('connect', ok);
        });
    }

    async function repondreSpectateur(data) {
        var qui = (data && (data.viewerUsername || data.viewerSocketId)) || '?';
        log('📥 Offre de ' + qui);
        if (data && data.moderation) bandeauSurveillance(data.viewerUsername, data.horsLive);
        try {
            var pc = new RTCPeerConnection(await rtcConfig());
            if (peers[data.viewerSocketId]) { try { peers[data.viewerSocketId].close(); } catch (e) {} }
            peers[data.viewerSocketId] = pc;
            if (stream) stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });
            else log('⚠️ Caméra éteinte : rien à envoyer');

            pc.onicecandidate = function (ev) {
                if (ev.candidate && socket) socket.emit('webrtc:ice-candidate', {
                    candidate: ev.candidate, targetSocketId: data.viewerSocketId, streamId: data.streamId
                });
            };
            pc.onconnectionstatechange = function () {
                if (['disconnected', 'failed', 'closed'].indexOf(pc.connectionState) !== -1 && peers[data.viewerSocketId] === pc) {
                    delete peers[data.viewerSocketId];
                    log('❌ Spectateur parti : ' + qui);
                }
            };
            await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
            var answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('webrtc:answer', { answer: answer, viewerSocketId: data.viewerSocketId, streamId: data.streamId });
            log('📤 Réponse envoyée à ' + qui);
        } catch (err) {
            log('❌ WebRTC : ' + err.message);
            delete peers[data.viewerSocketId];
        }
    }

    // ---------- 🔍 transparence : affiché quelle que soit la page ouverte ----------
    function bandeauSurveillance(nom, horsLive) {
        var el = document.getElementById('bandeauSurveillance');
        if (!el) {
            el = document.createElement('div');
            el.id = 'bandeauSurveillance';
            el.setAttribute('role', 'status');
            el.style.cssText = 'position:fixed;top:calc(14px + env(safe-area-inset-top,0px));left:50%;transform:translateX(-50%);z-index:10000;'
                + 'background:#1c1c20;border:1px solid #ff1680;color:#f5f5f6;font:600 13px Inter,sans-serif;'
                + 'padding:10px 16px;border-radius:12px;box-shadow:0 10px 30px #0006;text-align:center;max-width:calc(100% - 24px)';
            document.body.appendChild(el);
        }
        el.textContent = '🔍 Un membre de l\'équipe regarde votre caméra' + (horsLive ? ' (hors live)' : '') + (nom ? ' — ' + nom : '');
        clearTimeout(bandeauSurveillance.t);
        bandeauSurveillance.t = setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 12000);
    }

    // ---------- caméra ----------
    function surveillerPistes(s) {
        s.getTracks().forEach(function (t) {
            t.addEventListener('ended', function () {
                if (stream !== s) return;
                if (document.hidden) return;          // on réessaiera au retour dans l'appli
                recuperer();
            });
        });
    }

    async function start() {
        if (stream && stream.getTracks().some(function (t) { return t.readyState === 'live'; })) return stream;
        if (demarrage) return demarrage;
        if (stream) { await recuperer(); if (stream) return stream; }
        demarrage = (async function () {
            var s = await navigator.mediaDevices.getUserMedia(CONTRAINTES);
            stream = s;
            cameraOff = false; micMuted = false;
            surveillerPistes(s);
            try { connecter(); } catch (e) { log('⚠️ ' + e.message); }
            if (socket && socket.connected) socket.emit('camera:start', { streamId: streamId });
            log('✅ Caméra activée');
            changement();
            return s;
        })();
        try { return await demarrage; } finally { demarrage = null; }
    }

    function stop() {
        reprendreLive = false;
        if (broadcasting) fermerLive(true);
        if (socket && socket.connected) socket.emit('camera:stop');
        if (stream) stream.getTracks().forEach(function (t) { t.stop(); });
        stream = null;
        cameraOff = false; micMuted = false;
        options = null; invited = []; names = {};
        if (socket) { try { socket.disconnect(); } catch (e) {} socket = null; }
        log('⏹️ Caméra arrêtée');
        changement();
    }

    // iOS coupe la caméra quand l'appli passe en arrière-plan : on la récupère au retour
    async function recuperer() {
        if (!stream || recuperation) return recuperation;
        recuperation = (async function () {
            try {
                var neuf = await navigator.mediaDevices.getUserMedia(CONTRAINTES);
                var ancien = stream;
                neuf.getVideoTracks().forEach(function (t) { t.enabled = !cameraOff; });
                neuf.getAudioTracks().forEach(function (t) { t.enabled = !micMuted; });
                var pcs = Object.keys(peers).map(function (k) { return peers[k]; });
                if (sfu && sfu.pc) pcs.push(sfu.pc);
                pcs.forEach(function (pc) {
                    pc.getSenders().forEach(function (sender) {
                        if (!sender.track) return;
                        var kind = sender.track.kind;
                        var piste = kind === 'video' ? neuf.getVideoTracks()[0] : kind === 'audio' ? neuf.getAudioTracks()[0] : null;
                        if (piste) sender.replaceTrack(piste).catch(function () {});
                    });
                });
                stream = neuf;
                surveillerPistes(neuf);
                ancien.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
                log('🔄 Caméra récupérée');
                changement();
            } catch (e) {
                log('❌ Caméra interrompue : ' + e.message);
                notifier('error', { message: 'La caméra a été interrompue. Relancez-la depuis « En direct ».' });
                stop();
            } finally { recuperation = null; }
        })();
        return recuperation;
    }

    document.addEventListener('visibilitychange', function () {
        if (document.hidden || !stream) return;
        if (stream.getTracks().some(function (t) { return t.readyState === 'ended'; })) recuperer();
        if (socket && !socket.connected) { try { socket.connect(); } catch (e) {} }
    });

    // Fermeture réelle de l'appli / de l'onglet
    window.addEventListener('pagehide', function () {
        if (!stream) return;
        if (broadcasting && socket && socket.connected) socket.emit('live:stop', { streamId: streamId });
        if (socket && socket.connected) socket.emit('camera:stop');
        stream.getTracks().forEach(function (t) { t.stop(); });
    });

    // ---------- live ----------
    async function startBroadcast(opts) {
        if (!stream) throw new Error('Démarre la caméra d\'abord');
        var s = await socketPret();
        options = Object.assign({}, opts || {});
        if (Array.isArray(options.invited)) invited = options.invited.slice();
        if (options.names) Object.keys(options.names).forEach(function (k) { names[k] = options.names[k]; });

        broadcasting = true;
        streamId = s.id;
        var donnees = { streamId: streamId };
        if (options.private) {
            donnees.private = true;
            donnees.invited = invited;
            if (options.salon) donnees.salon = options.salon;
        }
        s.emit('live:start', donnees);
        // Cam masquée / micro coupé avant une reprise : le serveur repart de zéro, on lui redit
        if (cameraOff) s.emit('live:camera-toggle', { streamId: streamId });
        if (micMuted) s.emit('live:mic-toggle', { streamId: streamId });
        publierSfu(streamId);
        log('🔴 En direct !');
        changement();
        return streamId;
    }

    async function publierSfu(id) {
        if (!window.EvcSfu) return;
        try {
            var h = await EvcSfu.publish(stream, id);
            if (!h) { log('ℹ️ SFU non configuré : connexions directes'); return; }
            if (!broadcasting || streamId !== id) { h.close(); return; }
            sfu = h;
            log('📡 Diffusion SFU active');
        } catch (e) { log('⚠️ SFU indisponible (' + e.message + ') : connexions directes'); }
    }

    function fermerLive(prevenir) {
        if (!broadcasting) return;
        broadcasting = false;
        if (prevenir && socket && socket.connected) socket.emit('live:stop', { streamId: streamId });
        if (sfu) { sfu.close(); sfu = null; }
        Object.keys(peers).forEach(function (k) { try { peers[k].close(); } catch (e) {} delete peers[k]; });
        streamId = null;
        changement();
    }

    function stopBroadcast() {
        reprendreLive = false;
        fermerLive(true);
        log('⏹️ Diffusion arrêtée');
    }

    function toggleCamera() {
        if (!stream || !broadcasting) return getState();
        cameraOff = !cameraOff;
        stream.getVideoTracks().forEach(function (t) { t.enabled = !cameraOff; });
        if (socket) socket.emit('live:camera-toggle', { streamId: streamId });
        changement();
        return getState();
    }

    function toggleMic() {
        if (!stream || !broadcasting) return getState();
        micMuted = !micMuted;
        stream.getAudioTracks().forEach(function (t) { t.enabled = !micMuted; });
        if (socket) socket.emit('live:mic-toggle', { streamId: streamId });
        changement();
        return getState();
    }

    function invite(ids, noms) {
        if (noms) Object.keys(noms).forEach(function (k) { names[k] = noms[k]; });
        if (broadcasting && socket && ids && ids.length) socket.emit('live:invite', { streamId: streamId, invited: ids });
    }

    window.EvcCamSession = {
        start: start,
        stop: stop,
        startBroadcast: startBroadcast,
        stopBroadcast: stopBroadcast,
        toggleCamera: toggleCamera,
        toggleMic: toggleMic,
        invite: invite,
        getState: getState
    };
})();
