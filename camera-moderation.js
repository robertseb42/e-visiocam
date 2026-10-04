'use strict';
// Video-only, explicitly consented camera sharing. No public discovery or recording.
const { randomUUID } = require('node:crypto');
const POLICY = 'camera-moderation-v1';
module.exports = function createCameraModeration({ io, db, now = Date.now, sweepMs = 5000 }) {
    const cameras = new Map(), watches = new Map();
    function identity(socket) {
        if (!socket || !socket.connected) return null;
        if (socket.authExpiresAt && socket.authExpiresAt <= now()) return null;
        if (db.isTokenRevoked(socket.authToken || socket.handshake?.auth?.token)) return null;
        const u = db.getUserById(socket.user.id);
        return u && u.status !== 'banned' ? u : null;
    }
    function admin(socket) { return identity(socket)?.role === 'super_admin'; }
    function send(id, event, data) { io.sockets.sockets.get(id)?.emit(event, data); }
    function changed() {
        for (const socket of io.sockets.sockets.values()) if (admin(socket)) socket.emit('camera-mod:changed');
    }
    function log(actor, camera, action, reason) {
        db.logModerationView(actor.id, actor.username, camera.userId, camera.username, camera.id, action, reason);
    }
    function endWatch(w, reason) {
        watches.delete(w.id);
        send(w.ownerSocketId, 'camera-mod:ended', { watchId: w.id, reason });
        send(w.viewerSocketId, 'camera-mod:ended', { watchId: w.id, reason });
    }
    function revoke(camera, reason) {
        cameras.delete(camera.socketId);
        for (const w of [...watches.values()]) if (w.cameraId === camera.id) endWatch(w, reason);
        send(camera.socketId, 'camera-mod:revoked', { cameraId: camera.id, reason });
        changed();
    }
    function validWatch(socket, id) {
        const w = watches.get(id);
        if (!w || (socket.id !== w.ownerSocketId && socket.id !== w.viewerSocketId)) return null;
        const camera = cameras.get(w.ownerSocketId);
        const viewer = io.sockets.sockets.get(w.viewerSocketId);
        const owner = io.sockets.sockets.get(w.ownerSocketId);
        if (!camera || camera.id !== w.cameraId || now() - camera.lastSeen > 40000 || !admin(viewer) || !identity(owner)) {
            endWatch(w, 'Accès terminé'); return null;
        }
        return w;
    }
    function attach(socket) {
        function handle(event, fn) {
            socket.on(event, (data = {}, ack) => {
                const reply = typeof ack === 'function' ? ack : () => {};
                try {
                    if (!identity(socket)) return reply({ ok: false, error: 'Session invalide' });
                    fn(data || {}, reply);
                } catch (err) { reply({ ok: false, error: 'Opération indisponible' }); }
            });
        }
        handle('camera-mod:activate', (d, reply) => {
            if (d.accepted !== true || d.policy !== POLICY) return reply({ ok: false, error: 'Accord requis' });
            const u = identity(socket);
            const camera = { id: randomUUID(), socketId: socket.id, userId: u.id, username: u.username,
                startedAt: new Date(now()).toISOString(), lastSeen: now(), policy: POLICY };
            // Fail closed when the consent audit cannot be written.
            log(u, camera, 'camera_consent', POLICY);
            if (cameras.has(socket.id)) revoke(cameras.get(socket.id), 'Nouvelle activation');
            cameras.set(socket.id, camera);
            reply({ ok: true, cameraId: camera.id }); changed();
        });
        handle('camera-mod:heartbeat', (d, reply) => {
            const camera = cameras.get(socket.id);
            if (!camera || camera.id !== d.cameraId) return reply({ ok: false, error: 'Caméra non autorisée' });
            camera.lastSeen = now(); reply({ ok: true });
        });
        // Revocation always works, even when the token has just expired/revoked.
        socket.on('camera-mod:revoke', () => { const camera = cameras.get(socket.id); if (camera) revoke(camera, 'Caméra arrêtée'); });
        handle('camera-mod:list', (_, reply) => {
            if (!admin(socket)) return reply({ ok: false, error: 'Accès réservé au super administrateur' });
            sweep();
            reply({ ok: true, cameras: [...cameras.values()].map(c => ({ cameraId: c.id, userId: c.userId,
                username: c.username, startedAt: c.startedAt, isBroadcasting: !!global.liveStreams?.get(c.socketId)?.isBroadcasting })) });
        });
        handle('camera-mod:watch', (d, reply) => {
            if (!admin(socket)) return reply({ ok: false, error: 'Accès réservé au super administrateur' });
            sweep();
            const c = [...cameras.values()].find(c => c.id === d.cameraId);
            if (!c || c.socketId === socket.id) return reply({ ok: false, error: 'Caméra indisponible' });
            const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, 250) : '';
            if (!reason) return reply({ ok: false, error: 'Motif requis' });
            log(identity(socket), c, 'camera_watch', reason);
            for (const w of [...watches.values()]) if (w.viewerSocketId === socket.id) endWatch(w, 'Autre caméra sélectionnée');
            const w = { id: randomUUID(), cameraId: c.id, ownerSocketId: c.socketId, viewerSocketId: socket.id };
            watches.set(w.id, w); reply({ ok: true, watchId: w.id, username: c.username });
        });
        handle('camera-mod:signal', (d, reply) => {
            const w = validWatch(socket, d.watchId);
            if (!w) return reply({ ok: false, error: 'Accès refusé' });
            const viewer = socket.id === w.viewerSocketId;
            if (!['offer', 'answer', 'ice'].includes(d.type) || (d.type === 'offer' && !viewer) || (d.type === 'answer' && viewer))
                return reply({ ok: false, error: 'Signal refusé' });
            if (!d.payload || JSON.stringify(d.payload).length > 65536) return reply({ ok: false, error: 'Signal invalide' });
            send(viewer ? w.ownerSocketId : w.viewerSocketId, 'camera-mod:signal', {
                watchId: w.id, cameraId: w.cameraId, type: d.type, payload: d.payload
            }); reply({ ok: true });
        });
        handle('camera-mod:leave', (d, reply) => {
            const w = watches.get(d.watchId);
            if (w && (w.viewerSocketId === socket.id || w.ownerSocketId === socket.id)) endWatch(w, 'Consultation terminée');
            reply({ ok: true });
        });
        handle('camera-mod:stop', (d, reply) => {
            if (!admin(socket)) return reply({ ok: false, error: 'Accès réservé au super administrateur' });
            const c = [...cameras.values()].find(c => c.id === d.cameraId);
            const reason = typeof d.reason === 'string' ? d.reason.trim().slice(0, 250) : '';
            if (!c || !reason) return reply({ ok: false, error: 'Caméra ou motif manquant' });
            log(identity(socket), c, 'camera_stop', reason);
            revoke(c, 'Caméra coupée par le super administrateur : ' + reason); reply({ ok: true });
        });
        socket.on('disconnect', () => {
            const c = cameras.get(socket.id); if (c) revoke(c, 'Déconnexion');
            for (const w of [...watches.values()]) if (w.viewerSocketId === socket.id) endWatch(w, 'Déconnexion');
        });
    }
    function sweep() {
        for (const c of [...cameras.values()]) if (now() - c.lastSeen > 40000 || !identity(io.sockets.sockets.get(c.socketId))) revoke(c, 'Session interrompue');
        for (const w of [...watches.values()]) validWatch(io.sockets.sockets.get(w.viewerSocketId) || { id: w.viewerSocketId }, w.id);
    }
    const timer = setInterval(sweep, sweepMs); timer.unref?.();
    return { attach, sweep, close() { clearInterval(timer); } };
};
