// ============================================================
// MESSAGERIE PRIVÉE - E-VISIOCAM
// ============================================================

var socket = null;
var currentUser = null;
var currentConversationId = null;
var currentOtherUser = null;
var conversations = [];
var typingTimeout = null;
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

    var userSearch = document.getElementById('userSearchInput');
    if (userSearch) {
        userSearch.addEventListener('input', function(e) {
            clearTimeout(userSearchTimeout);
            var q = e.target.value.trim();
            if (q.length < 2) {
                document.getElementById('userSearchResults').innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Tape au moins 2 lettres pour chercher</p>';
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
    socket = io('https://api.e-visiocam.com', {
        withCredentials: true,
        transports: ['websocket', 'polling']
    });

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

        html += '<div onclick="openConversation(' + c.id + ')" class="conv-item cursor-pointer p-3 border-b border-slate-50 ' + (isActive ? 'active' : '') + '">';
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

        document.getElementById('chatUsername').textContent = data.otherUser.username;
        document.getElementById('chatAvatar').textContent = data.otherUser.username.charAt(0).toUpperCase();

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
    document.getElementById('chatHeader').classList.add('hidden');
    document.getElementById('chatInputWrapper').classList.add('hidden');
    document.getElementById('messagesContainer').innerHTML =
        '<div class="h-full flex items-center justify-center text-center text-slate-400"><div><i class="fa-solid fa-comments text-5xl mb-3 text-slate-300"></i><p class="text-sm">Sélectionne une conversation pour commencer</p></div></div>';
    renderConversations();
}

// ============================================================
// SUPPRIMER UNE CONVERSATION
// ============================================================
async function deleteCurrentConversation() {
    if (!currentConversationId || !currentOtherUser) return;
    if (!confirm('Supprimer la conversation avec ' + currentOtherUser.username + ' ?\n\nTous les messages seront effacés.')) return;

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
        container.innerHTML = '<div class="h-full flex items-center justify-center text-slate-400 text-sm"><p>Aucun message. Commence la conversation !</p></div>';
        return;
    }
    var html = '';
    messages.forEach(function(m) { html += buildMessageHtml(m); });
    container.innerHTML = html;
}

function appendMessage(message) {
    var container = document.getElementById('messagesContainer');
    if (container.querySelector('.h-full')) container.innerHTML = '';
    container.insertAdjacentHTML('beforeend', buildMessageHtml(message));
    scrollToBottom();
}

function buildMessageHtml(m) {
    var isMine = (m.sender_id === currentUser.id);
    var initial = (m.sender_username || '?').charAt(0).toUpperCase();

    var html = '';
    html += '<div class="flex items-end gap-2 ' + (isMine ? 'flex-row-reverse' : '') + '">';
    html += '<div class="w-8 h-8 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-xs shrink-0">' + initial + '</div>';
    html += '<div class="max-w-[70%]">';
    html += '<div class="px-4 py-2.5 rounded-2xl text-sm break-words ' + (isMine ? 'msg-bubble-sent rounded-br-sm' : 'msg-bubble-received rounded-bl-sm') + '">';
    html += escapeHtml(m.content);
    html += '</div>';
    html += '<p class="text-[10px] text-slate-400 mt-1 ' + (isMine ? 'text-right' : '') + '">' + formatTime(m.created_at) + '</p>';
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

    try {
        if (socket) {
            socket.emit('dm:send', { conversationId: currentConversationId, content: content });
        } else {
            await apiCall('/messages/' + currentConversationId, {
                method: 'POST',
                body: JSON.stringify({ content: content })
            });
        }
    } catch (err) {
        alert('Erreur envoi : ' + err.message);
    }
}

// ============================================================
// TYPING
// ============================================================
function notifyTyping() {
    if (!socket || !currentConversationId) return;
    clearTimeout(typingTimeout);
    socket.emit('dm:typing', { conversationId: currentConversationId });
    typingTimeout = setTimeout(function() {}, 1500);
}

function showTypingIndicator(username) {
    var status = document.getElementById('chatStatus');
    if (!status) return;
    status.innerHTML = '<span class="w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse"></span><span class="text-amber-600">' + escapeHtml(username) + ' écrit...</span>';
    setTimeout(function() {
        status.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full inline-block"></span><span>En ligne</span>';
    }, 2000);
}

// ============================================================
// MODAL NOUVELLE CONVERSATION
// ============================================================
function openNewConvModal() {
    document.getElementById('newConvModal').classList.remove('hidden');
    document.getElementById('userSearchInput').value = '';
    document.getElementById('userSearchResults').innerHTML = '<p class="text-center text-slate-400 text-sm py-6">Tape au moins 2 lettres pour chercher</p>';
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
            html += '<div onclick="startConversationWith(' + u.id + ')" class="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-100 cursor-pointer transition-all">';
            html += '<div class="w-10 h-10 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold shrink-0">' + initial + '</div>';
            html += '<div class="flex-1 min-w-0">';
            html += '<p class="font-bold text-sm text-slate-900">' + escapeHtml(u.username) + '</p>';
            if (roleLabel) html += '<p class="text-xs text-slate-500">' + roleLabel + '</p>';
            html += '</div>';
            html += '<i class="fa-solid fa-chevron-right text-slate-300 text-xs"></i>';
            html += '</div>';
        });
        results.innerHTML = html;
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
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}
