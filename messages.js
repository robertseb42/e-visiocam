// ============================================================
// MESSAGERIE PRIVÉE - E-VISIOCAM
// ============================================================

var socket = null;
var currentUser = null;
var currentConversationId = null;
var currentOtherUser = null;
var conversations = [];
var currentOtherOnline = false;   // l'autre membre est-il connecté ? (vérifié auprès du serveur)
var presenceTimer = null;
var userSearchTimeout = null;

// ============================================================
// INITIALISATION
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html?redirect=messages.html';
        return;
    }

    var params = new URLSearchParams(location.search);
    var ecrire = parseInt(params.get('ecrire'), 10);
    if (ecrire > 0 && ecrire !== currentUser.id) {
        // Arrivée depuis la galerie des membres : messages.html?ecrire=12 ouvre la conversation avec ce membre
        // (&demande=cam : le message de demande de caméra est déjà écrit, il reste à l'envoyer ou le modifier)
        var demande = params.get('demande');
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
        Promise.resolve(startConversationWith(ecrire)).then(function () {
            var champ = document.getElementById('messageInput');
            if (!champ) return;
            if (demande === 'cam' && !champ.value) {
                champ.value = '📷 Bonjour ! Ça vous dirait d’allumer votre cam ? Si vous êtes d’accord, vous pouvez m’inviter dans un live privé. Pas de souci si vous préférez ne pas le faire 😊';
            }
            champ.focus();
            try { champ.setSelectionRange(champ.value.length, champ.value.length); } catch (e) {}
        });
    }
    initSocket();
    loadConversations();

    var searchInput = document.getElementById('searchConv');
    if (searchInput) searchInput.addEventListener('input', filterConversations);

    var msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        msgInput.addEventListener('input', notifyTyping);
    }

    // 🚩 Signaler / 🚫 Bloquer le membre de la conversation ouverte (voir securite-membres.js)
    var btnSig = document.getElementById('btnSignalerConv');
    if (btnSig) btnSig.addEventListener('click', function () {
        if (currentOtherUser && window.EvcSecurite) EvcSecurite.signaler({ type: 'user', userId: currentOtherUser.id, username: currentOtherUser.username, peutBloquer: !estEquipe(currentOtherUser) });
    });
    var btnBl = document.getElementById('btnBloquerConv');
    if (btnBl) btnBl.addEventListener('click', async function () {
        if (!currentOtherUser || !window.EvcSecurite) return;
        if (await EvcSecurite.bloquer(currentOtherUser.id, currentOtherUser.username)) {
            closeConversation();
            loadConversations();
        }
    });

    var userSearch = document.getElementById('userSearchInput');
    if (userSearch) {
        userSearch.addEventListener('input', function(e) {
            clearTimeout(userSearchTimeout);
            var q = e.target.value.trim();
            if (q.length < 2) {
                document.getElementById('userSearchResults').innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Tapez au moins 2 lettres pour chercher</p>';
                return;
            }
            userSearchTimeout = setTimeout(function() { searchUsers(q); }, 300);
        });
    }
});

// ============================================================
// SOCKET
// ============================================================
function initSocket() {
    // Le script temps réel vient du serveur : s'il est injoignable, on le dit au lieu de planter la page
    if (typeof io === 'undefined') {
        var st = document.getElementById('connectionStatus');
        if (st) { st.className = 'text-xs font-bold px-3 py-1.5 rounded-full bg-rose-100 text-rose-700'; st.textContent = '❌ Serveur injoignable — rechargez la page'; }
        console.warn('Socket.IO indisponible : serveur temps réel injoignable');
        return;
    }
    socket = io('https://api.e-visiocam.com', {
        withCredentials: true,
        transports: ['websocket', 'polling']
    });
    if (window.evcSurveillerSession) window.evcSurveillerSession(socket);   // fin de session (mot de passe changé, déconnexion…)

    socket.on('connect', function() {
        console.log('✅ Socket connecté');
    });

    socket.on('dm:message', function(data) {
        if (!data || !data.message) return;

        if (data.conversationId === currentConversationId) {
            appendMessage(data.message);
            socket.emit('dm:read', { conversationId: currentConversationId });
        }

        loadConversations();
    });

    // Message refusé par le serveur (membre bloqué, sanction, mot interdit…) : on le dit clairement
    // et le texte revient dans la zone de saisie
    socket.on('dm:error', function(data) {
        var texte = (data && data.message) || 'Message non envoyé';
        afficherRefus(texte);
        var champ = document.getElementById('messageInput');
        if (champ && dernierEnvoi && !champ.value) champ.value = dernierEnvoi;
    });
    if (window.EvcSecurite) EvcSecurite.brancher(socket);

    socket.on('dm:unread-count', function(data) {
        updateUnreadBadge(data.count);
    });

    socket.on('dm:typing', function(data) {
        if (data.conversationId === currentConversationId) {
            showTypingIndicator(data.username);
        }
    });
}

