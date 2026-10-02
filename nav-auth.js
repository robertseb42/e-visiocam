// ============================================================
// NAV-AUTH.JS - Menu utilisateur + Badge messages non lus
// ============================================================

(function() {
    // Éviter les doubles initialisations
    if (window.__navAuthInitialized) return;
    window.__navAuthInitialized = true;

    // Éviter les doubles écouteurs (bug du menu qui se ferme trop vite)
    if (!window.__navAuthClickListenerAttached) {
        document.addEventListener('click', function(e) {
            const wrapper = document.getElementById('userMenuWrapper');
            const dropdown = document.getElementById('userMenuDropdown');
            if (wrapper && dropdown && !wrapper.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        window.__navAuthClickListenerAttached = true;
    }

    // ═══════════════════════════════════════════════════════════
    // COULEUR D'AVATAR SELON GENRE (PRIORITÉ) PUIS RÔLE
    // ═══════════════════════════════════════════════════════════
    function getAvatarGradient(user) {
        const gender = (user.gender || '').toLowerCase();

        // 🔵 GENRE : Homme
        if (gender === 'homme' || gender === 'male' || gender === 'h') {
            return 'from-blue-500 to-cyan-500';
        }
        // 🌸 GENRE : Femme
        if (gender === 'femme' || gender === 'female' || gender === 'f') {
            return 'from-pink-500 to-rose-500';
        }
        // 🟡 GENRE : Autre
        if (gender === 'autre' || gender === 'other') {
            return 'from-amber-400 to-yellow-500';
        }

        // RÔLE (si pas de genre)
        if (user.role === 'super_admin') return 'from-purple-500 to-pink-600';
        if (user.role === 'moderator') return 'from-blue-500 to-indigo-600';
        if (user.role === 'model') return 'from-amber-400 to-orange-500';

        // Défaut
        return 'from-slate-500 to-slate-700';
    }

    function getAvatarIcon(user) {
        const gender = (user.gender || '').toLowerCase();

        // GENRE en priorité
        if (gender === 'homme' || gender === 'male' || gender === 'h') return '♂';
        if (gender === 'femme' || gender === 'female' || gender === 'f') return '♀';
        if (gender === 'autre' || gender === 'other') return '⚧';

        // Rôle sinon
        if (user.role === 'super_admin') return '👑';
        if (user.role === 'moderator') return '🛡️';
        if (user.role === 'model') return '⭐';

        return '';  // Sinon 1ère lettre
    }

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
        const avatarGradient = getAvatarGradient(user);
        const avatarIcon = getAvatarIcon(user);
        const avatarDisplay = avatarIcon || initial;

        navAuth.innerHTML = `
            <div class="relative" id="userMenuWrapper">
                <button onclick="toggleUserMenu(event)" class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <div class="relative">
                        <div class="w-9 h-9 rounded-full bg-gradient-to-r ${avatarGradient} text-white flex items-center justify-center font-bold text-sm">${avatarDisplay}</div>
                        <span id="navUnreadBadge" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white"></span>
                    </div>
                    <span class="hidden sm:inline text-sm font-bold text-slate-900">${roleIcon} ${user.username}</span>
                    <i class="fa-solid fa-chevron-down text-xs text-slate-400"></i>
                </button>

                <div id="userMenuDropdown" class="hidden absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                    <div class="p-3 border-b border-slate-100 flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-gradient-to-r ${avatarGradient} text-white flex items-center justify-center font-bold">${avatarDisplay}</div>
                        <div class="flex-1 min-w-0">
                            <p class="text-xs text-slate-500">Connecté en tant que</p>
                            <p class="text-sm font-bold text-slate-900 truncate">${user.username}</p>
                        </div>
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
                        <a href="compte.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-gear w-4 text-slate-400"></i> Paramètres
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

        startUnreadWatcher();
    }

    // ═══════════════════════════════════════════════════════════
    // 🔔 CLOCHE DE NOTIFICATION : elle bouge, affiche le point rose
    //    à l'arrivée d'un message, sonne, et s'éteint à la lecture.
    // ═══════════════════════════════════════════════════════════
    let dernierCompteVu = null;
    let ctxSon = null;

    function injecterStyleCloche() {
        if (document.getElementById('styleClocheNotif')) return;
        const style = document.createElement('style');
        style.id = 'styleClocheNotif';
        style.textContent = `
            @keyframes clocheBalancier { 0%,60%,100%{transform:rotate(0)} 70%{transform:rotate(12deg)} 80%{transform:rotate(-10deg)} 90%{transform:rotate(6deg)} }
            @keyframes clocheSonne { 0%{transform:rotate(0) scale(1)} 20%{transform:rotate(20deg) scale(1.12)} 40%{transform:rotate(-18deg) scale(1.12)} 60%{transform:rotate(12deg) scale(1.08)} 80%{transform:rotate(-8deg)} 100%{transform:rotate(0) scale(1)} }
            [data-nav-bell] i { display:inline-block; transform-origin:50% 0 }
            [data-nav-bell].cloche-bouge i { animation: clocheBalancier 2.6s ease-in-out infinite }
            [data-nav-bell].cloche-sonne i { animation: clocheSonne .9s ease-in-out }
            [data-nav-bell-badge] { transition: transform .2s ease }
        `;
        document.head.appendChild(style);
    }

    // Petit carillon à deux tons (aucun fichier à télécharger)
    function jouerCloche() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            ctxSon = ctxSon || new AC();
            if (ctxSon.state === 'suspended') ctxSon.resume();
            const t0 = ctxSon.currentTime;
            [[988, 0], [1319, 0.13]].forEach(function(paire) {
                const o = ctxSon.createOscillator();
                const g = ctxSon.createGain();
                o.type = 'sine';
                o.frequency.value = paire[0];
                const t = t0 + paire[1];
                g.gain.setValueAtTime(0.0001, t);
                g.gain.exponentialRampToValueAtTime(0.28, t + 0.012);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
                o.connect(g);
                g.connect(ctxSon.destination);
                o.start(t);
                o.stop(t + 1.2);
            });
        } catch (e) {}
    }

    // La cloche qui bouge (et sonne) quand un message arrive
    function animerCloche(nouveauMessage) {
        injecterStyleCloche();
        if (!nouveauMessage) return;
        document.querySelectorAll('[data-nav-bell]').forEach(function(cloche) {
            cloche.classList.remove('cloche-sonne');
            void cloche.offsetWidth;
            cloche.classList.add('cloche-sonne');
            setTimeout(function() { cloche.classList.remove('cloche-sonne'); }, 1000);
        });
        jouerCloche();
    }

    // Le point rose : visible seulement s'il reste des messages non lus
    function mettreAJourCloche(count) {
        document.querySelectorAll('[data-nav-bell]').forEach(function(cloche) {
            const point = cloche.querySelector('[data-nav-bell-badge]');
            if (point) {
                if (count > 0) {
                    point.textContent = count > 99 ? '99+' : count;
                    point.classList.remove('hidden');
                    point.style.display = 'flex';
                } else {
                    point.classList.add('hidden');
                    point.style.display = 'none';
                }
            }
            cloche.classList.toggle('cloche-bouge', count > 0);
            cloche.title = count > 0
                ? count + ' message' + (count > 1 ? 's' : '') + ' non lu' + (count > 1 ? 's' : '')
                : 'Aucun nouveau message';
        });
    }

    // Ouvre la messagerie (ou la connexion si besoin)
    window.ouvrirNotifications = function() {
        if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
            window.location.href = 'login.html?redirect=messages.html';
        } else {
            window.location.href = 'messages.html';
        }
    };

    let unreadSocket = null;
    let pollingInterval = null;

    function startUnreadWatcher() {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
        refreshUnreadCount();

        if (typeof io !== 'undefined') {
            if (!unreadSocket) {
                unreadSocket = io('https://api.e-visiocam.com', {
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

        // 🔔 Cloche : point rose, balancier, et carillon à l'arrivée d'un message
        const nouveauMessage = dernierCompteVu !== null && count > dernierCompteVu;
        mettreAJourCloche(count);
        if (nouveauMessage) animerCloche(true);
        dernierCompteVu = count;
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
    window.getAvatarGradient = getAvatarGradient;
})();
