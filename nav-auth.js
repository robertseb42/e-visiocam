// ============================================================
// NAV-AUTH.JS - Menu utilisateur + cloche des messages non lus
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
    // Couleur selon le genre : fille = rose, garçon = bleu, non précisé ou non genré = jaune
    var GENRE_COULEURS = { femme: '#ec4899', homme: '#3b82f6', autre: '#eab308' };
    function genreCle(user) {
        var g = ((user && user.gender) || '').toLowerCase();
        if (g === 'femme' || g === 'female' || g === 'f') return 'femme';
        if (g === 'homme' || g === 'male' || g === 'h') return 'homme';
        return 'autre';   // non précisé, autre, non genré
    }
    function genreCouleur(user) { return GENRE_COULEURS[genreCle(user)]; }

    function getAvatarGradient(user) {
        var k = genreCle(user);
        if (k === 'femme') return 'from-pink-500 to-rose-500';
        if (k === 'homme') return 'from-blue-500 to-cyan-500';
        return 'from-amber-400 to-yellow-500';
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
                        ${user.role === 'super_admin' ? `<span id="navContactDot" title="Messages contact non lus" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">0</span>` : ''}
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
                            <i class="fa-solid fa-user w-4" style="color:${genreCouleur(user)}"></i> Mon profil
                        </a>
                        <a href="messages.html" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-comments w-4" style="color:#0ea5e9"></i> Mes messages
                            </div>
                        </a>
                        <a href="favoris.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-heart w-4" style="color:#ff1680"></i> Mes favoris
                        </a>
                        <a href="credits.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-gift w-4 text-amber-500"></i> Mes récompenses
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
                            <a href="admin.html#contact" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                <div class="flex items-center gap-3">
                                    <i class="fa-solid fa-envelope w-4 text-rose-500"></i> Messages contact
                                </div>
                                <span id="navContactBadge" class="hidden bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">0</span>
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

    // Petite carte « X est en direct » en bas à gauche, 12 secondes
    function alerteLive(d) {
        var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
        var el = document.createElement('div');
        el.className = 'ev-live-alert';
        el.setAttribute('role', 'status');
        el.innerHTML = '<span class="ev-live-dot"></span><div><b>' + esc(d.username) + '</b> est en direct' +
            (d.salon ? '<small>' + esc(d.salon) + '</small>' : '') + '</div>' +
            '<a href="live.html">Regarder</a><button type="button" aria-label="Fermer">×</button>';
        el.querySelector('button').onclick = function () { el.remove(); };
        document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 12000);
    }

    // ⚖️ Le membre vient d'être sanctionné : explication claire, puis retour à l'accueil si besoin
    function afficherSanction(d) {
        if (!d || !d.type) return;
        var fin = d.jusqua ? new Date(d.jusqua).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ') : '';
        if (d.type === 'unmute') { if (typeof showToast === 'function') showToast('Vous pouvez de nouveau écrire.'); return; }
        if (d.type === 'mute') {
            if (typeof showToast === 'function') showToast('🔇 La modération vous a retiré la parole' + (fin ? ' jusqu\'au ' + fin : '') + (d.raison ? ' — ' + d.raison : ''), 'warning');
            return;
        }
        if (document.getElementById('evcSanctionInfo')) return;
        var titre = d.type === 'ban' ? (d.definitif ? 'Compte banni' : 'Compte suspendu') : 'Vous avez été expulsé';
        var texte = d.message || (d.type === 'ban' ? (d.definitif ? 'Votre compte a été banni définitivement.' : 'Votre compte est suspendu jusqu\'au ' + fin + '.')
            : (fin ? 'Vous ne pouvez pas revenir avant le ' + fin + '.' : 'Vous avez été expulsé par la modération.'));
        var el = document.createElement('div');
        el.id = 'evcSanctionInfo';
        el.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(10,10,14,.85);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,sans-serif';
        el.innerHTML = '<div style="max-width:420px;width:100%;background:#1c1c20;border:1px solid #3a3a42;border-radius:20px;padding:28px;text-align:center;color:#f5f5f6">' +
            '<div style="font-size:40px;line-height:1">' + (d.type === 'ban' ? '🔨' : '🚪') + '</div>' +
            '<h2 style="font-size:20px;font-weight:800;margin:12px 0 8px"></h2><p data-t style="font-size:14px;color:#c4c4cc;margin:0 0 6px"></p>' +
            '<p data-r style="font-size:13px;color:#a6a6b1;margin:0 0 18px"></p>' +
            '<a href="index.html" style="display:inline-block;padding:11px 22px;background:#ffe500;color:#111113;font-weight:700;border-radius:12px;text-decoration:none">Retour à l\'accueil</a></div>';
        el.querySelector('h2').textContent = titre;
        el.querySelector('[data-t]').textContent = texte;
        el.querySelector('[data-r]').textContent = d.raison && !(d.message || '').includes(d.raison) ? 'Motif : ' + d.raison : '';
        document.body.appendChild(el);
        // La session n'est plus utilisable : on oublie le membre sur cet appareil (sauf simple expulsion)
        if (d.type === 'ban' || fin) { try { if (typeof clearUser === 'function') clearUser(); } catch (e) {} }
    }
    window.EvcAfficherSanction = afficherSanction;

    let unreadSocket = null;
    let pollingInterval = null;

    function startUnreadWatcher() {
        if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
        refreshUnreadCount();

        if (typeof io !== 'undefined') {
            if (!unreadSocket) {
                unreadSocket = io('https://api.e-visiocam.com', {
                    withCredentials: true,
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

                // ⚖️ Sanction de la modération (expulsion, bannissement, sourdine)
                unreadSocket.on('moderation:sanction', afficherSanction);

                // 🎁 Crédits gagnés (programme de récompenses)
                unreadSocket.on('recompense:gain', function(d) {
                    if (!d || !d.montant) return;
                    if (typeof showToast === 'function') showToast('🎁 +' + d.montant + ' crédits · ' + (d.libelle || 'Récompense'), 'success');
                    document.querySelectorAll('[data-evc-solde]').forEach(function (el) { if (typeof d.solde === 'number') el.textContent = d.solde; });
                    try { window.dispatchEvent(new CustomEvent('evc:recompense', { detail: d })); } catch (e) {}
                });

                // ❤️ Un modèle suivi vient de lancer un live
                unreadSocket.on('favori:live', function(d) {
                    if (d && d.username) alerteLive(d);
                });
            }
        }

        if (pollingInterval) clearInterval(pollingInterval);
        pollingInterval = setInterval(refreshUnreadCount, 30000);

        // 👑 Super Admin : compteur des messages du formulaire de contact
        if (typeof isSuperAdmin === 'function' && isSuperAdmin()) {
            refreshContactCount();
            if (unreadSocket && !unreadSocket._contactBranche) {
                unreadSocket._contactBranche = true;
                unreadSocket.on('contact:unread-count', function(data) {
                    if (data && typeof data.count === 'number') updateContactBadge(data.count);
                });
            }
            if (!contactInterval) contactInterval = setInterval(refreshContactCount, 30000);
        }
    }

    let contactInterval = null;
    async function refreshContactCount() {
        try {
            const data = await apiCall('/contact/admin/unread-count');
            updateContactBadge(data.count || 0);
        } catch (err) {}
    }

    function updateContactBadge(count) {
        ['navContactBadge', 'navContactDot'].forEach(function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = count > 99 ? '99+' : String(count);
            el.classList.toggle('hidden', count === 0);
        });
    }

    async function refreshUnreadCount() {
        if (typeof apiCall !== 'function') return;
        try {
            const data = await apiCall('/messages/unread-count');
            updateNavBadge(data.count || 0);
        } catch (err) {}
    }

    // 🔔 La cloche est le SEUL indicateur de messages non lus : le nombre s'affiche dessus,
    //    elle se balance tant qu'il en reste, sonne et joue un carillon à l'arrivée d'un message.
    function updateNavBadge(count) {
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