// ============================================================
// CHARGER LES CONVERSATIONS
// ============================================================
async function loadConversations() {
    try {
        const data = await apiCall('/messages/conversations');
        conversations = data.conversations || [];
        renderConversations();
        const totalUnread = conversations.reduce(function(sum, c) { return sum + (c.unreadCount || 0); }, 0);
        updateUnreadBadge(totalUnread);
    } catch (err) {
        console.error('Erreur load conversations:', err);
        document.getElementById('conversationsList').innerHTML =
            '<div class="p-8 text-center text-rose-500 text-sm">' + escapeHtml(err.message) + '</div>';
    }
}

function renderConversations(filter) {
    var container = document.getElementById('conversationsList');
    var filtered = conversations;

    if (filter) {
        var f = filter.toLowerCase();
        filtered = conversations.filter(function(c) {
            return c.otherUser && c.otherUser.username.toLowerCase().indexOf(f) !== -1;
        });
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-solid fa-inbox text-3xl mb-2"></i><p>' + (filter ? 'Aucun résultat' : 'Aucune conversation') + '</p></div>';
        return;
    }

    var html = '';
    filtered.forEach(function(c) {
        var isActive = (c.id === currentConversationId);
        var initial = c.otherUser ? c.otherUser.username.charAt(0).toUpperCase() : '?';
        var lastMsg = c.lastMessage || 'Nouvelle conversation';
        if (lastMsg.length > 40) lastMsg = lastMsg.substring(0, 40) + '...';

        html += '<div data-conv-id="' + Number(c.id) + '" class="conv-item cursor-pointer p-3 border-b border-slate-50 ' + (isActive ? 'active' : '') + '">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="relative shrink-0">';
        html += '<div class="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold">' + initial + '</div>';
        if (c.unreadCount > 0) {
            html += '<span class="absolute -top-1 -right-1 bg-brand-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">' + c.unreadCount + '</span>';
        }
        html += '</div>';
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="flex justify-between items-baseline">';
        html += '<p class="font-bold text-slate-900 text-sm truncate">' + escapeHtml(c.otherUser ? c.otherUser.username : 'Inconnu') + '</p>';
        html += '<p class="text-[10px] text-slate-400 shrink-0 ml-2">' + formatTime(c.lastMessageAt) + '</p>';
        html += '</div>';
        html += '<p class="text-xs text-slate-500 truncate">' + escapeHtml(lastMsg) + '</p>';
        html += '</div>';
        html += '</div></div>';
    });

    container.innerHTML = html;
    // Clic branché ici : les attributs onclick sont bloqués par la CSP stricte
    container.querySelectorAll('[data-conv-id]').forEach(function(el) {
        el.addEventListener('click', function() { openConversation(Number(el.dataset.convId)); });
    });
}

function filterConversations(e) {
    renderConversations(e.target.value);
}

