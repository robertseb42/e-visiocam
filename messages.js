// ============================================================
// MESSAGERIE PRIVÉE - E-VISIOCAM
// ============================================================

var socket = null;
var currentUser = null;
var currentConversationId = null;
var currentOtherUser = null;
var conversations = [];
var typingTimeout = null;

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

    // Recherche dans les conversations
    var searchInput = document.getElementById('searchConv');
    if (searchInput) {
        searchInput.addEventListener('input', filterConversations);
    }

    // Entrée pour envoyer
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
});

// ============================================================
// SOCKET
// ============================================================
function initSocket() {
    socket = io('https://e-visiocam-api.onrender.com', {
        auth: { token: getToken() },
        transports: ['websocket', 'polling']
    });

    socket.on('connect', function() {
        console.log('✅ Socket connecté');
    });

    // Nouveau message reçu
    socket.on('dm:message', function(data) {
        if (!data || !data.message) return;

        // Si c'est la conversation active, l'ajouter direct
        if (data.conversationId === currentConversationId) {
            appendMessage(data.message);
            // Marquer comme lu
            socket.emit('dm:read', { conversationId: currentConversationId });
        }

        // Rafraîchir la liste des conversations
        loadConversations();
    });

    // Compteur de non-lus
    socket.on('dm:unread-count', function(data) {
        updateUnreadBadge(data.count);
    });

    // Typing indicator
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

        // Mettre à jour le badge global
        const totalUnread = conversations.reduce(function(sum, c) { return sum + (c.unreadCount || 0); }, 0);
        updateUnreadBadge(totalUnread);
    } catch (err) {
        console.error('Erreur load conversations:', err);
        document.getElementById('conversationsList').innerHTML =
            '<div class="p-8 text-center text-rose-500 text-sm">' + err.message + '</div>';
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
        container.innerHTML = '<div class="p-8 text-center text-slate-400 text-sm"><i class="fa-solid fa-inbox text-3xl mb-2"></i><p>Aucune conversation</p></div>';
        return;
    }

    var html = '';
    filtered.forEach(function(c) {
        var isActive = (c.id === currentConversationId);
        var initial = c.otherUser ? c.otherUser.username.charAt(0).toUpperCase() : '?';
        var lastMsg = c.lastMessage || 'Nouvelle conversation';
        if (lastMsg.length > 40) lastMsg = lastMsg.substring(0, 40) + '...';

        html += '<div onclick="openConversation(' + c.id + ')" class="conv-item cursor-pointer p-3 border-b border-slate-50 hover:bg-slate-50 transition-all ' + (isActive ? 'active' : '') + '">';
        html += '<div class="flex items-center gap-3">';
        html += '<div class="relative">';
        html += '<div class="w-12 h-12 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold">' + initial + '</div>';
        if (c.unreadCount > 0) {
            html += '<span class="absolute -top-1 -right-1 bg-brand-primary text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">' + c.unreadCount + '</span>';
        }
        html += '</div>';
        html += '<div class="flex-1 min-w-0">';
        html += '<div class="flex justify-between items-baseline">';
        html += '<p class="font-bold text-slate-900 text-sm truncate">' + (c.otherUser ? c.otherUser.username : 'Inconnu') + '</p>';
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
// OUVRIR UNE CONVERSATION
// ============================================================
async function openConversation(convId) {
    currentConversationId = convId;

    // Marquer active dans la liste
    renderConversations(document.getElementById('searchConv').value);

    // Afficher le header + input
    document.getElementById('chatHeader').classList.remove('hidden');
    document.getElementById('chatInputWrapper').classList.remove('hidden');

    // Loading
    document.getElementById('messagesContainer').innerHTML =
        '<div class="h-full flex items-center justify-center text-slate-400"><i class="fa-solid fa-circle-notch fa-spin text-3xl"></i></div>';

    try {
        const data = await apiCall('/messages/' + convId);
        currentOtherUser = data.otherUser;

        document.getElementById('chatUsername').textContent = data.otherUser.username;
        document.getElementById('chatAvatar').textContent = data.otherUser.username.charAt(0).toUpperCase();

        renderMessages(data.messages);

        // Marquer comme lu via socket
        if (socket) socket.emit('dm:read', { conversationId: convId });

        // Scroll en bas
        scrollToBottom();
    } catch (err) {
        document.getElementById('messagesContainer').innerHTML =
            '<div class="h-full flex items-center justify-center text-rose-500 text-sm">' + err.message + '</div>';
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
// AFFICHER LES MESSAGES
// ============================================================
function renderMessages(messages) {
    var container = document.getElementById('messagesContainer');

    if (messages.length === 0) {
        container.innerHTML = '<div class="h-full flex items-center justify-center text-slate-400 text-sm"><p>Aucun message. Commence la conversation !</p></div>';
        return;
    }

    var html = '';
    messages.forEach(function(m) {
        html += buildMessageHtml(m);
    });
    container.innerHTML = html;
}

function appendMessage(message) {
    var container = document.getElementById('messagesContainer');

    // Si la conversation était vide
    if (container.querySelector('.h-full')) {
        container.innerHTML = '';
    }

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
        // Envoyer via socket (plus rapide, temps réel)
        if (socket) {
            socket.emit('dm:send', {
                conversationId: currentConversationId,
                content: content
            });
        } else {
            // Fallback REST
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
// TYPING INDICATOR
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
    status.innerHTML = '<span class="w-2 h-2 bg-amber-500 rounded-full inline-block animate-pulse"></span><span class="text-amber-600">' + username + ' écrit...</span>';
    setTimeout(function() {
        status.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full inline-block"></span><span>En ligne</span>';
    }, 2000);
}

// ============================================================
// BADGE NON-LUS
// ============================================================
function updateUnreadBadge(count) {
    // Met à jour le badge dans la sidebar (à personnaliser selon ton HTML)
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