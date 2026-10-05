'use strict';

// Le navigateur peut envoyer un nom historique ou un slug, jamais une room interne.
function resolveSalon(key) {
    if (typeof key !== 'string' || !key.trim() || key.length > 100) return null;
    return require('./routes/salons').resolveSalon(key.trim());
}
function canAccessSalon(user, key) {
    const salon = resolveSalon(key);
    return !!salon && require('./routes/salons').canEnter(user, salon.slug);
}
function salonRoom(key) {
    const salon = resolveSalon(key);
    return salon ? 'salon:' + salon.id : null;
}
function emitToSalon(io, key, event, payload) {
    const room = salonRoom(key);
    if (!room) return;
    const database = require('./database');
    for (const socket of io.sockets.sockets.values()) {
        if (!socket.rooms.has(room)) continue;
        const user = database.getUserById(socket.user.id);
        if (!user || user.status === 'banned' || !canAccessSalon(user, key)) {
            socket.leave(room);
            continue;
        }
        socket.emit(event, payload);
    }
}
module.exports = { resolveSalon, canAccessSalon, salonRoom, emitToSalon };
