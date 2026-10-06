// ============================================================
// VARIABLES GLOBALES
// ============================================================
var socket = null;
var currentUser = null;
var allReports = [];
var allUsers = [];
var allWords = [];
var reportsFilter = 'pending';
var moderationStreams = [];
var moderationPeerConnections = {};
var currentWatchedStream = null;
var currentWatchedStreamInfo = null;

var rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ============================================================
// TURN
// ============================================================
async function loadTurnCredentials() {
    try {
        var data = await apiCall('/turn/credentials');
        if (data.iceServers && data.iceServers.length > 0) {
            rtcConfig.iceServers = data.iceServers;
            rtcConfig.iceTransportPolicy = data.iceTransportPolicy || 'all';
            var turnCount = 0;
            data.iceServers.forEach(function(s) {
                if (!s.urls) return;
                var urls = Array.isArray(s.urls) ? s.urls : [s.urls];
                urls.forEach(function(u) {
                    if (typeof u === 'string' && u.indexOf('turn') !== -1) turnCount++;
                });
            });
            var el = document.getElementById('turnStatusText');
            if (el) {
                el.textContent = 'actif (' + turnCount + ' serveurs TURN)';
                el.className = 'text-emerald-600 font-bold';
            }
        } else {
            var el2 = document.getElementById('turnStatusText');
            if (el2) {
                el2.textContent = 'STUN seul';
                el2.className = 'text-amber-600 font-bold';
            }
        }
    } catch (err) {
        var el3 = document.getElementById('turnStatusText');
        if (el3) {
            el3.textContent = 'erreur';
            el3.className = 'text-rose-600 font-bold';
        }
    }
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', async function() {
    currentUser = getCurrentUser();
    if (!currentUser) { window.location.href = 'login.html'; return; }

    await loadTurnCredentials();
    initSocket();

    loadStats();
    loadReports();
    loadWords();
    loadUsers();
    loadAllStreams();
    loadViewLogs();
    compterContestations();
    setInterval(compterContestations, 60000);
    document.querySelectorAll('.appeal-filtre').forEach(function (b) {
        b.addEventListener('click', function () { appealStatus = b.dataset.appealStatus; loadAppeals(); });
    });
    if (location.hash === '#contestations') showTab('appeals', document.getElementById('appealsTabBtn'));

    var s = document.getElementById('searchUser');
    if (s) {
        s.addEventListener('input', function(e) {
            renderUsers(e.target.value);
        });
    }

    setInterval(function() {
        var tab = document.getElementById('tab-surveillance');
        if (tab && !tab.classList.contains('hidden')) {
            loadAllStreams();
        }
    }, 10000);
});

// ============================================================
// SOCKET
// ============================================================
function initSocket() {
    socket = io('https://api.e-visiocam.com', {
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true
    });

    socket.on('connect', function() {
        console.log('Socket modérateur connecté :', socket.id);
    });

    socket.on('connect_error', function(err) {
        console.error('Socket erreur :', err.message);
    });

    socket.on('webrtc:answer', function(data) {
        var streamId = data.streamId || currentWatchedStream;
        var pc = moderationPeerConnections[streamId];
        // Réponse sans identifiant : la connexion qui attend encore sa réponse
        if (!data.streamId) Object.keys(moderationPeerConnections).forEach(function(id) {
            var p = moderationPeerConnections[id];
            if (p && p.signalingState === 'have-local-offer') { pc = p; streamId = id; }
        });
        if (!pc) {
            console.warn('Aucune peerConnection pour streamId =', streamId);
            return;
        }
        pc.setRemoteDescription(new RTCSessionDescription(data.answer))
            .then(function() {
                console.log('Réponse WebRTC OK pour', streamId);
                majStatut(streamId, 'Connexion établie');
            })
            .catch(function(err) {
                console.error('setRemoteDescription :', err);
                majStatut(streamId, 'Erreur : ' + err.message);
            });
    });

    socket.on('webrtc:ice-candidate', function(data) {
        var streamId = data.streamId || currentWatchedStream;
        var pc = moderationPeerConnections[streamId];
        if (pc && data.candidate) {
            pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(function() {});
        }
    });

    socket.on('live:stopped', function(data) {
        if (data && vuesMod[data.streamId]) fermerVue(data.streamId, true);
        loadAllStreams();
    });

    socket.on('live:started', function() {
        loadAllStreams();
    });

    // 📷 Une caméra vient de s'allumer ou de s'éteindre (même hors live)
    socket.on('mod:cameras-changees', function() {
        loadAllStreams();
    });
}

// ============================================================
// STATS
// ============================================================
function loadStats() {
    return apiCall('/mod/reports/count').then(function(data) {
        document.getElementById('statPending').innerText = data.pending;
        document.getElementById('statResolved').innerText = data.resolved;
    }).catch(function(err) { console.error(err); });
}

// ============================================================
// SIGNALEMENTS
// ============================================================
function loadReports() {
    var list = document.getElementById('reportsList');
    list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Chargement...</p>';
    return apiCall('/mod/reports?status=' + reportsFilter).then(function(data) {
        allReports = data.reports || [];
        renderReports();
    }).catch(function(err) {
        list.innerHTML = '<p class="text-center text-rose-500 py-8 text-sm">' + err.message + '</p>';
    });
}