// ============================================================
// OUVRIR / FERMER UNE CONVERSATION
// ============================================================
async function openConversation(convId) {
    currentConversationId = convId;
    renderConversations(document.getElementById('searchConv').value);
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('chatInputWrapper').classList.remove('hidden');
    document.getElementById('messagesContainer').innerHTML =
        '<div class="h-full flex items-center justify-center text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-3xl"></i></div>';

    try {
        const data = await apiCall('/messages/' + convId);
        currentOtherUser = data.otherUser;

        var lienNom = document.getElementById('chatUsername');
        lienNom.textContent = data.otherUser.username;
        lienNom.setAttribute('href', 'membre.html?u=' + encodeURIComponent(data.otherUser.username));
        afficherRefus('');
        // L'équipe de modération ne peut pas être bloquée
        var btnBl = document.getElementById('btnBloquerConv');
        if (btnBl) btnBl.classList.toggle('hidden', estEquipe(data.otherUser));
        document.getElementById('chatAvatar').textContent = data.otherUser.username.charAt(0).toUpperCase();
        currentOtherOnline = false;
        document.getElementById('chatStatus').innerHTML = '';
        majPresence();
        clearInterval(presenceTimer);
        presenceTimer = setInterval(majPresence, 60000);

        renderMessages(data.messages);
        if (socket) socket.emit('dm:read', { conversationId: convId });
        scrollToBottom();
    } catch (err) {
        document.getElementById('messagesContainer').innerHTML =
            '<div class="h-full flex items-center justify-center text-rose-500 text-sm">' + escapeHtml(err.message) + '</div>';
    }
}

function closeConversation() {
    currentConversationId = null;
    currentOtherUser = null;
    clearInterval(presenceTimer);
    document.getElementById('chatHeader').classList.add('hidden');
    document.getElementById('chatInputWrapper').classList.add('hidden');
    document.getElementById('messagesContainer').innerHTML =
        '<div class="h-full flex items-center justify-center text-center text-slate-400"><div><i class="fa-solid fa-comments text-5xl mb-3 text-slate-300"></i><p class="text-sm">Sélectionnez une conversation pour commencer</p></div></div>';
    renderConversations();
}

// ============================================================
// SUPPRIMER UNE CONVERSATION
// ============================================================
async function deleteCurrentConversation() {
    if (!currentConversationId || !currentOtherUser) return;
    if (!confirm('Supprimer la conversation avec ' + currentOtherUser.username + ' ?\n\nElle disparaîtra de votre liste. ' + currentOtherUser.username + ' la conserve de son côté.')) return;

    try {
        await apiCall('/messages/' + currentConversationId, { method: 'DELETE' });
        closeConversation();
        await loadConversations();
        if (typeof showToast === 'function') showToast('Conversation supprimée', 'success');
    } catch (err) {
        if (typeof showToast === 'function') showToast('Erreur : ' + err.message, 'error');
        else alert('Erreur : ' + err.message);
    }
}

// ============================================================
// AFFICHER LES MESSAGES
// ============================================================
function renderMessages(messages) {
    var container = document.getElementById('messagesContainer');
    if (messages.length === 0) {
        container.innerHTML = '<div class="h-full flex items-center justify-center text-slate-400 text-sm"><p>Aucun message. Commencez la conversation !</p></div>';
        return;
    }
    var html = '';
    messages.forEach(function(m) { html += buildMessageHtml(m); });
    container.innerHTML = html;
}

function appendMessage(message) {
    var container = document.getElementById('messagesContainer');
    // Déjà affiché (réponse de l'API puis écho du serveur temps réel) : pas de doublon
    if (message && message.id != null && container.querySelector('[data-msg-id="' + Number(message.id) + '"]')) return;
    if (container.querySelector('.h-full')) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', buildMessageHtml(message));
    scrollToBottom();
}

