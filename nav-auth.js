// ============================================================
// NAV-AUTH.JS - Menu utilisateur + Badge messages non lus
// ============================================================

(function() {
    function initNavAuth() {
        const navAuth = document.getElementById('navAuth');
        if (!navAuth) return;

        const user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const loggedIn = (typeof isLoggedIn === 'function') ? isLoggedIn() : false;

        if (!loggedIn || !user) {
            navAuth.innerHTML = `
                <a href="login.html" class="px-4 py-2 text-sm font-bold text-slate-600 hover:text-brand-primary transition-colors">Connexion</a>
                <a href="register.html" class="px-4 py-2 text-sm font-bold text-white bg-gradient-to-r from-brand-primary to-rose-500 rounded-xl hover:opacity-90 transition-all">Inscription</a>
            `;
            return;
        }

        const initial = user.username.charAt(0).toUpperCase();
        const roleLabels = { super_admin: '👑', moderator: '🛡️', model: '⭐', user: '' };
        const roleIcon = roleLabels[user.role] || '';

        navAuth.innerHTML = `
            <div class="relative" id="userMenuWrapper">
                <button onclick="toggleUserMenu(event)" class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <div class="relative">
                        <div class="w-9 h-9 rounded-full bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm">${initial}</div>
                        <span id="navUnreadBadge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white"></span>
                    </div>
                    <span class="hidden sm:inline text-sm font-bold text-slate-900">${roleIcon} ${user.username}</span>
                    <i class="fa-solid fa-chevron-down text-xs text-slate-400"></i>
                </button>

                <div id="userMenuDropdown" class="hidden absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                    <div class="p-3 border-b border-slate-100">
                        <p class="text-xs text-slate-500">Connecté en tant que</p>
                        <p class="text-sm font-bold text-slate-900">${user.username}</p>
                    </div>
                    <div class="p-2">
                        <a href="profile.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-user w-4 text-slate-400"></i> Mon profil
                        </a>
                        <a href="messages.html" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-comments w-4 text-slate-400"></i> Mes messages
                            </div>
                            <span id="menuUnreadBadge" class="hidden bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full"></span>
                        </a>
                        <a href="credits.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-coins w-4 text-amber-500"></i> Mes crédits
                        </a>
                        ${user.role === 'moderator' || user.role === 'super_admin' ? `
                            <a href="moderation.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                <i class="fa-solid fa-shield-halved w-4 text-blue-500"></i> Modération
                            </a>
                        ` : ''}
                        ${user.role === 'super_admin' ? `
                            <a href="admin.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                <i class="fa-solid fa-crown w-4 text-purple-500"></i> Admin
                            </a>
                        ` : ''}
                    </div>
                    <div class="p-2 border-t border-slate-100">
                        <button onclick="logout()" class="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg">
                            <i class="fa-solid fa-arrow-right-from-bracket w-4"></i> Déconnexion
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.addEventListener('click', function(e) {
            const wrapper = document.getElementById('userMenuWrapper');
            const dropdown = document.getElementById('userMenuDropdown');
            if (wrapper && dropdown && !wrapper.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });

        startUnreadWatcher();
    }

    let unreadSocket = null;
    let pollingInterval = null;

    function startUnreadWatcher() {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
        refreshUnreadCount();

        if (typeof io !== 'undefined') {
            if (!unreadSocket) {
                unreadSocket = io('https://e-visiocam-api.onrender.com', {
                    auth: { token: getToken() },
                    transports: ['websocket', 'polling']
                });

                unreadSocket.on('dm:unread-count', function(data) {
                    if (data && typeof data.count === 'number') {
                        updateNavBadge(data.count);
                    }
                });

                unreadSocket.on('dm:message', function() {
                    setTimeout(refreshUnreadCount, 500);
                });
            }
        }

        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(refreshUnreadCount, 30000);
    }

    async function refreshUnreadCount() {
        if (typeof apiCall !== 'function') return;
        try {
            const data = await apiCall('/messages/unread-count');
            updateNavBadge(data.count || 0);
        } catch (err) {}
    }

    function updateNavBadge(count) {
        const badge = document.getElementById('navUnreadBadge');
        const menuBadge = document.getElementById('menuUnreadBadge');

        if (badge) {
            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.classList.remove('hidden');
                badge.style.animation = 'none';
                setTimeout(() => { badge.style.animation = 'badgePop 0.4s ease-in-out'; }, 10);
            } else {
                badge.classList.add('hidden');
            }
        }

        if (menuBadge) {
            if (count > 0) {
                menuBadge.textContent = count;
                menuBadge.classList.remove('hidden');
            } else {
                menuBadge.classList.add('hidden');
            }
        }

        const sidebarBadge = document.querySelector('[data-unread-badge]');
        if (sidebarBadge) {
            if (count > 0) {
                sidebarBadge.textContent = count;
                sidebarBadge.style.display = 'inline-block';
            } else {
                sidebarBadge.style.display = 'none';
            }
        }
    }

    window.toggleUserMenu = function(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('userMenuDropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initNavAuth);
    } else {
        initNavAuth();
    }

    window.refreshUnreadCount = refreshUnreadCount;
    window.updateNavBadge = updateNavBadge;
})();