function renderReports() {
    var list = document.getElementById('reportsList');
    if (allReports.length === 0) {
        list.innerHTML = '<div class="text-center py-12"><div class="text-5xl mb-3">OK</div><p class="text-sm text-slate-500">Aucun signalement</p></div>';
        return;
    }
    var html = '';
    allReports.forEach(function(r) {
        // 🔒 Tous les champs issus d'un utilisateur sont échappés (XSS stocké possible sinon).
        var cible = r.target_username ? escapeHtml(r.target_username) : ('Utilisateur #' + escapeHtml(r.target_id));
        html += '<div class="border-l-4 border-rose-300 bg-white border border-slate-200 rounded-xl p-4">';
        html += '<div class="flex items-start justify-between gap-4">';
        html += '<div class="flex-1">';
        html += '<div class="flex items-center gap-2 mb-1">';
        if (r.priority >= 4) html += '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">URGENT</span>';
        html += '<span class="text-xs font-bold text-slate-900">' + cible + '</span>';
        html += '<span class="text-[10px] text-slate-400">' + new Date(r.created_at).toLocaleString('fr-FR') + '</span>';
        html += '</div>';
        html += '<p class="text-xs text-slate-600 mb-1"><strong>Raison :</strong> ' + reasonLabel(r.reason) + '</p>';
        if (r.description) html += '<p class="text-xs text-slate-500 italic">"' + escapeHtml(r.description) + '"</p>';
        html += '<p class="text-[10px] text-slate-400 mt-1">Signale par ' + escapeHtml(r.reporter_name || 'Anonyme') + '</p>';
        html += '</div>';
        if (r.status === 'pending') {
            // Pas d'onclick construit en chaîne : data-* + délégation d'événement (voir ci-dessous).
            html += '<button type="button" class="rep-traiter px-3 py-1.5 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-lg whitespace-nowrap"'
                + ' data-rep-id="' + escapeHtml(r.id) + '" data-target-id="' + escapeHtml(r.target_id || 0) + '" data-target-name="' + escapeHtml(r.target_username || '') + '">Traiter</button>';
        } else {
            html += '<span class="text-xs font-bold ' + (r.status === 'resolved' ? 'text-emerald-600' : 'text-slate-500') + '">' + (r.status === 'resolved' ? 'Traite' : 'Ignore') + '</span>';
        }
        html += '</div></div>';
    });
    list.innerHTML = html;
    // Délégation : le bouton « Traiter » lit ses paramètres dans ses data-* (jamais de code dans l'attribut).
    list.querySelectorAll('.rep-traiter').forEach(function(b) {
        b.addEventListener('click', function() {
            openActionModal(Number(b.dataset.repId), Number(b.dataset.targetId) || 0, b.dataset.targetName || '');
        });
    });
}

// Libellé lisible d'une raison (liste blanche miroir du backend) ; valeur inconnue => affichée échappée.
function reasonLabel(reason) {
    var labels = {
        contenu_illegal: 'Contenu illégal',
        mineur: 'Mineur',
        violence: 'Violence',
        harcelement: 'Harcèlement',
        contenu_sexuel_non_consenti: 'Contenu sexuel non consenti',
        spam: 'Spam',
        comportement: 'Comportement',
        autre: 'Autre'
    };
    return labels[reason] || escapeHtml(reason);
}

function filterReports(status, btn) {
    reportsFilter = status;
    document.querySelectorAll('.rep-filter').forEach(function(b) {
        b.classList.remove('bg-rose-500', 'text-white', 'font-bold');
        b.classList.add('bg-slate-100', 'text-slate-600');
    });
    btn.classList.add('bg-rose-500', 'text-white', 'font-bold');
    btn.classList.remove('bg-slate-100', 'text-slate-600');
    loadReports();
}

function openActionModal(reportId, targetId, targetName) {
    var existing = document.getElementById('actionModal');
    if (existing) existing.remove();
    var modal = document.createElement('div');
    modal.id = 'actionModal';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4';
    var html = '<div class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl">';
    html += '<h3 class="text-lg font-extrabold text-slate-900 mb-4 text-center">Traiter le signalement</h3>';
    html += '<p class="text-xs text-slate-500 mb-4 text-center">Contre <strong>' + escapeHtml(targetName || 'Utilisateur #' + targetId) + '</strong></p>';
    window.__nomCibleSignalement = targetName || ('Utilisateur #' + targetId);
    html += '<div class="space-y-2">';
    html += '<button data-mod="applyAction" data-mod-args="' + argsMod(reportId, targetId, 'warn') + '" class="w-full p-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-left font-bold text-sm text-amber-900">Avertir</button>';
    html += '<button data-mod="applyAction" data-mod-args="' + argsMod(reportId, targetId, 'mute') + '" class="w-full p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-left font-bold text-sm text-orange-900">Rendre muet… <span class="font-normal text-xs">(durée au choix)</span></button>';
    html += '<button data-mod="applyAction" data-mod-args="' + argsMod(reportId, targetId, 'kick') + '" class="w-full p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left font-bold text-sm text-rose-900">Expulser (kick)… <span class="font-normal text-xs">(durée au choix)</span></button>';
    html += '<button data-mod="applyAction" data-mod-args="' + argsMod(reportId, targetId, 'ban') + '" class="w-full p-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-left font-bold text-sm text-red-900">Bannir… <span class="font-normal text-xs">(jours ou définitif)</span></button>';
    html += '<button data-mod="applyAction" data-mod-args="' + argsMod(reportId, targetId, 'ignore') + '" class="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left font-bold text-sm text-slate-900">Ignorer</button>';
    html += '</div>';
    html += '<button data-mod="fermerActionModal" class="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">Annuler</button>';
    html += '</div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);
}