function buildMessageHtml(m) {
    var isMine = (m.sender_id === currentUser.id);
    var initial = (m.sender_username || '?').charAt(0).toUpperCase();

    var html = '';
    html += '<div class="flex items-end gap-2 ' + (isMine ? 'flex-row-reverse' : '') + '"' + (m.id != null ? ' data-msg-id="' + Number(m.id) + '"' : '') + (isMine ? '' : ' data-evc-msg') + '>';
    html += '<div class="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0">' + initial + '</div>';
    html += '<div class="max-w-[70%]">';
    html += '<div class="px-4 py-2.5 rounded-2xl text-sm break-words ' + (isMine ? 'msg-bubble-sent rounded-br-sm' : 'msg-bubble-received rounded-bl-sm') + '"' + (isMine ? '' : ' data-evc-texte') + '>';
    html += escapeHtml(m.content);
    html += '</div>';
    // 🚩 Signaler ce message : le serveur joint lui-même le texte, l'auteur et la date
    var drapeau = (!isMine && m.id != null) ? ' <button type="button" class="evc-flag" data-evc-signaler="message" data-source="prive" data-msg-id="' + Number(m.id) + '" data-uid="' + Number(m.sender_id) + '" data-nom="' + escapeHtml(m.sender_username || '') + '"' +
        (m.sender_role === 'moderator' || m.sender_role === 'super_admin' ? ' data-peut-bloquer="0"' : '') + ' title="Signaler ce message" aria-label="Signaler ce message">🚩</button>' : '';
    html += '<p class="text-[10px] text-slate-400 mt-1 ' + (isMine ? 'text-right' : '') + '">' + formatTime(m.created_at) + drapeau + '</p>';
    html += '</div></div>';
    return html;
}

// ============================================================
// ENVOYER UN MESSAGE
// ============================================================
async function sendMessage() {
    var input = document.getElementById('messageInput');
    var content = input.value.trim();
    if (!content || !currentConversationId) return;

    input.value = '';
    dernierEnvoi = content;
    afficherRefus('');

    try {
        if (socket && socket.connected) {
            socket.emit('dm:send', { conversationId: currentConversationId, content: content });
        } else {
            // Sans temps réel : l'API renvoie { message } (201) — on l'affiche tout de suite chez l'expéditeur
            var convId = currentConversationId;
            var res = await apiCall('/messages/' + convId, {
                method: 'POST',
                body: JSON.stringify({ content: content })
            });
            if (res && res.message && convId === currentConversationId) appendMessage(res.message);
            loadConversations();
        }
    } catch (err) {
        afficherRefus(err.message || 'Message non envoyé');
        if (!input.value) input.value = content;
    }
}

// Dernier texte envoyé : remis dans la zone de saisie si le serveur le refuse
var dernierEnvoi = '';
function afficherRefus(texte) {
    var n = document.getElementById('dmNotice');
    if (!n) return;
    n.textContent = texte ? '⚠️ ' + texte : '';
    n.classList.toggle('hidden', !texte);
}
function estEquipe(u) { return !!u && (u.role === 'moderator' || u.role === 'super_admin'); }

// ============================================================
// TYPING
// ============================================================
// Au plus un signal toutes les 2 secondes (avant : un par touche, ce qui surchargeait le serveur)
var derniereFrappe = 0;
function notifyTyping() {
    if (!socket || !currentConversationId) return;
    if (Date.now() - derniereFrappe < 2000) return;
    derniereFrappe = Date.now();
    socket.emit('dm:typing', { conversationId: currentConversationId });
}

// ---------- PRÉSENCE DE L'AUTRE MEMBRE ----------
// Avant, « En ligne » était écrit en dur et s'affichait même pour un membre déconnecté.
function afficherPresence() {
    var status = document.getElementById('chatStatus');
    if (!status) return;
    status.className = 'text-xs flex items-center gap-1 ' + (currentOtherOnline ? 'text-emerald-600' : 'text-slate-400');
    status.innerHTML = currentOtherOnline
        ? '<span class="w-2 h-2 bg-emerald-500 rounded-full inline-block"></span><span>En ligne</span>'
        : '<span class="w-2 h-2 bg-slate-300 rounded-full inline-block"></span><span>Hors ligne</span>';
}

async function majPresence() {
    if (!currentOtherUser) return;
    var id = currentOtherUser.id;
    var enLigne = false;
    try {
        var data = await apiCall('/models/profil/' + id);
        enLigne = !!(data && data.membre && data.membre.online);
    } catch (e) {}   // membre introuvable ou suspendu : hors ligne
    if (!currentOtherUser || currentOtherUser.id !== id) return;   // conversation changée entre-temps
    currentOtherOnline = enLigne;
    afficherPresence();
}

