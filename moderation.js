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
        auth: { token: getToken() },
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
        if (!pc) {
            console.warn('Aucune peerConnection pour streamId =', streamId);
            return;
        }
        pc.setRemoteDescription(new RTCSessionDescription(data.answer))
            .then(function() {
                console.log('Réponse WebRTC OK pour', streamId);
                updateWatchStatus('Connexion établie');
            })
            .catch(function(err) {
                console.error('setRemoteDescription :', err);
                updateWatchStatus('Erreur : ' + err.message);
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
        if (currentWatchedStream && data && data.streamId === currentWatchedStream) {
            stopWatching();
        }
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
        html += '<div class="border-l-4 border-rose-300 bg-white border border-slate-200 rounded-xl p-4">';
        html += '<div class="flex items-start justify-between gap-4">';
        html += '<div class="flex-1">';
        html += '<div class="flex items-center gap-2 mb-1">';
        if (r.priority >= 4) html += '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-0.5 rounded-full">URGENT</span>';
        html += '<span class="text-xs font-bold text-slate-900">' + (r.target_username || ('Utilisateur #' + r.target_id)) + '</span>';
        html += '<span class="text-[10px] text-slate-400">' + new Date(r.created_at).toLocaleString('fr-FR') + '</span>';
        html += '</div>';
        html += '<p class="text-xs text-slate-600 mb-1"><strong>Raison :</strong> ' + r.reason + '</p>';
        if (r.description) html += '<p class="text-xs text-slate-500 italic">"' + escapeHtml(r.description) + '"</p>';
        html += '<p class="text-[10px] text-slate-400 mt-1">Signale par ' + (r.reporter_name || 'Anonyme') + '</p>';
        html += '</div>';
        if (r.status === 'pending') {
            html += '<button onclick="openActionModal(' + r.id + ', ' + (r.target_id || 0) + ', \'' + (r.target_username || '') + '\')" class="px-3 py-1.5 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-lg whitespace-nowrap">Traiter</button>';
        } else {
            html += '<span class="text-xs font-bold ' + (r.status === 'resolved' ? 'text-emerald-600' : 'text-slate-500') + '">' + (r.status === 'resolved' ? 'Traite' : 'Ignore') + '</span>';
        }
        html += '</div></div>';
    });
    list.innerHTML = html;
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
    html += '<p class="text-xs text-slate-500 mb-4 text-center">Contre <strong>' + (targetName || 'Utilisateur #' + targetId) + '</strong></p>';
    html += '<div class="space-y-2">';
    html += '<button onclick="applyAction(' + reportId + ', ' + targetId + ', \'warn\')" class="w-full p-3 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-left font-bold text-sm text-amber-900">Avertir</button>';
    html += '<button onclick="applyAction(' + reportId + ', ' + targetId + ', \'mute\')" class="w-full p-3 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-left font-bold text-sm text-orange-900">Mute (5 min)</button>';
    html += '<button onclick="applyAction(' + reportId + ', ' + targetId + ', \'kick\')" class="w-full p-3 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left font-bold text-sm text-rose-900">Kick</button>';
    html += '<button onclick="applyAction(' + reportId + ', ' + targetId + ', \'ban\')" class="w-full p-3 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-left font-bold text-sm text-red-900">Bannir</button>';
    html += '<button onclick="applyAction(' + reportId + ', ' + targetId + ', \'ignore\')" class="w-full p-3 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-left font-bold text-sm text-slate-900">Ignorer</button>';
    html += '</div>';
    html += '<button onclick="document.getElementById(\'actionModal\').remove()" class="w-full mt-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">Annuler</button>';
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
    } else if (action === 'mute') {
        reason = prompt('Raison :');
        if (reason === null) return;
        promise = apiCall('/mod/users/' + targetId + '/mute', { method: 'POST', body: JSON.stringify({ duration: 300, reason: reason }) });
    } else if (action === 'kick') {
        reason = prompt('Raison :');
        if (reason === null) return;
        promise = apiCall('/mod/users/' + targetId + '/kick', { method: 'POST', body: JSON.stringify({ reason: reason }) });
    } else if (action === 'ban') {
        if (!confirm('Bannir ?')) return;
        reason = prompt('Raison :');
        if (reason === null) return;
        promise = apiCall('/mod/users/' + targetId + '/ban', { method: 'POST', body: JSON.stringify({ reason: reason }) });
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
function loadAllStreams() {
    return apiCall('/mod/streams/all').then(function(data) {
        moderationStreams = data.streams || [];
        renderModerationStreams();
        updateModerationStats();
    }).catch(function(err) {
        document.getElementById('modStreamsGrid').innerHTML = '<p class="text-rose-500 col-span-full text-center py-8">' + err.message + '</p>';
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
    if (moderationStreams.length === 0) {
        grid.innerHTML = '<p class="text-slate-400 text-center py-8 col-span-full">Aucun live actif</p>';
        return;
    }
    var html = '';
    moderationStreams.forEach(function(s) {
        var isWatching = (currentWatchedStream === s.streamId);
        var username = s.broadcasterUsername || 'Inconnu';
        html += '<div class="bg-slate-900 rounded-2xl overflow-hidden shadow-lg' + (isWatching ? ' ring-2 ring-emerald-500' : '') + '">';
        html += '<div class="relative aspect-video bg-black flex items-center justify-center">';
        if (s.isCameraOff) {
            html += '<div class="text-white text-center"><i class="fa-solid fa-video-slash text-3xl mb-1"></i><p class="text-xs">Camera masquee</p></div>';
        } else {
            html += '<div class="text-slate-600 text-center"><i class="fa-solid fa-video text-4xl"></i></div>';
        }
        html += '<div class="absolute top-2 left-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full live-pulse">LIVE</div>';
        if (s.salon) html += '<div class="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">' + escapeHtml(s.salon) + '</div>';
        html += '<div class="absolute bottom-2 right-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full">' + (s.viewers || 0) + ' viewers</div>';
        html += '</div>';
        html += '<div class="p-3 bg-slate-800 text-white">';
        html += '<p class="font-bold text-sm mb-2">' + escapeHtml(username) + '</p>';
        html += '<div class="grid grid-cols-3 gap-1.5">';
        html += '<button onclick="watchStream(\'' + s.streamId + '\')" class="py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg">Voir</button>';
        html += '<button onclick="forceStopStream(\'' + s.streamId + '\', \'' + escapeHtml(username) + '\')" class="py-2 bg-orange-600 hover:bg-orange-700 text-white text-[10px] font-bold rounded-lg">Stop</button>';
        html += '<button onclick="quickBan(\'' + escapeHtml(username) + '\', ' + (s.broadcasterId || 0) + ')" class="py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold rounded-lg">Ban</button>';
        html += '</div></div></div>';
    });
    grid.innerHTML = html;
}

function watchStream(streamId) {
    var reason = prompt('Raison de la surveillance :', 'Surveillance de routine');
    if (reason === null) return;
    apiCall('/mod/streams/' + streamId + '/watch', { method: 'POST', body: JSON.stringify({ reason: reason }) })
        .then(function(data) {
            var info = data.stream || {};
            currentWatchedStreamInfo = info;

            document.getElementById('activeWatchContainer').classList.remove('hidden');
            document.getElementById('activeWatchName').textContent = info.broadcasterUsername || 'Live ' + streamId;
            document.getElementById('activeWatchPlaceholder').style.display = 'flex';
            document.getElementById('activeWatchStatus').textContent = 'Connexion en cours...';
            document.getElementById('activeWatchVideo').srcObject = null;

            document.getElementById('activeWatchContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });

            return connectToStream(streamId, info);
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function connectToStream(streamId, streamInfo) {
    if (currentWatchedStream && moderationPeerConnections[currentWatchedStream]) {
        try { moderationPeerConnections[currentWatchedStream].close(); } catch(e) {}
        delete moderationPeerConnections[currentWatchedStream];
    }

    currentWatchedStream = streamId;
    var pc = new RTCPeerConnection(rtcConfig);
    moderationPeerConnections[streamId] = pc;

    pc.ontrack = function(event) {
        console.log('Flux recu pour', streamId);
        var videoEl = document.getElementById('activeWatchVideo');
        if (videoEl) {
            videoEl.srcObject = event.streams[0];
            videoEl.play().catch(function(err) {
                console.warn('Autoplay bloque :', err);
            });
        }
        document.getElementById('activeWatchPlaceholder').style.display = 'none';
        updateWatchStatus('En direct');
    };

    pc.onicecandidate = function(event) {
        if (event.candidate && socket) {
            socket.emit('webrtc:ice-candidate', {
                candidate: event.candidate,
                streamId: streamId
            });
        }
    };

    pc.onconnectionstatechange = function() {
        console.log('Etat surveillance [' + streamId + '] :', pc.connectionState);
        updateWatchStatus(pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            document.getElementById('activeWatchPlaceholder').style.display = 'flex';
        }
    };

    socket.emit('live:join', { streamId: streamId, isModerator: true });

    return pc.createOffer({ offerToReceiveVideo: true, offerToReceiveAudio: true })
        .then(function(offer) {
            return pc.setLocalDescription(offer).then(function() { return offer; });
        })
        .then(function(offer) {
            if (socket) {
                socket.emit('webrtc:offer', {
                    offer: offer,
                    streamId: streamId,
                    isModerator: true
                });
            }
        });
}

function updateWatchStatus(text) {
    var el = document.getElementById('activeWatchStatus');
    if (el) el.textContent = text;
}

function stopWatching() {
    if (currentWatchedStream) {
        socket.emit('live:leave', { streamId: currentWatchedStream });
        var pc = moderationPeerConnections[currentWatchedStream];
        if (pc) {
            try { pc.close(); } catch(e) {}
            delete moderationPeerConnections[currentWatchedStream];
        }
        currentWatchedStream = null;
        currentWatchedStreamInfo = null;
    }
    document.getElementById('activeWatchContainer').classList.add('hidden');
    document.getElementById('activeWatchVideo').srcObject = null;
    loadAllStreams();
}

function forceStopStream(streamId, username) {
    var reason = prompt('Raison :', 'Violation des CGU');
    if (reason === null) return;
    if (!confirm('Arreter le live de ' + username + ' ?')) return;
    apiCall('/mod/streams/' + streamId + '/stop', { method: 'POST', body: JSON.stringify({ reason: reason }) })
        .then(function() {
            if (typeof showToast === 'function') showToast('Live arrete', 'warning');
            if (currentWatchedStream === streamId) stopWatching();
            loadAllStreams();
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
}

function quickBan(username, userId) {
    if (!userId) { alert('ID utilisateur introuvable'); return; }
    if (!confirm('Bannir ' + username + ' ?')) return;
    var reason = prompt('Raison :', 'Violation des CGU');
    if (reason === null) return;
    apiCall('/mod/users/' + userId + '/ban', { method: 'POST', body: JSON.stringify({ reason: reason }) })
        .then(function() {
            if (typeof showToast === 'function') showToast(username + ' banni', 'warning');
            loadAllStreams();
        })
        .catch(function(err) {
            if (typeof showToast === 'function') showToast(err.message, 'error');
            else alert(err.message);
        });
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
        var wordEscaped = escapeHtml(w.word).replace(/'/g, "\\'");
        html += '<div class="bg-slate-100 text-slate-700 rounded-xl p-3 flex items-center justify-between">';
        html += '<div><p class="font-bold text-sm">' + escapeHtml(w.word) + '</p><p class="text-[10px] opacity-70">Severite ' + w.severity + '/5</p></div>';
        html += '<button onclick="deleteWord(\'' + wordEscaped + '\')" class="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 flex items-center justify-center text-xs">X</button>';
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
        var isSuperAdmin = u.role === 'super_admin';
        var isMe = currentUser && u.id === currentUser.id;
        var canAct = !isSuperAdmin && !isMe;
        html += '<tr class="border-b border-slate-50 hover:bg-slate-50/50">';
        html += '<td class="py-3 px-2 text-slate-500 font-mono text-xs">#' + u.id + '</td>';
        html += '<td class="py-3 px-2 font-bold text-slate-900">' + escapeHtml(u.username) + (isMe ? ' (moi)' : '') + '</td>';
        html += '<td class="py-3 px-2 text-xs">' + (roleLabels[u.role] || u.role) + '</td>';
        html += '<td class="py-3 px-2">' + (isBanned ? '<span class="text-rose-600 text-xs font-bold">Banni</span>' : '<span class="text-emerald-600 text-xs font-bold">Actif</span>') + '</td>';
        html += '<td class="py-3 px-2 text-right">';
        if (canAct) {
            html += '<button onclick="quickAction(' + u.id + ', \'warn\')" class="px-2 py-1 bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs rounded-lg mr-1">Warn</button>';
            html += '<button onclick="quickAction(' + u.id + ', \'mute\')" class="px-2 py-1 bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs rounded-lg mr-1">Mute</button>';
            html += '<button onclick="quickAction(' + u.id + ', \'kick\')" class="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs rounded-lg mr-1">Kick</button>';
            if (!isBanned) html += '<button onclick="quickAction(' + u.id + ', \'ban\')" class="px-2 py-1 bg-red-50 text-red-600 hover:bg-red-100 text-xs rounded-lg">Ban</button>';
        } else {
            html += '<span class="text-[10px] text-slate-400">-</span>';
        }
        html += '</td></tr>';
    });
    tbody.innerHTML = html;
}

function quickAction(userId, action) {
    var promise;
    if (action === 'warn') {
        var reason = prompt('Raison :') || '';
        promise = apiCall('/mod/users/' + userId + '/warn', { method: 'POST', body: JSON.stringify({ reason: reason }) });
    } else if (action === 'mute') {
        promise = apiCall('/mod/users/' + userId + '/mute', { method: 'POST', body: JSON.stringify({ duration: 300, reason: '' }) });
    } else if (action === 'kick') {
        promise = apiCall('/mod/users/' + userId + '/kick', { method: 'POST', body: JSON.stringify({ reason: '' }) });
    } else if (action === 'ban') {
        if (!confirm('Bannir ?')) return;
        promise = apiCall('/mod/users/' + userId + '/ban', { method: 'POST', body: JSON.stringify({ reason: '' }) });
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
}

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}