function applyAction(reportId, targetId, action) {
    var newStatus = 'resolved';
    var reason = '';
    var promise;
    if (action === 'warn') {
        reason = prompt('Raison :');
        if (reason === null) return;
        promise = apiCall('/mod/users/' + targetId + '/warn', { method: 'POST', body: JSON.stringify({ reason: reason }) });
    } else if (action === 'mute' || action === 'kick' || action === 'ban') {
        // Durée et motif choisis dans la fenêtre de sanction ; le signalement est clos ensuite
        var m0 = document.getElementById('actionModal'); if (m0) m0.remove();
        EvcSanction.ouvrir({ id: targetId, username: window.__nomCibleSignalement || '', type: action, onDone: function () {
            apiCall('/mod/reports/' + reportId + '/handle', { method: 'POST', body: JSON.stringify({ action: action, newStatus: 'resolved' }) })
                .then(loadReports).then(loadStats).catch(function () {});
        } });
        return;
    } else if (action === 'ignore') {
        newStatus = 'ignored';
        promise = Promise.resolve();
    } else {
        return;
    }
    promise.then(function() {
        return apiCall('/mod/reports/' + reportId + '/handle', { method: 'POST', body: JSON.stringify({ action: action, newStatus: newStatus }) });
    }).then(function() {
        var m = document.getElementById('actionModal');
        if (m) m.remove();
        return loadReports();
    }).then(function() {
        return loadStats();
    }).catch(function(err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
        else alert(err.message);
    });
}

// ============================================================
// SURVEILLANCE LIVE
// ============================================================
// ============================================================
// SURVEILLANCE : plusieurs caméras regardées en même temps,
// chacune directement dans sa vignette (mur de surveillance)
// ============================================================
var vuesMod = {};   // streamId -> { pc, video, statut, muet }

function loadAllStreams() {
    return apiCall('/mod/streams/all').then(function(data) {
        moderationStreams = data.streams || [];
        // Une caméra regardée a disparu de la liste : on ferme sa vue
        Object.keys(vuesMod).forEach(function(id) {
            if (!moderationStreams.some(function(s) { return s.streamId === id; })) fermerVue(id, true);
        });
        renderModerationStreams();
        updateModerationStats();
    }).catch(function(err) {
        document.getElementById('modStreamsGrid').innerHTML = '<p class="text-rose-500 col-span-full text-center py-8">' + escapeHtml(err.message) + '</p>';
    });
}

function updateModerationStats() {
    document.getElementById('modStatLive').textContent = moderationStreams.length;
    var viewers = 0, hidden = 0, muted = 0;
    moderationStreams.forEach(function(s) {
        viewers += (s.viewers || 0);
        if (s.isCameraOff) hidden++;
        if (s.isMicMuted) muted++;
    });
    document.getElementById('modStatViewers').textContent = viewers;
    document.getElementById('modStatHidden').textContent = hidden;
    document.getElementById('modStatMuted').textContent = muted;
}