function showTypingIndicator(username) {
    var status = document.getElementById('chatStatus');
    if (!status) return;
    status.innerHTML = '<span class="w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse"></span><span class="text-amber-600">' + escapeHtml(username) + ' écrit...</span>';
    currentOtherOnline = true;   // il écrit : il est forcément connecté
    setTimeout(afficherPresence, 2000);
}

// ============================================================
// MODAL NOUVELLE CONVERSATION
// ============================================================
function openNewConvModal() {
    document.getElementById('newConvModal').classList.remove('hidden');
    document.getElementById('userSearchInput').value = '';
    document.getElementById('userSearchResults').innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Tapez au moins 2 lettres pour chercher</p>';
    setTimeout(function() { document.getElementById('userSearchInput').focus(); }, 100);
}

function closeNewConvModal() {
    document.getElementById('newConvModal').classList.add('hidden');
}

async function searchUsers(q) {
    var results = document.getElementById('userSearchResults');
    results.innerHTML = '<p class="text-center text-slate-400 text-sm py-6"><i class="fa-solid fa-circle-notch fa-spin"></i></p>';

    try {
        const data = await apiCall('/messages/search/users?q=' + encodeURIComponent(q));
        var users = data.users || [];

        if (users.length === 0) {
            results.innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Aucun utilisateur trouvé</p>';
            return;
        }

        var html = '';
        users.forEach(function(u) {
            var initial = u.username.charAt(0).toUpperCase();
            var roleLabel = u.role === 'model' ? '⭐ Modèle' : (u.role === 'super_admin' ? '👑 Admin' : (u.role === 'moderator' ? '🛡️ Modo' : ''));
            html += '<div data-user-id="' + Number(u.id) + '" class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 cursor-pointer transition-all">';
            html += '<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold shrink-0">' + initial + '</div>';
            html += '<div class="flex-1 min-w-0">';
            html += '<p class="font-bold text-sm text-slate-900">' + escapeHtml(u.username) + '</p>';
            if (roleLabel) html += '<p class="text-xs text-slate-500">' + roleLabel + '</p>';
            html += '</div>';
            html += '<i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>';
            html += '</div>';
        });
        results.innerHTML = html;
        results.querySelectorAll('[data-user-id]').forEach(function(el) {
            el.addEventListener('click', function() { startConversationWith(Number(el.dataset.userId)); });
        });
    } catch (err) {
        results.innerHTML = '<p class="text-center text-rose-500 text-sm py-6">' + escapeHtml(err.message) + '</p>';
    }
}

async function startConversationWith(userId) {
    try {
        const data = await apiCall('/messages/start', {
            method: 'POST',
            body: JSON.stringify({ userId: userId })
        });
        closeNewConvModal();
        await loadConversations();
        openConversation(data.conversation.id);
    } catch (err) {
        if (typeof showToast === 'function') showToast('Erreur : ' + err.message, 'error');
        else alert('Erreur : ' + err.message);
    }
}

// ============================================================
// BADGE NON-LUS
// ============================================================
function updateUnreadBadge(count) {
    var badge = document.querySelector('[data-unread-badge]');
    if (badge) {
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'inline-block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// ============================================================
// UTILITAIRES
// ============================================================
function scrollToBottom() {
    var container = document.getElementById('messagesContainer');
    if (container) container.scrollTop = container.scrollHeight;
}

function formatTime(isoString) {
    if (!isoString) return '';
    var d = new Date(isoString.replace(' ', 'T') + (isoString.includes('Z') ? '' : 'Z'));
    var now = new Date();
    var diffMs = now - d;
    var diffMin = Math.floor(diffMs / 60000);
    var diffH = Math.floor(diffMs / 3600000);
    var diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'À l\'instant';
    if (diffMin < 60) return diffMin + ' min';
    if (diffH < 24) return diffH + ' h';
    if (diffD < 7) return diffD + ' j';
    return d.toLocaleDateString('fr-FR');
}

function escapeHtml(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
