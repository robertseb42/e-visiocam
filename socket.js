// ============================================================
// SOCKET.IO - Chat + WebRTC + Caméras par salon + Messagerie privée
// ============================================================
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./database');
const maintenance = require('./maintenance');
const privateLive = require('./private-live');
const { resolveSalon, canAccessSalon, salonRoom, emitToSalon } = require('./salon-security');

const onlineUsers = new Map();
const salonMembers = new Map();
const spamTracker = new Map();
const liveStreams = new Map();

// Exposer globalement pour les routes API
global.liveStreams = liveStreams;
global.onlineUsers = onlineUsers;   // lu par les statistiques du panneau admin

function initializeSocket(httpServer) {
    const io = global.evcIo = new Server(httpServer, {   // global.evcIo : notifications envoyées depuis les routes (demandes de cam)
        // Mêmes origines que l'API ; « credentials » pour que le cookie de session accompagne la connexion
        cors: {
            origin: process.env.NODE_ENV === 'production'
                ? (process.env.ALLOWED_ORIGINS || 'https://robertseb42.github.io,https://www.e-visiocam.com,https://e-visiocam.com').split(',').map(o => o.trim()).filter(Boolean)
                : true,
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 120000,
        pingInterval: 25000,
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        // Les messages Socket.IO ne transportent pas la vidéo (WebRTC/SFU s'en charge).
        // Limite à 1 Mo pour réduire l'exposition aux abus mémoire/DoS.
        maxHttpBufferSize: 1e6,
        connectTimeout: 60000,
        perMessageDeflate: false
    });

    // ═══════════════════════════════════════════════════════════
    // AUTHENTIFICATION
    // ═══════════════════════════════════════════════════════════
    io.use((socket, next) => {
        // Jeton : cookie de session (envoyé avec la connexion), ou ancien jeton passé dans auth
        const fromAuth = socket.handshake.auth && socket.handshake.auth.token;
        const token = (fromAuth && fromAuth !== 'null') ? fromAuth : require('./session').tokenFromHeaders(socket.handshake.headers);
        if (!token) return next(new Error('Token manquant'));
        try {
            if (db.isTokenRevoked(token)) return next(new Error('Token révoqué'));
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            const user = db.getUserById(payload.id);
            if (!user) return next(new Error('Utilisateur introuvable'));
            const sanction = require('./sanctions').etat(user);
            if (sanction.bloque) return next(new Error(require('./sanctions').message(sanction)));
            if (user.status === 'banned') user.status = 'active';   // bannissement temporaire expiré
            if (typeof db.isTokenOutdated === 'function' && db.isTokenOutdated(user, payload.iat)) return next(new Error('Mot de passe réinitialisé'));
            socket.authToken = token;
            if (!maintenance.socketAllowed(user)) return next(new Error('Maintenance'));
            socket.user = user;
            socket.authExpiresAt = payload.exp ? payload.exp * 1000 : null;
            next();
        } catch (err) {
            next(new Error('Token invalide'));
        }
    });

    // ═══════════════════════════════════════════════════════════
    // CONNEXION
    // ═══════════════════════════════════════════════════════════
    const cameraModeration = require('./camera-moderation')({ io, db });
    io.on('connection', (socket) => {
        cameraModeration.attach(socket);
        const user = socket.user;
        // 🛡️ Chaque handler est enveloppé : une exception dans un event (payload absent,
        // type inattendu, erreur SQL…) ne doit JAMAIS faire tomber le processus.
        const rawOn = socket.on.bind(socket);
        const safeOn = (event, fn) => rawOn(event, function (...args) {
            try { return fn.apply(this, args); }
            catch (err) {
                console.error('[socket:' + event + '] ' + (err && err.message ? err.message : err));
                try { socket.emit('error', { message: 'Action impossible pour le moment.' }); } catch (e) {}
            }
        });
        const recompenses = require('./recompenses');
        // 🎁 Récompenses : bonus de bienvenue / du jour à la première connexion de la journée
        try {
            const ipBrute = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim() || socket.handshake.address;
            recompenses.connexion(user.id, ipBrute);
        } catch (e) {}
        const avecInsigne = liste => (liste || []).map(m => Object.assign({}, m, m.role === 'bot' ? { insigne: null, bot: true } : { insigne: recompenses.insigne(m.user_id) }));
        console.log('✅ [Socket] ' + user.username + ' connecté');

        // Plafond de connexions simultanées par membre (page + cloche + onglets) : évite
        // qu'un seul compte ouvre des centaines de sockets (abus mémoire / amplification).
        const MAX_SOCKETS_PAR_MEMBRE = 10;
        let nbSockets = 0;
        onlineUsers.forEach(u => { if (u.id === user.id) nbSockets++; });
        if (nbSockets >= MAX_SOCKETS_PAR_MEMBRE) {
            socket.emit('error', { message: 'Trop de connexions simultanées.' });
            try { socket.disconnect(true); } catch (e) {}
            return;
        }

        onlineUsers.set(socket.id, {
            id: user.id,
            username: user.username,
            role: user.role,
            salon: 'Salon Général',
            streamId: null,
            isCameraOn: false,
            isMicOn: true,
            explicit: false      // vrai dès que la page a choisi un salon (salon:join) : sert à la liste « Dans ce salon »
        });
        // 📊 Statistiques : membre actif aujourd'hui + pic de connectés simultanés
        try { require('./stats').noterPresence(user.id, new Set(Array.from(onlineUsers.values(), u => u.id)).size); } catch (e) {}

        const initialSalon = resolveSalon('general');
        const initialName = initialSalon && canAccessSalon(user, initialSalon.slug) ? initialSalon.name : null;
        onlineUsers.get(socket.id).salon = initialName;
        if (initialName) socket.join(salonRoom(initialName));

        // ═══════════════════════════════════════════════════════════
        // MESSAGERIE PRIVÉE : rejoindre sa room personnelle
        // ═══════════════════════════════════════════════════════════
        socket.join('user:' + user.id);
        console.log('📬 [DM] ' + user.username + ' joignable (user:' + user.id + ')');

        // Live privé encore en cours : l'invité qui se (re)connecte retrouve son invitation
        liveStreams.forEach(st => {
            if (st.isPrivate && st.isBroadcasting && st.invited && st.invited.has(user.id)) socket.emit('live:private-invite', inviteInfo(st));
        });

        // Tout le monde reçoit la liste à jour (sinon un nouvel arrivant n'apparaît pas chez les autres membres)
        io.emit('users:list', getConnectedUsers());
        io.emit('user:joined', { username: user.username, count: onlineUsers.size });
        socket.emit('chat:history', initialName ? avecInsigne(db.getRecentMessages(initialName, 30)) : []);

        // Envoyer le compteur de non-lus au démarrage
        try {
            const unreadCount = db.getTotalUnreadCount(user.id);
            socket.emit('dm:unread-count', { count: unreadCount });
        } catch (e) { console.error('DM unread:', e.message); }

        // Envoyer la liste des streams du salon au nouvel arrivant
        setTimeout(() => {
            const currentSalon = onlineUsers.get(socket.id)?.salon;
            if (socket.connected && currentSalon) sendSalonStreams(socket, currentSalon);
        }, 500);

        // ═══════════════════════════════════════════════════════════
        // SALON : REJOINDRE
        // ═══════════════════════════════════════════════════════════
        safeOn('salon:join', (key, ack) => {
            const salonRow = resolveSalon(key);
            const freshUser = db.getUserById(user.id);
            if (!freshUser || freshUser.status === 'banned' || !salonRow || !canAccessSalon(freshUser, salonRow.slug)) {
                const error = { message: 'Salon indisponible ou accès refusé' };
                socket.emit('salon:error', error);
                if (typeof ack === 'function') ack({ ok: false, ...error });
                return;
            }
            const salon = salonRow.name;
            const userData = onlineUsers.get(socket.id);
            const oldSalon = userData?.salon;
            if (oldSalon && oldSalon !== salon) {
                const oldRoom = salonRoom(oldSalon);
                if (oldRoom) {
                    socket.leave(oldRoom);
                    emitToSalon(io, oldSalon, 'system', { text: user.username + ' a quitté le salon', type: 'leave' });
                }
                if (userData.streamId) stopUserStream(io, socket, userData.streamId, user.username);
            }
            // Ne conserver qu'une seule room de salon (utile après renommage/suppression).
            for (const room of socket.rooms) if (room.startsWith('salon:')) socket.leave(room);
            socket.join(salonRoom(salon));
            if (userData) { userData.salon = salon; userData.explicit = true; }
            socket.emit('chat:history', avecInsigne(db.getRecentMessages(salon, 30)));
            socket.emit('salon:joined', { salon, slug: salonRow.slug });
            if (oldSalon && oldSalon !== salon) diffuserMembres(io, oldSalon);
            diffuserMembres(io, salon);
            sendSalonStreams(socket, salon);
            emitToSalon(io, salon, 'system', { text: user.username + ' a rejoint le salon', type: 'join' });
            try { require('./animateur').arrivee(user, salon); } catch (e) {}   // 🤖 accueil par l'animateur virtuel
            if (typeof ack === 'function') ack({ ok: true, salon });
        });

        safeOn('salon:request-members', () => {
            const userData = onlineUsers.get(socket.id);
            if (userData && userData.salon && socket.rooms.has(salonRoom(userData.salon)))
                socket.emit('salon:members', { salon: userData.salon, users: membresDuSalon(userData.salon) });
        });

        safeOn('salon:request-streams', () => {
            const userData = onlineUsers.get(socket.id);
            const salon = userData?.salon;
            if (salon) sendSalonStreams(socket, salon);
        });

        // ═══════════════════════════════════════════════════════════
        // LIVE : DÉMARRER
        // ═══════════════════════════════════════════════════════════
        safeOn('live:start', (data) => {
            data = data || {};
            const streamId = data.streamId || socket.id;
            const userData = onlineUsers.get(socket.id);
            const row = resolveSalon(data.salon || userData?.salon || 'general');
            const freshUser = db.getUserById(user.id);
            if (typeof streamId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(streamId) ||
                !freshUser || freshUser.status === 'banned' || !row || !canAccessSalon(freshUser, row.slug)) {
                socket.emit('live:error', { message: 'Salon ou identifiant de live non autorisé' });
                return;
            }
            const salon = row.name;

            // Un identifiant déjà pris par quelqu'un d'autre ne peut pas être repris (sinon on remplacerait son live)
            const existant = liveStreams.get(streamId);
            if (existant && existant.broadcasterId !== user.id) {
                socket.emit('live:error', { message: 'Identifiant de live déjà utilisé' });
                return;
            }

            // Un seul live simultané par membre : empêche d'ouvrir une infinité de streams (abus mémoire/CPU).
            if (!existant) {
                let dejaEnLive = false;
                liveStreams.forEach(st => { if (st.broadcasterId === user.id) dejaEnLive = true; });
                if (dejaEnLive) {
                    socket.emit('live:error', { message: 'Vous diffusez déjà un live.' });
                    return;
                }
            }

            // Live privé : visible seulement du diffuseur, des invités et de la modération — dès la première seconde
            const prive = data.private === true;
            const invites = prive ? new Set(privateLive.cleanInvites(data.invited, user.id, id => db.getUserById(id))) : new Set();

            const stream = {
                streamId: streamId,
                broadcasterId: user.id,
                broadcasterUsername: user.username,
                salon: salon,
                isBroadcasting: true,
                isCameraOff: false,
                isMicMuted: false,
                isPrivate: prive,
                invited: invites,
                startedAt: new Date().toISOString(),
                viewers: [],
                // Sockets ayant envoyé une offre WebRTC valide (canWatch vérifié) : seuls eux
                // peuvent recevoir une réponse/ICE du diffuseur. Évite le relais vers un socket arbitraire.
                signalPeers: new Set()
            };
            liveStreams.set(streamId, stream);

            if (userData) {
                userData.streamId = streamId;
                userData.isCameraOn = true;
            }
            diffuserMembres(io, salon);

            try {
                db.db.prepare(`
                    INSERT OR REPLACE INTO salon_streams 
                    (user_id, username, salon, stream_id, is_broadcasting, is_camera_off, is_muted)
                    VALUES (?, ?, ?, ?, 1, 0, 0)
                `).run(user.id, user.username, salon, streamId);
            } catch (e) { console.error('DB:', e.message); }

            try { require('./animateur').liveDemarre(user, salon, prive); } catch (e) {}   // 🤖 annonce du live public
            console.log('🎥 ' + user.username + ' est en live' + (prive ? ' PRIVÉ (' + invites.size + ' invité(s))' : '') + ' dans ' + salon);

            emitStream(io, stream, salon, 'salon:stream-started', {
                streamId: streamId,
                broadcasterId: user.id,
                broadcasterUsername: user.username,
                salon: salon,
                isPrivate: prive
            });

            broadcastSalonStreams(io, salon);

            emitStream(io, stream, null, 'live:started', {
                streamId: streamId,
                broadcasterId: user.id,
                broadcasterUsername: user.username,
                salon: salon,
                isPrivate: prive,
                count: liveStreams.size
            });

            if (prive) {
                invites.forEach(id => io.to('user:' + id).emit('live:private-invite', inviteInfo(stream)));
                socket.emit('live:invited', invitedPayload(stream));
            } else {
                // Les membres qui suivent ce modèle sont prévenus (site + email)
                try { require('./routes/discover').prevenirAbonnes(io, stream); } catch (e) { console.error('Alertes favoris :', e.message); }
            }
        });

        // ═══════════════════════════════════════════════════════════
        // LIVE PRIVÉ : INVITER D'AUTRES MEMBRES (le diffuseur seulement)
        // On peut ajouter des invités en cours de live ; pour en retirer, on termine le live.
        // ═══════════════════════════════════════════════════════════
        safeOn('live:invite', (data) => {
            data = data || {};
            const stream = liveStreams.get(data.streamId);
            if (!stream || stream.broadcasterId !== user.id) return;
            if (!stream.isPrivate) {
                socket.emit('live:error', { message: 'Ce live est public : tout le monde peut déjà le voir' });
                return;
            }
            const nouveaux = privateLive.cleanInvites(data.invited, user.id, id => db.getUserById(id))
                .filter(id => !stream.invited.has(id))
                .slice(0, Math.max(0, privateLive.MAX_INVITES - stream.invited.size));
            nouveaux.forEach(id => {
                stream.invited.add(id);
                io.to('user:' + id).emit('live:private-invite', inviteInfo(stream));
            });
            if (nouveaux.length) broadcastSalonStreams(io, stream.salon);   // la caméra apparaît chez les nouveaux invités
            socket.emit('live:invited', invitedPayload(stream));
        });

        // ═══════════════════════════════════════════════════════════
        // LIVE : ARRÊTER
        // ═══════════════════════════════════════════════════════════
        safeOn('live:stop', (data) => {
            const streamId = data.streamId || socket.id;
            const userData = onlineUsers.get(socket.id);
            const stream = liveStreams.get(streamId);
            if (stream && stream.broadcasterId !== user.id) return;   // seul le diffuseur arrête son live
            const salon = stream?.salon || userData?.salon || 'Salon Général';
            stopUserStream(io, socket, streamId, user.username, salon);
        });

        // ═══════════════════════════════════════════════════════════
        // LIVE : CAMÉRA / MICRO
        // ═══════════════════════════════════════════════════════════
        safeOn('live:camera-toggle', (data) => {
            const streamId = data.streamId || socket.id;
            const stream = liveStreams.get(streamId);
            const userData = onlineUsers.get(socket.id);

            if (stream && stream.broadcasterId === user.id) {   // seul le diffuseur règle sa caméra et son micro
                stream.isCameraOff = !stream.isCameraOff;
                if (userData) userData.isCameraOn = !stream.isCameraOff;

                try {
                    db.db.prepare('UPDATE salon_streams SET is_camera_off = ? WHERE stream_id = ?')
                        .run(stream.isCameraOff ? 1 : 0, streamId);
                } catch (e) {}

                emitStream(io, stream, stream.salon, 'salon:stream-updated', {
                    streamId: streamId,
                    isCameraOff: stream.isCameraOff,
                    isMicMuted: stream.isMicMuted
                });
                socket.emit('live:camera-toggled', { isCameraOff: stream.isCameraOff });
                broadcastSalonStreams(io, stream.salon);

                console.log('📷 ' + user.username + ' caméra ' + (stream.isCameraOff ? 'masquée' : 'affichée'));
            }
        });

        safeOn('live:mic-toggle', (data) => {
            const streamId = data.streamId || socket.id;
            const stream = liveStreams.get(streamId);
            const userData = onlineUsers.get(socket.id);

            if (stream && stream.broadcasterId === user.id) {   // seul le diffuseur règle sa caméra et son micro
                stream.isMicMuted = !stream.isMicMuted;
                if (userData) userData.isMicOn = !stream.isMicMuted;

                try {
                    db.db.prepare('UPDATE salon_streams SET is_muted = ? WHERE stream_id = ?')
                        .run(stream.isMicMuted ? 1 : 0, streamId);
                } catch (e) {}

                emitStream(io, stream, stream.salon, 'salon:stream-updated', {
                    streamId: streamId,
                    isCameraOff: stream.isCameraOff,
                    isMicMuted: stream.isMicMuted
                });
                socket.emit('live:mic-toggled', { isMicMuted: stream.isMicMuted });
                broadcastSalonStreams(io, stream.salon);

                console.log('🎤 ' + user.username + ' micro ' + (stream.isMicMuted ? 'coupé' : 'activé'));
            }
        });

        // ═══════════════════════════════════════════════════════════
        // LIVE : REJOINDRE / QUITTER
        // ═══════════════════════════════════════════════════════════
        safeOn('live:join', (data) => {
            const streamId = data.streamId;
            const stream = liveStreams.get(streamId);

            if (!stream) {
                socket.emit('live:error', { message: 'Stream introuvable' });
                return;
            }
            if (!privateLive.canWatch(stream, user)) {
                socket.emit('live:error', { message: 'Ce live est privé : vous n\'êtes pas invité' });
                return;
            }

            if (!stream.viewers.includes(socket.id)) {
                stream.viewers.push(socket.id);
            }
            socket.join('stream:' + streamId);
            socket.emit('live:joined', {
                streamId: streamId,
                broadcasterUsername: stream.broadcasterUsername
            });

            console.log('👁️ ' + user.username + ' regarde le live de ' + stream.broadcasterUsername);
            io.to(streamId).emit('live:viewer-count', { count: stream.viewers.length });
            broadcastSalonStreams(io, stream.salon);
        });

        safeOn('live:leave', (data) => {
            const streamId = data.streamId;
            const stream = liveStreams.get(streamId);
            if (stream) {
                stream.viewers = stream.viewers.filter(id => id !== socket.id);
                if (stream.signalPeers) stream.signalPeers.delete(socket.id);
                socket.leave('stream:' + streamId);
                io.to(streamId).emit('live:viewer-count', { count: stream.viewers.length });
                broadcastSalonStreams(io, stream.salon);
            }
        });

        // ═══════════════════════════════════════════════════════════
        // WEBRTC SIGNALING
        // ═══════════════════════════════════════════════════════════
        // 🔒 Spectateur → diffuseur. La cible (diffuseur) est résolue par le SERVEUR à partir
        // du streamId, jamais fournie par le client. Le flag « modérateur » est aussi calculé
        // serveur (rôle), pas accepté depuis le client.
        safeOn('webrtc:offer', (data) => {
            data = data || {};
            const stream = liveStreams.get(data.streamId);
            if (stream && privateLive.canWatch(stream, user)) {   // live privé : pas d'invitation, pas de connexion vidéo
                if (!stream.signalPeers) stream.signalPeers = new Set();
                stream.signalPeers.add(socket.id);   // ce spectateur devient une cible légitime pour le diffuseur
                const broadcasterSocketId = getSocketIdByUserId(stream.broadcasterId);
                if (broadcasterSocketId) {
                    io.to(broadcasterSocketId).emit('webrtc:offer', {
                        offer: data.offer,
                        viewerId: user.id,
                        viewerUsername: user.username,
                        viewerSocketId: socket.id,
                        streamId: data.streamId,
                        isModerator: ['moderator', 'super_admin'].includes(user.role)
                    });
                }
            }
        });

        // 🔒 Diffuseur → spectateur. On n'accepte la réponse que si l'émetteur EST le diffuseur
        // de ce stream ET que la cible est bien l'un de ses spectateurs enregistrés.
        safeOn('webrtc:answer', (data) => {
            data = data || {};
            const stream = liveStreams.get(data.streamId);
            if (!stream || stream.broadcasterId !== user.id) return;
            const connu = typeof data.viewerSocketId === 'string' &&
                ((stream.signalPeers && stream.signalPeers.has(data.viewerSocketId)) || stream.viewers.includes(data.viewerSocketId));
            if (!connu) return;
            io.to(data.viewerSocketId).emit('webrtc:answer', {
                answer: data.answer,
                streamId: data.streamId
            });
        });

        // 🔒 Candidats ICE : la cible est validée des deux côtés (diffuseur ↔ ses spectateurs),
        // jamais relayée à un socket arbitraire ou à une room entière.
        safeOn('webrtc:ice-candidate', (data) => {
            data = data || {};
            const stream = liveStreams.get(data.streamId);
            if (!stream) return;
            if (data.targetSocketId) {
                // Seul le diffuseur peut viser un spectateur, et uniquement l'un des siens.
                if (stream.broadcasterId !== user.id) return;
                const connu = typeof data.targetSocketId === 'string' &&
                    ((stream.signalPeers && stream.signalPeers.has(data.targetSocketId)) || stream.viewers.includes(data.targetSocketId));
                if (!connu) return;
                io.to(data.targetSocketId).emit('webrtc:ice-candidate', {
                    candidate: data.candidate,
                    fromSocketId: socket.id,
                    streamId: data.streamId
                });
            } else {
                // Spectateur → diffuseur : la cible (diffuseur) est résolue serveur.
                if (!privateLive.canWatch(stream, user)) return;
                const broadcasterSocketId = getSocketIdByUserId(stream.broadcasterId);
                if (broadcasterSocketId) {
                    io.to(broadcasterSocketId).emit('webrtc:ice-candidate', {
                        candidate: data.candidate,
                        fromSocketId: socket.id,
                        streamId: data.streamId
                    });
                }
            }
        });

        // ═══════════════════════════════════════════════════════════
        // CHAT PUBLIC (salon)
        // ═══════════════════════════════════════════════════════════
        safeOn('chat:message', (data) => {
            try {
                let text = String((data && data.text) || '').trim().substring(0, 500);
                if (!text) return;
                if (isSpamming(socket.id)) {
                    socket.emit('error', { message: 'Trop de messages, ralentissez.' });
                    return;
                }
                const current = resolveSalon(onlineUsers.get(socket.id)?.salon);
                const requested = data.salon === undefined ? current : resolveSalon(data.salon);
                const freshUser = db.getUserById(user.id);
                if (!freshUser || freshUser.status === 'banned' || !current || !requested || current.id !== requested.id ||
                    !socket.rooms.has(salonRoom(current.slug)) || !canAccessSalon(freshUser, current.slug)) return;
                // 🔇 Membre rendu muet par la modération
                const sanction = require('./sanctions').etat(freshUser);
                if (sanction.muet) {
                    socket.emit('salon:error', { message: 'Vous ne pouvez pas écrire pour le moment (sanction de la modération).' });
                    return;
                }
                // 🚫 Filtre automatique des mots interdits
                const filtre = require('./filtre-mots').controler(freshUser, text, 'salon ' + current.name);
                if (!filtre.ok) { socket.emit('salon:error', { message: filtre.message }); return; }
                text = filtre.texte;
                const salon = current.name;
                const stmt = db.db.prepare('INSERT INTO chat_messages (user_id, salon, text) VALUES (?, ?, ?)');
                const result = stmt.run(user.id, salon, text);
                recompenses.activite(user.id);
                emitToSalon(io, salon, 'chat:message', {
                    id: result.lastInsertRowid,
                    user_id: user.id,
                    username: user.username,
                    role: user.role,
                    insigne: recompenses.insigne(user.id),
                    salon: salon,
                    text: text,
                    created_at: new Date().toISOString()
                });
                try { require('./animateur').message(user, salon, text); } catch (e) {}   // 🤖 quiz et commandes de l'animateur
            } catch (err) { console.error('Erreur message:', err); }
        });

        safeOn('reaction', (data = {}) => {
            const salon = onlineUsers.get(socket.id)?.salon;
            const freshUser = db.getUserById(user.id);
            const emoji = data && data.emoji;
            if (!freshUser || freshUser.status === 'banned' || !canAccessSalon(freshUser, salon) || isSpamming(socket.id)) return;
            if (!['❤️', '❤', '🔥', '😍', '👏', '😂', '👍', '🎉', '💖', '😘', '💯'].includes(emoji)) return;
            recompenses.activite(user.id);
            emitToSalon(io, salon, 'reaction', { username: user.username, emoji });
        });

        // 🧠 Quiz de l'animateur : réponse par bouton (une tentative par membre)
        safeOn('quiz:repondre', (d = {}) => {
            const salon = onlineUsers.get(socket.id)?.salon;
            const fresh = db.getUserById(user.id);
            if (!fresh || fresh.status === 'banned' || !salon || !canAccessSalon(fresh, salon) || isSpamming(socket.id)) return;
            try { require('./animateur').repondre(fresh, salon, String(d.id || '').slice(0, 40), Number(d.choix), socket); } catch (e) {}
        });

        // Les cadeaux sont publiés uniquement par POST /api/credits/gifts/send
        // après validation et débit. Les anciens clients ne peuvent plus les fabriquer.
        safeOn('gift', () => {});

        // ═══════════════════════════════════════════════════════════
        // MESSAGERIE PRIVÉE (DM)
        // ═══════════════════════════════════════════════════════════
        safeOn('dm:send', (data) => {
            try {
                const { conversationId, content } = data || {};
                if (!conversationId || !content || !content.trim()) return;
                // Anti-flood : même limiteur que le chat public (5 messages / 5 s).
                if (isSpamming(socket.id)) {
                    socket.emit('dm:error', { message: 'Trop de messages, ralentissez.' });
                    return;
                }

                const conv = db.getConversationById(conversationId);
                if (!conv) {
                    socket.emit('dm:error', { message: 'Conversation introuvable' });
                    return;
                }
                if (conv.user1_id !== user.id && conv.user2_id !== user.id) {
                    socket.emit('dm:error', { message: 'Accès refusé' });
                    return;
                }

                const fresh = db.getUserById(user.id);
                if (!fresh || require('./sanctions').etat(fresh).muet) {
                    socket.emit('dm:error', { message: 'Vous ne pouvez pas écrire pour le moment (sanction de la modération).' });
                    return;
                }
                const filtre = require('./filtre-mots').controler(fresh, String(content).trim().substring(0, 2000), 'message privé');
                if (!filtre.ok) { socket.emit('dm:error', { message: filtre.message }); return; }
                const message = db.addPrivateMessage(conversationId, user.id, filtre.texte);
                recompenses.activite(user.id);
                message.sender_username = user.username;
                message.sender_role = user.role;

                // Envoyer à l'expéditeur (confirmation)
                socket.emit('dm:message', {
                    conversationId: conversationId,
                    message: message
                });

                // Envoyer à l'autre utilisateur
                const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
                io.to('user:' + otherId).emit('dm:message', {
                    conversationId: conversationId,
                    message: message
                });

                // Envoyer aussi la notif de compteur
                const otherUnread = db.getTotalUnreadCount(otherId);
                io.to('user:' + otherId).emit('dm:unread-count', { count: otherUnread });

                // Log serveur
                console.log('💬 [DM] ' + user.username + ' → conv#' + conversationId);
            } catch (err) {
                console.error('Erreur dm:send:', err);
                socket.emit('dm:error', { message: 'Erreur envoi message' });
            }
        });

        safeOn('dm:typing', (data) => {
            const conv = data && db.getConversationById(data.conversationId);
            if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return;   // seulement ses propres conversations
            const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
            io.to('user:' + otherId).emit('dm:typing', {
                conversationId: data.conversationId,
                username: user.username
            });
        });

        safeOn('dm:read', (data) => {
            const conv = data && db.getConversationById(data.conversationId);
            if (!conv || (conv.user1_id !== user.id && conv.user2_id !== user.id)) return;
            db.markConversationAsRead(data.conversationId, user.id);

            const otherId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
            io.to('user:' + otherId).emit('dm:read', {
                conversationId: data.conversationId,
                readerId: user.id
            });

            // Mettre à jour le compteur pour soi
            const myUnread = db.getTotalUnreadCount(user.id);
            socket.emit('dm:unread-count', { count: myUnread });
        });

        // ═══════════════════════════════════════════════════════════
        // DÉCONNEXION
        // ═══════════════════════════════════════════════════════════
        safeOn('disconnect', () => {
            console.log('❌ [Socket] ' + user.username + ' déconnecté');

            const userData = onlineUsers.get(socket.id);
            if (userData && userData.streamId) {
                stopUserStream(io, socket, userData.streamId, user.username, userData.salon);
            }

            if (userData && salonRoom(userData.salon)) {
                emitToSalon(io, userData.salon, 'system', {
                    text: user.username + ' a quitté le salon',
                    type: 'leave'
                });
            }

            // Retirer ce socket des pairs de signalisation de tous les lives en cours
            liveStreams.forEach(st => { if (st.signalPeers) st.signalPeers.delete(socket.id); });
            spamTracker.delete(socket.id);   // libère l'entrée anti-spam (sinon la Map grossit sans fin)

            onlineUsers.delete(socket.id);
            io.emit('users:list', getConnectedUsers());
            if (userData && userData.salon) diffuserMembres(io, userData.salon);
        });
    });

    return io;
}

// ═══════════════════════════════════════════════════════════
// FONCTIONS UTILITAIRES
// ═══════════════════════════════════════════════════════════

function stopUserStream(io, socket, streamId, username, salon) {
    const stream = liveStreams.get(streamId);
    if (!stream) return;
    // socket peut être absent (arrêt forcé par la modération, diffuseur hors ligne)

    stream.viewers.forEach(viewerSocketId => {
        const viewerSocket = io.sockets.sockets.get(viewerSocketId);
        if (viewerSocket) viewerSocket.emit('live:ended', { streamId: streamId });
    });

    const streamSalon = salon || stream.salon || 'Salon Général';
    liveStreams.delete(streamId);

    try {
        db.db.prepare('UPDATE salon_streams SET is_broadcasting = 0, ended_at = CURRENT_TIMESTAMP WHERE stream_id = ?')
            .run(streamId);
    } catch (e) {}

    const userData = socket ? onlineUsers.get(socket.id) : null;
    if (userData) {
        userData.streamId = null;
        userData.isCameraOn = false;
    }

    emitStream(io, stream, streamSalon, 'salon:stream-stopped', {
        streamId: streamId,
        broadcasterUsername: username
    });

    emitStream(io, stream, null, 'live:stopped', {
        streamId: streamId,
        broadcasterUsername: username
    });

    broadcastSalonStreams(io, streamSalon);
    diffuserMembres(io, streamSalon);
    console.log('⏹️ ' + username + ' a arrêté son live');
}

function listItem(stream) {
    return {
        streamId: stream.streamId,
        broadcasterId: stream.broadcasterId,
        broadcasterUsername: stream.broadcasterUsername,
        isCameraOff: stream.isCameraOff,
        isMicMuted: stream.isMicMuted,
        isPrivate: !!stream.isPrivate,
        viewers: stream.viewers.length,
        startedAt: stream.startedAt
    };
}

// Les lives d'un salon que CE membre a le droit de voir (les lives privés ne sont listés que pour les autorisés)
function streamsFor(salon, user) {
    const streams = [];
    liveStreams.forEach((stream) => {
        if (stream.salon === salon && stream.isBroadcasting && privateLive.canWatch(stream, user)) streams.push(listItem(stream));
    });
    return streams;
}

function sendSalonStreams(socket, salon) {
    socket.emit('salon:streams-list', { salon: salon, streams: streamsFor(salon, db.getUserById(socket.user.id)) });
}

function broadcastSalonStreams(io, salon) {
    const room = salonRoom(salon);
    const members = room && io.sockets.adapter.rooms.get(room);
    if (!members) return;
    for (const id of members) {
        const socket = io.sockets.sockets.get(id);
        if (socket) sendSalonStreams(socket, salon);
    }
}

// Les annonces respectent aussi le caractère privé/masqué du salon.
function emitStream(io, stream, room, event, payload) {
    for (const socket of io.sockets.sockets.values()) {
        if (room && !socket.rooms.has(salonRoom(room))) continue;
        const freshUser = db.getUserById(socket.user.id);
        if (freshUser && freshUser.status !== 'banned' && privateLive.canWatch(stream, freshUser)) socket.emit(event, payload);
    }
}

const inviteInfo = stream => ({
    streamId: stream.streamId,
    broadcasterId: stream.broadcasterId,
    broadcasterUsername: stream.broadcasterUsername,
    salon: stream.salon
});

// Liste des invités (avec leur pseudo) renvoyée au diffuseur
function invitedPayload(stream) {
    const invited = [];
    stream.invited.forEach(id => {
        let u = null;
        try { u = db.getUserById(id); } catch (e) {}
        invited.push({ id: id, username: u ? u.username : String(id) });
    });
    return { streamId: stream.streamId, invited: invited, max: privateLive.MAX_INVITES };
}

function isSpamming(socketId) {
    const now = Date.now();
    const times = spamTracker.get(socketId) || [];
    const recent = times.filter(t => now - t < 5000);
    recent.push(now);
    spamTracker.set(socketId, recent);
    return recent.length > 5;
}

function getConnectedUsers() {
    const map = new Map();
    onlineUsers.forEach(u => {
        const st = u.streamId ? liveStreams.get(u.streamId) : null;
        const cache = !!(st && st.isPrivate);   // un live privé n'apparaît pas dans la liste des membres
        // Un membre peut avoir plusieurs connexions (page + cloche) : on garde celle qui diffuse
        if (map.has(u.id) && (!u.streamId || cache)) return;
        map.set(u.id, {
            id: u.id,
            username: u.username,
            role: u.role,
            streamId: cache ? null : u.streamId,
            isCameraOn: cache ? false : u.isCameraOn
        });
    });
    return Array.from(map.values());
}

// Membres présents dans un salon : ceux dont la page a rejoint ce salon, plus ceux qui y diffusent.
// (La connexion de la cloche, ouverte sur toutes les pages, ne compte pas.)
function membresDuSalon(salon) {
    const map = new Map();
    onlineUsers.forEach(u => {
        const st = u.streamId ? liveStreams.get(u.streamId) : null;
        const diffuseIci = !!(st && st.salon === salon && !st.isPrivate);
        if (!(u.explicit && u.salon === salon) && !diffuseIci) return;
        const deja = map.get(u.id);
        if (deja && deja.streamId) return;
        map.set(u.id, { id: u.id, username: u.username, role: u.role, insigne: require('./recompenses').insigne(u.id),
            avatar: require('./routes/avatars').url(u.id),
            streamId: diffuseIci ? u.streamId : null, isCameraOn: diffuseIci ? !!u.isCameraOn : false });
    });
    return Array.from(map.values()).sort((a, b) => (!!b.streamId - !!a.streamId) || a.username.localeCompare(b.username, 'fr'));
}

function diffuserMembres(io, salon) {
    if (!io || !salon) return;
    try {
        const room = salonRoom(salon);
        if (room) io.to(room).emit('salon:members', { salon, users: membresDuSalon(salon) });
    } catch (e) { console.error('salon:members', e.message); }
}

function getSocketIdByUserId(userId) {
    let found = null;
    onlineUsers.forEach((u, socketId) => {
        if (u.id === userId) found = socketId;
    });
    return found;
}

// Arrêt forcé d'un live par la modération : prévient le diffuseur (qui coupe sa caméra/SFU),
// puis démonte réellement le stream (retrait de liveStreams, notification des spectateurs, MAJ base).
function forceStopStream(streamId, reason, moderatorName) {
    const io = global.evcIo;
    if (!io) return false;
    const stream = liveStreams.get(streamId);
    if (!stream) return false;
    const broadcasterSocketId = getSocketIdByUserId(stream.broadcasterId);
    const broadcasterSocket = broadcasterSocketId ? io.sockets.sockets.get(broadcasterSocketId) : null;
    if (broadcasterSocket) {
        broadcasterSocket.emit('live:force-stopped', { reason: reason, moderator: moderatorName, streamId: streamId });
    }
    stopUserStream(io, broadcasterSocket, streamId, stream.broadcasterUsername, stream.salon);
    return true;
}

module.exports = { initializeSocket, forceStopStream };