function renderModerationStreams() {
    var grid = document.getElementById('modStreamsGrid');
    // L'ancien grand lecteur n'est plus utilisé : tout se regarde dans les vignettes
    var grand = document.getElementById('activeWatchContainer');
    if (grand) grand.classList.add('hidden');

    if (moderationStreams.length === 0) {
        grid.innerHTML = '<p class="text-slate-400 text-center py-8 col-span-full">Aucune caméra allumée</p>';
        return;
    }
    // Mur compact : environ 5 caméras par ligne sur ordinateur, 2 sur téléphone
    grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(' + (window.innerWidth < 640 ? 150 : 200) + 'px, 1fr))';
    grid.style.gap = '10px';
    var nbVues = Object.keys(vuesMod).length;
    var nonVues = moderationStreams.filter(function(s) { return !vuesMod[s.streamId] && !s.isCameraOff; }).length;
    var barre = '';
    if (nonVues > 1 && nbVues < MAX_VUES_MOD) barre += '<button data-mod="toutVoir" class="text-xs font-bold text-emerald-500 hover:underline"><i class="fa-solid fa-play"></i> Tout voir (' + Math.min(nonVues, MAX_VUES_MOD - nbVues) + ')</button>';
    if (nbVues > 1) barre += '<button data-mod="stopWatching" class="text-xs font-bold text-rose-500 hover:underline"><i class="fa-solid fa-xmark"></i> Fermer les ' + nbVues + ' caméras</button>';
    var html = barre ? '<div class="col-span-full flex justify-end gap-4" style="grid-column:1/-1">' + barre + '</div>' : '';
    moderationStreams.forEach(function(s) {
        var id = s.streamId;
        var v = vuesMod[id];
        var username = s.broadcasterUsername || 'Inconnu';
        var horsLive = s.isBroadcasting === false;
        html += '<div class="bg-slate-900 rounded-xl overflow-hidden shadow-lg' + (v ? ' ring-2 ring-emerald-500' : '') + '" data-carte="' + escapeHtml(id) + '">';
        html += '<div class="relative aspect-video bg-black flex items-center justify-center" data-slot="' + escapeHtml(id) + '">';
        if (!v) {
            html += s.isCameraOff
                ? '<div class="text-white text-center"><i class="fa-solid fa-video-slash text-3xl mb-1"></i><p class="text-xs">Camera masquee</p></div>'
                : '<button data-mod="watchStream" data-mod-args="' + argsMod(id) + '" class="text-slate-500 hover:text-emerald-400 text-center"><i class="fa-solid fa-circle-play text-3xl"></i><p class="text-[10px] mt-1">Voir</p></button>';
        }
        html += horsLive
            ? '<div class="absolute top-2 left-2 z-10 text-white text-[10px] font-bold px-2 py-0.5 rounded-full" style="background:#475569">CAM HORS LIVE</div>'
            : '<div class="absolute top-2 left-2 z-10 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full live-pulse">LIVE</div>';
        if (s.salon) html += '<div class="absolute top-2 right-2 z-10 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">' + escapeHtml(s.salon) + '</div>';
        if (v) {
            html += '<div class="absolute bottom-2 left-2 z-10 flex gap-1">'
                + '<button data-mod="basculerSon" data-mod-args="' + argsMod(id) + '" title="Son" class="w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white text-xs"><i class="fa-solid ' + (v.muet ? 'fa-volume-xmark' : 'fa-volume-high') + '"></i></button>'
                + '<button data-mod="pleinEcran" data-mod-args="' + argsMod(id) + '" title="Plein écran" class="w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white text-xs"><i class="fa-solid fa-expand"></i></button>'
                + '<button data-mod="fermerVue" data-mod-args="' + argsMod(id) + '" title="Fermer" class="w-6 h-6 rounded-full bg-black/60 hover:bg-black/90 text-white text-xs"><i class="fa-solid fa-xmark"></i></button></div>'
                + '<div class="absolute bottom-2 right-2 z-10 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full" data-statut="' + escapeHtml(id) + '">' + escapeHtml(v.statut) + '</div>';
        } else {
            html += '<div class="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">' + (s.viewers || 0) + ' viewers</div>';
        }
        html += '</div>';
        html += '<div class="bg-slate-800 text-white" style="padding:6px 8px 8px">';
        html += '<p class="font-bold text-xs mb-1.5 truncate">' + escapeHtml(username) + '</p>';
        html += '<div class="grid grid-cols-3 gap-1">';
        html += v
            ? '<button data-mod="fermerVue" data-mod-args="' + argsMod(id) + '" class="py-1 text-white text-[10px] font-bold rounded-lg" style="background:#475569">Fermer</button>'
            : '<button data-mod="watchStream" data-mod-args="' + argsMod(id) + '" class="py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg">Voir</button>';
        html += '<button data-mod="forceStopStream" data-mod-args="' + argsMod(id, username) + '" class="py-1 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold rounded-lg">Stop</button>';
        html += '<button data-mod="quickBan" data-mod-args="' + argsMod(username, s.broadcasterId || 0) + '" class="py-1 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg">Ban</button>';
        html += '</div></div></div>';
    });
    grid.innerHTML = html;
    // On replace les vidéos déjà en cours dans leur vignette (elles ne sont pas recréées)
    Object.keys(vuesMod).forEach(function(id) {
        var slot = grid.querySelector('[data-slot="' + CSS.escape(id) + '"]');
        var v = vuesMod[id];
        if (slot && v) { slot.insertBefore(v.video, slot.firstChild); v.video.play().catch(function() {}); }
    });
}

function majStatut(streamId, texte) {
    var v = vuesMod[streamId];
    if (!v) return;
    v.statut = texte;
    var el = document.querySelector('[data-statut="' + CSS.escape(streamId) + '"]');
    if (el) el.textContent = texte;
}
// Ancien nom, gardé pour compatibilité
function updateWatchStatus(text) { if (currentWatchedStream) majStatut(currentWatchedStream, text); }

function watchStream(streamId) {
    if (vuesMod[streamId]) return;
    if (Object.keys(vuesMod).length >= MAX_VUES_MOD) {
        if (typeof showToast === 'function') showToast(MAX_VUES_MOD + ' caméras maximum en même temps : fermez-en une', 'error');
        return;
    }
    var reason = prompt('Raison de la surveillance :', 'Surveillance de routine');
    if (reason === null) return;
    apiCall('/mod/streams/' + streamId + '/watch', { method: 'POST', body: JSON.stringify({ reason: reason }) })
        .then(function(data) { return connectToStream(streamId, data.stream || {}); })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function connectToStream(streamId, streamInfo) {
    fermerVue(streamId, true);
    currentWatchedStream = streamId;
    var video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true;
    video.className = 'absolute inset-0 w-full h-full object-cover';
    var pc = new RTCPeerConnection(rtcConfig);
    moderationPeerConnections[streamId] = pc;
    vuesMod[streamId] = { pc: pc, video: video, statut: 'Connexion…', muet: true };
    renderModerationStreams();

    pc.ontrack = function(event) {
        video.srcObject = event.streams[0] || new MediaStream([event.track]);
        video.play().catch(function() {});
        majStatut(streamId, 'En direct');
    };
    pc.onicecandidate = function(event) {
        if (event.candidate && socket) socket.emit('webrtc:ice-candidate', { candidate: event.candidate, streamId: streamId });
    };
    pc.onconnectionstatechange = function() {
        var etats = { connected: 'En direct', connecting: 'Connexion…', disconnected: 'Coupure…', failed: 'Échec', closed: 'Fermé' };
        majStatut(streamId, etats[pc.connectionState] || pc.connectionState);
    };

    socket.emit('live:join', { streamId: streamId, isModerator: true });
    return pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
        .then(function(offer) { return pc.setLocalDescription(offer).then(function() { return offer; }); })
        .then(function(offer) {
            if (socket) socket.emit('webrtc:offer', { offer: offer, streamId: streamId, isModerator: true });
        });
}

var MAX_VUES_MOD = 12;   // au-delà, le navigateur et la connexion saturent

// Ouvre d'un coup les caméras non regardées (une seule raison demandée, chaque consultation est enregistrée)
function toutVoir() {
    var aOuvrir = moderationStreams.filter(function(s) { return !vuesMod[s.streamId] && !s.isCameraOff; })
        .slice(0, MAX_VUES_MOD - Object.keys(vuesMod).length);
    if (!aOuvrir.length) return;
    var reason = prompt('Raison de la surveillance (' + aOuvrir.length + ' caméras) :', 'Surveillance de routine');
    if (reason === null) return;
    aOuvrir.reduce(function(suite, s) {
        return suite.then(function() {
            return apiCall('/mod/streams/' + s.streamId + '/watch', { method: 'POST', body: JSON.stringify({ reason: reason }) })
                .then(function(data) { return connectToStream(s.streamId, data.stream || {}); })
                .catch(function() {});
        });
    }, Promise.resolve());
}

// Un seul son à la fois : activer le son d'une caméra coupe les autres
function basculerSon(streamId) {
    var cible = vuesMod[streamId];
    if (!cible) return;
    var activer = cible.muet;
    Object.keys(vuesMod).forEach(function(id) {
        var v = vuesMod[id];
        v.muet = id === streamId ? !activer : true;
        v.video.muted = v.muet;
    });
    if (activer) cible.video.play().catch(function() {});
    renderModerationStreams();
}

function pleinEcran(streamId) {
    var slot = document.querySelector('[data-slot="' + CSS.escape(streamId) + '"]');
    if (slot && slot.requestFullscreen) slot.requestFullscreen().catch(function() {});
    else if (vuesMod[streamId] && vuesMod[streamId].video.webkitEnterFullscreen) vuesMod[streamId].video.webkitEnterFullscreen();
}

function fermerVue(streamId, silencieux) {
    var v = vuesMod[streamId];
    if (!v) return;
    if (socket) socket.emit('live:leave', { streamId: streamId });
    try { v.pc.close(); } catch (e) {}
    v.video.srcObject = null;
    if (v.video.parentNode) v.video.parentNode.removeChild(v.video);
    delete vuesMod[streamId];
    delete moderationPeerConnections[streamId];
    if (currentWatchedStream === streamId) currentWatchedStream = null;
    if (!silencieux) renderModerationStreams();
}

// Sans précision : ferme toutes les caméras regardées
function stopWatching(streamId) {
    if (streamId) { fermerVue(streamId); return; }
    Object.keys(vuesMod).forEach(function(id) { fermerVue(id, true); });
    currentWatchedStream = null;
    currentWatchedStreamInfo = null;
    renderModerationStreams();
}

function forceStopStream(streamId, username) {
    var reason = prompt('Raison :', 'Violation des CGU');
    if (reason === null) return;
    if (!confirm('Arreter le live de ' + username + ' ?')) return;
    apiCall('/mod/streams/' + streamId + '/stop', { method: 'POST', body: JSON.stringify({ reason: reason }) })
        .then(function() {
            if (typeof showToast === 'function') showToast('Live arrete', 'warning');
            fermerVue(streamId, true);
            loadAllStreams();
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function quickBan(username, userId) {
    if (!userId) { alert('ID utilisateur introuvable'); return; }
    EvcSanction.ouvrir({ id: userId, username: username, type: 'ban', onDone: loadAllStreams });
}


function loadViewLogs() {
    return apiCall('/mod/view-logs').then(function(data) {
        var logs = data.logs || [];
        var list = document.getElementById('viewLogsList');
        if (logs.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Aucun historique</p>';
            return;
        }
        var html = '';
        logs.forEach(function(l) {
            html += '<div class="flex items-start gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">';
            html += '<div class="flex-1"><p class="text-sm text-slate-900"><strong>' + escapeHtml(l.moderator_username || '?') + '</strong> a surveille <strong>' + escapeHtml(l.target_username || 'N/A') + '</strong></p>';
            html += '<p class="text-xs text-slate-500 mt-0.5">' + escapeHtml(l.reason || 'Sans raison') + '</p>';
            html += '<p class="text-[10px] text-slate-400 mt-1">' + new Date(l.created_at).toLocaleString('fr-FR') + '</p></div>';
            html += '<span class="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-700">' + escapeHtml(l.action || '') + '</span>';
            html += '</div>';
        });
        list.innerHTML = html;
    }).catch(function(err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
    });
}

function loadWords() {
    return apiCall('/mod/banned-words').then(function(data) {
        allWords = data.words || [];
        document.getElementById('statWords').innerText = allWords.length;
        renderWords();
    }).catch(function(err) { console.error(err); });
}

function renderWords() {
    var list = document.getElementById('wordsList');
    var html = '';
    allWords.forEach(function(w) {
        html += '<div class="bg-slate-100 text-slate-700 rounded-xl p-3 flex items-center justify-between">';
        var effet = w.severity <= 2 ? 'masqué' : w.severity === 3 ? 'bloqué' : 'bloqué + muet';
        html += '<div><p class="font-bold text-sm">' + escapeHtml(w.word) + '</p><p class="text-[10px] opacity-70">Gravité ' + w.severity + '/5 · ' + effet + '</p></div>';
        html += '<button data-mod="deleteWord" data-mod-args="' + argsMod(w.word) + '" class="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 flex items-center justify-center text-xs">X</button>';
        html += '</div>';
    });
    list.innerHTML = html;
}

function addWord(e) {
    e.preventDefault();
    var word = document.getElementById('newWord').value.trim();
    var severity = parseInt(document.getElementById('newWordSeverity').value);
    apiCall('/mod/banned-words', { method: 'POST', body: JSON.stringify({ word: word, severity: severity }) })
        .then(function() {
            if (typeof showToast === 'function') showToast('Mot ajoute');
            document.getElementById('newWord').value = '';
            return loadWords();
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function deleteWord(word) {
    if (!confirm('Supprimer "' + word + '" ?')) return;
    apiCall('/mod/banned-words/' + encodeURIComponent(word), { method: 'DELETE' })
        .then(function() {
            if (typeof showToast === 'function') showToast('Mot supprime');
            return loadWords();
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function loadUsers() {
    return apiCall('/mod/users').then(function(data) {
        allUsers = data.users || [];
        var activeCount = 0;
        allUsers.forEach(function(u) { if (u.status === 'active') activeCount++; });
        document.getElementById('statUsers').innerText = activeCount;
        renderUsers();
    }).catch(function(err) { console.error(err); });
}

function renderUsers(filter) {
    filter = (filter || '').toLowerCase();
    var filtered = [];
    allUsers.forEach(function(u) {
        if ((u.username || '').toLowerCase().indexOf(filter) !== -1) filtered.push(u);
    });
    var tbody = document.getElementById('usersTable');
    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="py-8 text-center text-slate-400 text-sm">Aucun utilisateur</td></tr>';
        return;
    }
    var roleLabels = { super_admin: 'Admin', moderator: 'Modo', model: 'Modele', user: 'User' };
    var html = '';
    filtered.forEach(function(u) {
        var isBanned = u.status === 'banned';
        var cibleAdmin = u.role === 'super_admin';
        var isMe = currentUser && u.id === currentUser.id;
        var canAct = !cibleAdmin && !isMe;
        var moiAdmin = currentUser && currentUser.role === 'super_admin';
        // 🎁 Offrir des crédits : un modérateur ne peut pas s'en offrir ni en offrir à l'équipe
        var peutOffrir = !isBanned && (moiAdmin || (!isMe && u.role !== 'moderator' && !cibleAdmin));
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50/50">';
        html += '<td class="py-3 px-2 text-slate-500 font-mono text-xs">#' + u.id + '</td>';
        html += '<td class="py-3 px-2 font-bold text-slate-900">' + escapeHtml(u.username) + (isMe ? ' (moi)' : '') + '</td>';
        html += '<td class="py-3 px-2 text-xs">' + (roleLabels[u.role] || u.role) + '</td>';
        html += '<td class="py-3 px-2">' + EvcSanction.etiquette(u) + '</td>';
        html += '<td class="py-3 px-2 text-right whitespace-nowrap">';
        if (peutOffrir) html += '<button data-mod="offrirA" data-mod-args="' + argsMod(u.username) + '" title="Offrir des crédits" class="px-2 py-1 bg-yellow-100 text-amber-700 hover:bg-yellow-200 text-xs rounded-lg mr-1"><i class="fa-solid fa-gift"></i> Offrir</button>';
        if (canAct) {
            var actives = EvcSanction.enCours(u);
            var superA = moiAdmin;
            html += '<button data-mod="quickAction" data-mod-args="' + argsMod(u.id, 'warn') + '" class="px-2 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs rounded-lg mr-1">Warn</button>';
            html += actives.indexOf('mute') !== -1
                ? '<button data-mod="leverSanction" data-mod-args="' + argsMod(u.id, 'mute') + '" class="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs rounded-lg mr-1">Rendre la parole</button>'
                : '<button data-mod="quickAction" data-mod-args="' + argsMod(u.id, 'mute') + '" class="px-2 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs rounded-lg mr-1">Mute</button>';
            html += actives.indexOf('kick') !== -1
                ? '<button data-mod="leverSanction" data-mod-args="' + argsMod(u.id, 'kick') + '" class="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs rounded-lg mr-1">Lever l\'exclusion</button>'
                : '<button data-mod="quickAction" data-mod-args="' + argsMod(u.id, 'kick') + '" class="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs rounded-lg mr-1">Kick</button>';
            if (!isBanned) html += '<button data-mod="quickAction" data-mod-args="' + argsMod(u.id, 'ban') + '" class="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs rounded-lg">Ban</button>';
            else if (superA) html += '<button data-mod="leverSanction" data-mod-args="' + argsMod(u.id, 'ban') + '" class="px-2 py-1 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs rounded-lg">Débannir</button>';
        } else if (!peutOffrir) {
            html += '<span class="text-[10px] text-slate-400">-</span>';
        }
        html += '</td></tr>';
    });
    tbody.innerHTML = html;
}

// Fenêtre « Offrir des crédits »
function offrirA(nom) {
    var moi = currentUser || {};
    var noms = allUsers.filter(function (u) {
        return u.status !== 'banned' && (moi.role === 'super_admin' || (u.id !== moi.id && u.role !== 'moderator' && u.role !== 'super_admin'));
    }).map(function (u) { return u.username; });
    EvcOffrir.ouvrir({ username: nom, membres: noms });
}

function quickAction(userId, action) {
    var promise;
    if (action === 'warn') {
        var reason = prompt('Raison :') || '';
        promise = apiCall('/mod/users/' + userId + '/warn', { method: 'POST', body: JSON.stringify({ reason: reason }) });
    } else if (action === 'mute' || action === 'kick' || action === 'ban') {
        var u = allUsers.find(function (x) { return x.id === userId; }) || {};
        EvcSanction.ouvrir({ id: userId, username: u.username, type: action, onDone: loadUsers });
        return;
    } else { return; }
    promise.then(function() {
        if (typeof showToast === 'function') showToast('Action effectuee');
        return loadUsers();
    }).catch(function(err) {
        if (typeof showToast === 'function') showToast(err.message, 'error');
        else alert(err.message);
    });
}

function showTab(name, btn) {
    document.querySelectorAll('.tab-content').forEach(function(t) { t.classList.add('hidden'); });
    var target = document.getElementById('tab-' + name);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.mod-tab').forEach(function(t) {
        t.classList.remove('text-brand-primary', 'border-b-2', 'border-brand-primary', 'font-bold');
        t.classList.add('text-slate-500', 'font-semibold');
    });
    btn.classList.add('text-brand-primary', 'border-b-2', 'border-brand-primary', 'font-bold');
    btn.classList.remove('text-slate-500', 'font-semibold');

    if (name === 'surveillance') loadAllStreams();
    if (name === 'viewlogs') loadViewLogs();
    if (name === 'reports') loadReports();
    if (name === 'users') loadUsers();
    if (name === 'words') loadWords();
    if (name === 'appeals') loadAppeals();
    if (name === 'photos' && window.EvcPhotos) window.EvcPhotos.charger();
    try { history.replaceState(null, '', name === 'appeals' ? '#contestations' : location.pathname); } catch (e) {}
}

function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
// Tester le filtre sur une phrase (sans rien envoyer)
function testerFiltre(e) {
    e.preventDefault();
    var t = document.getElementById('testFiltreTexte').value;
    var out = document.getElementById('testFiltreResultat');
    if (!t.trim()) { out.textContent = ''; return; }
    apiCall('/mod/banned-words/test', { method: 'POST', body: JSON.stringify({ text: t }) }).then(function (r) {
        out.textContent = r.gravite ? ('→ ' + r.decision + ' (mot : ' + r.mots.join(', ') + ') · « ' + r.texte + ' »') : '→ ' + r.decision;
        out.className = 'text-xs mt-2 font-semibold ' + (r.gravite >= 3 ? 'text-rose-600' : r.gravite ? 'text-amber-600' : 'text-emerald-600');
    }).catch(function (err) { out.textContent = err.message; });
}

// ============================================================
// CONTESTATIONS DES SANCTIONS
// ============================================================
var appealStatus = 'pending';
var appealsCache = [];

function compterContestations() {
    return apiCall('/mod/appeals/count').then(function (d) {
        var b = document.getElementById('appealsBadge');
        if (!b) return;
        b.textContent = d.pending;
        b.classList.toggle('hidden', !d.pending);
    }).catch(function () {});
}

function dateCourte(t) {
    var d = typeof t === 'string' && !/[TZ]/.test(t) ? new Date(t.replace(' ', 'T') + 'Z') : new Date(t);
    return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function loadAppeals() {
    document.querySelectorAll('.appeal-filtre').forEach(function (b) {
        var actif = b.dataset.appealStatus === appealStatus;
        b.className = 'appeal-filtre px-3 py-1.5 rounded-lg ' + (actif ? 'bg-brand-primary text-white' : 'bg-slate-100 text-slate-600');
    });
    var list = document.getElementById('appealsList');
    return apiCall('/mod/appeals?status=' + appealStatus).then(function (d) {
        appealsCache = d.appeals || [];
        compterContestations();
        if (!appealsCache.length) {
            list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">' + (appealStatus === 'pending' ? 'Aucune contestation en attente' : 'Aucune contestation') + '</p>';
            return;
        }
        var superA = typeof isSuperAdmin === 'function' && isSuperAdmin();
        list.innerHTML = appealsCache.map(function (a) {
            var html = '<div class="rounded-2xl border border-slate-200 p-4">';
            html += '<div class="flex flex-wrap items-center justify-between gap-2 mb-2"><p class="font-bold text-slate-900">' + escapeHtml(a.username) +
                ' <span class="font-normal text-slate-500 text-sm">conteste : ' + escapeHtml(a.mesure) + ' (' + escapeHtml(a.duree) + ')</span></p>' +
                '<span class="text-[11px] text-slate-400">reçue le ' + dateCourte(a.created_at) + '</span></div>';
            html += '<p class="text-xs text-slate-500 mb-2">Sanction du ' + dateCourte(a.sanction_le) + ' par <strong>' + escapeHtml(a.by_name || '?') + '</strong>' +
                (a.reason ? ' · motif : « ' + escapeHtml(a.reason) + ' »' : '') + (a.lifted_at ? ' · <span class="text-emerald-600 font-bold">déjà levée</span>' : '') +
                (a.contact_email ? ' · réponse souhaitée à ' + escapeHtml(a.contact_email) : '') + '</p>';
            html += '<blockquote class="text-sm text-slate-700 bg-slate-50 rounded-xl p-3 whitespace-pre-wrap mb-3">' + escapeHtml(a.message) + '</blockquote>';
            if (a.status === 'pending') {
                var bloque = a.type === 'ban' && !superA;
                html += '<textarea id="note-' + a.id + '" rows="2" maxlength="2000" placeholder="Votre réponse motivée au membre (envoyée par e-mail)…" class="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none mb-2"></textarea>';
                html += '<div class="flex flex-wrap gap-2">' +
                    '<button data-mod="deciderContestation" data-mod-args="' + argsMod(a.id, 'accepted') + '"' + (bloque ? ' disabled title="Lever un bannissement : Super Admin"' : '') + ' class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">Accepter et lever la sanction</button>' +
                    '<button data-mod="deciderContestation" data-mod-args="' + argsMod(a.id, 'rejected') + '" class="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700">Refuser (maintenir)</button></div>';
            } else {
                html += '<p class="text-xs ' + (a.status === 'accepted' ? 'text-emerald-700' : 'text-rose-700') + '"><strong>' + (a.status === 'accepted' ? 'Acceptée' : 'Refusée') + '</strong> par ' +
                    escapeHtml(a.decided_by || '?') + ' le ' + dateCourte(a.decided_at) + ' — « ' + escapeHtml(a.decision_note || '') + ' »</p>';
            }
            return html + '</div>';
        }).join('');
    }).catch(function (err) { list.innerHTML = '<p class="text-center text-rose-500 py-8 text-sm">' + escapeHtml(err.message) + '</p>'; });
}

function deciderContestation(id, decision) {
    var note = (document.getElementById('note-' + id) || {}).value || '';
    if (note.trim().length < 10) { if (typeof showToast === 'function') showToast('Écrivez une réponse motivée au membre (10 caractères au moins)', 'error'); return; }
    if (!confirm(decision === 'accepted' ? 'Accepter la contestation et lever la sanction ?' : 'Refuser la contestation et maintenir la sanction ?')) return;
    apiCall('/mod/appeals/' + id + '/decide', { method: 'POST', body: JSON.stringify({ decision: decision, note: note.trim() }) })
        .then(function () { if (typeof showToast === 'function') showToast('Réponse envoyée au membre'); loadAppeals(); loadUsers(); })
        .catch(function (err) { if (typeof showToast === 'function') showToast(err.message, 'error'); });
}

// ---------- Boutons générés (signalements, caméras, mots interdits, membres, contestations) ----------
// Remplacent des attributs onclick, bloqués par la CSP stricte. Les arguments sont en JSON dans
// data-mod-args (argsMod) : un pseudo ou un mot avec une apostrophe ne casse plus le code.
function argsMod() {
    return JSON.stringify(Array.prototype.slice.call(arguments)).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
var ACTIONS_MOD = {
    fermerActionModal: function() { document.getElementById('actionModal').remove(); },
    leverSanction: function(id, type) { EvcSanction.lever(id, type, loadUsers); }
};
['applyAction', 'toutVoir', 'stopWatching', 'watchStream', 'basculerSon', 'pleinEcran', 'fermerVue', 'forceStopStream',
 'quickBan', 'deleteWord', 'offrirA', 'quickAction', 'deciderContestation'].forEach(function(nom) {
    ACTIONS_MOD[nom] = function() { return window[nom].apply(null, arguments); };
});
document.addEventListener('click', function(e) {
    var b = e.target.closest && e.target.closest('[data-mod]');
    if (!b || !Object.prototype.hasOwnProperty.call(ACTIONS_MOD, b.dataset.mod)) return;
    ACTIONS_MOD[b.dataset.mod].apply(null, JSON.parse(b.dataset.modArgs || '[]'));
});
