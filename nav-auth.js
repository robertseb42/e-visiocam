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
        // Photo de profil validée par la modération (sinon l'initiale colorée)
        const photo = (typeof urlAvatar === 'function' && user.avatar) ? urlAvatar(user.avatar.url) : null;

        // Pseudo et adresse de la photo échappés : ils viennent du serveur et finissent dans du HTML
        const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        navAuth.innerHTML = `
            <div class="relative" id="userMenuWrapper">
                <button data-user-menu-toggle class="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-slate-100 transition-colors">
                    <div class="relative">
                        ${photo ? `<img src="${esc(photo)}" alt="" class="w-9 h-9 rounded-full object-cover">` : `<div class="w-9 h-9 rounded-full bg-gradient-to-r ${avatarGradient} text-white flex items-center justify-center font-bold text-sm">${esc(avatarDisplay)}</div>`}
                        <span data-nav-amis-point title="Demandes d’ami reçues" class="hidden absolute -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-bold items-center justify-center ring-2 ring-white" style="background:#a855f7;bottom:-4px">0</span>
                        ${user.role === 'super_admin' ? `<span id="navContactDot" title="Demandes de contact non lues" class="hidden absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">0</span>` : ''}
                    </div>
                    <span class="hidden sm:inline text-sm font-bold text-slate-900">${roleIcon} ${esc(user.username)}</span>
                    <i class="fa-solid fa-chevron-down text-xs text-slate-400"></i>
                </button>

                <div id="userMenuDropdown" style="z-index:10000" class="hidden absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50">
                    <div class="p-3 border-b border-slate-100 flex items-center gap-3">
                        ${photo ? `<img src="${esc(photo)}" alt="" class="w-10 h-10 rounded-full object-cover">` : `<div class="w-10 h-10 rounded-full bg-gradient-to-r ${avatarGradient} text-white flex items-center justify-center font-bold">${esc(avatarDisplay)}</div>`}
                        <div class="flex-1 min-w-0">
                            <p class="text-xs text-slate-500">Connecté en tant que</p>
                            <p class="text-sm font-bold text-slate-900 truncate">${esc(user.username)}</p>
                        </div>
                    </div>
                    <div class="p-2">
                        <a href="profile.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-user w-4" style="color:${genreCouleur(user)}"></i> Mon profil
                        </a>
                        <a href="messages.html" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-envelope-open-text w-4" style="color:#0ea5e9"></i> Ma messagerie
                            </div>
                        </a>
                        <a href="amis.html" data-nav-amis class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-user-group w-4" style="color:#a855f7"></i> Mes amis
                            </div>
                            <span data-nav-amis-badge title="Demandes d’ami reçues" class="hidden bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">0</span>
                        </a>
                        <a href="visiteurs.html" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <div class="flex items-center gap-3">
                                <i class="fa-solid fa-eye w-4" style="color:#f59e0b"></i> Qui a vu mon profil
                            </div>
                            <span data-nav-visites-badge title="Nouvelles visites" class="hidden bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">0</span>
                        </a>
                        <a href="favoris.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-heart w-4" style="color:#ff1680"></i> Mes favoris
                        </a>
                        <a href="credits.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-gift w-4 text-amber-500"></i> Mes récompenses
                        </a>
                        <a href="aide.html" class="flex items-center gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                            <i class="fa-solid fa-life-ring w-4" style="color:#22c55e"></i> Aide
                        </a>
                        ${['moderator', 'super_admin', 'guide_editor', 'animateur'].includes(user.role) ? `
                            <a href="espace-equipe.html" class="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg">
                                <div class="flex items-center gap-3">
                                    <i class="fa-solid fa-gauge-high w-4" style="color:#ff1680"></i> Espace équipe
                                </div>
                                ${user.role === 'super_admin' ? '<span id="navContactBadge" class="hidden bg-rose-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full" title="Messages de contact non lus">0</span>' : ''}
                            </a>
                        ` : ''}
                    </div>
                    <div class="p-2 border-t border-slate-100">
                        <button data-logout class="w-full flex items-center gap-3 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 rounded-lg">
                            <i class="fa-solid fa-arrow-right-from-bracket w-4"></i> Déconnexion
                        </button>
                    </div>
                </div>
            </div>
        `;
        navAuth.querySelector('[data-user-menu-toggle]').addEventListener('click', function(e) { window.toggleUserMenu(e); });
        // La radio persistante vit dans app-shell, au-dessus de la page : elle passait devant le menu.
        // On la masque tant que le menu est ouvert, quelle que soit la façon dont il s'ouvre ou se ferme.
        const menu = navAuth.querySelector('#userMenuDropdown');
        masquerRadio(false);
        new MutationObserver(function() { masquerRadio(!menu.classList.contains('hidden')); })
            .observe(menu, { attributes: true, attributeFilter: ['class'] });
        navAuth.querySelector('[data-logout]').addEventListener('click', function() { logout(); });

        startUnreadWatcher();
        verifierPhoto(user);
    }

    // Photo de profil : une fois par page, on vérifie auprès du serveur (validation ou refus par la modération)
    let photoVerifiee = false;
    function verifierPhoto(user) {
        if (photoVerifiee || typeof apiCall !== 'function' || typeof saveUser !== 'function') return;
        photoVerifiee = true;
        apiCall('/users/me').then(function (d) {
            if (!d || !d.user) return;
            const avant = JSON.stringify((user && user.avatar) || null), apres = JSON.stringify(d.user.avatar || null);
            const courant = getCurrentUser() || {};
            saveUser(Object.assign({}, courant, { avatar: d.user.avatar || null, departement: d.user.departement || null }));
            if (avant !== apres) initNavAuth();
        }).catch(function () {});
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
    // Branché ici plutôt qu'en attribut onclick dans chaque page (bloqué par la CSP stricte)
    document.addEventListener('click', function(e) {
        if (e.target.closest && e.target.closest('[data-nav-bell]')) window.ouvrirNotifications();
    });

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
    // Redessine le menu du compte (ex. après un changement de photo de profil)
    window.EvcRafraichirNav = function () { try { initNavAuth(); } catch (e) {} };

    // ═══════════════════════════════════════════════════════════
    // 👥 AMIS : « Julie est en ligne », demandes d'ami reçues (pastille du menu)
    //   - pages avec temps réel : événements ami:connecte / ami:demande / ami:accepte
    //   - toutes les pages : GET /api/amis/pouls toutes les 45 s (compte aussi comme présence)
    //   Au plus une carte par ami toutes les 30 min (le serveur le garantit aussi).
    // ═══════════════════════════════════════════════════════════
    var AMIS_PAUSE_MS = 30 * 60 * 1000;
    var amisDemarre = false, amisPoulsEnCours = false;
    function memoire(cle, val) {
        try {
            if (val === undefined) return JSON.parse(sessionStorage.getItem(cle) || 'null');
            sessionStorage.setItem(cle, JSON.stringify(val));
        } catch (e) { return null; }
    }
    function majBadgeAmis(n) {
        n = Number(n) || 0;
        window.__evcAmisDemandes = n;
        document.querySelectorAll('[data-nav-amis-badge],[data-nav-amis-point]').forEach(function (el) {
            el.textContent = n > 99 ? '99+' : String(n);
            el.classList.toggle('hidden', n === 0);
            el.style.display = n > 0 ? 'flex' : 'none';
        });
        try { window.dispatchEvent(new CustomEvent('evc:amis-demandes', { detail: { count: n } })); } catch (e) {}
    }
    // Les cartes s'affichent dans la fenêtre principale (au-dessus de la radio continue)
    function docHaut() { try { if (window.top !== window && window.top.document && window.top.document.body) return window.top.document; } catch (e) {} return document; }
    function pileAmis() {
        var d = docHaut(), p = d.getElementById('evcAmisPile');
        if (!p) {
            p = d.createElement('div'); p.id = 'evcAmisPile'; p.setAttribute('aria-live', 'polite');
            // Mobile : en haut (la barre du bas et la radio occupent le bas de l'écran) ; ordinateur : en bas à gauche
            var W = d.defaultView || window, etroit = (W.innerWidth || 1024) < 768;
            p.style.cssText = 'position:fixed;z-index:2147482400;display:flex;flex-direction:column;gap:10px;width:min(340px,calc(100vw - 32px));pointer-events:none;' +
                (etroit ? 'top:76px;left:50%;transform:translateX(-50%)' : 'left:16px;bottom:16px');
            d.body.appendChild(p);
        }
        return p;
    }
    function carteAmi(texte, gras, boutons) {
        var d = docHaut(), clair = document.documentElement.getAttribute('data-theme') === 'light';
        var c = d.createElement('div');
        c.setAttribute('role', 'status'); c.setAttribute('data-evc-ami-carte', '');
        c.style.cssText = 'pointer-events:auto;display:flex;align-items:center;gap:10px;padding:12px 12px 12px 14px;border-radius:16px;font:500 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.35);border:1px solid ' +
            (clair ? '#e2e8f0;background:#fff;color:#14161c' : '#3b3b43;background:#1c1c20;color:#f5f5f7') + ';border-left:4px solid #a855f7';
        var point = d.createElement('span'); point.style.cssText = 'flex:none;width:10px;height:10px;border-radius:50%;background:#22c55e';
        var t = d.createElement('div'); t.style.cssText = 'flex:1;min-width:0;overflow-wrap:anywhere';
        var b = d.createElement('b'); b.textContent = gras; t.appendChild(b); t.appendChild(d.createTextNode(texte));
        c.appendChild(point); c.appendChild(t);
        (boutons || []).forEach(function (bt) {
            var x = d.createElement('button'); x.type = 'button'; x.textContent = bt.texte;
            x.style.cssText = 'flex:none;min-height:36px;padding:6px 12px;border:0;border-radius:10px;font:800 13px Inter,system-ui,sans-serif;cursor:pointer;background:' + (clair ? '#e91e63;color:#fff' : '#ffe500;color:#111113');
            x.addEventListener('click', function () { c.remove(); location.href = bt.url; });
            c.appendChild(x);
        });
        var f = d.createElement('button'); f.type = 'button'; f.textContent = '×'; f.setAttribute('aria-label', 'Fermer');
        f.style.cssText = 'flex:none;border:0;background:transparent;color:inherit;opacity:.6;font-size:20px;cursor:pointer;padding:0 2px;min-width:28px;min-height:36px';
        f.addEventListener('click', function () { c.remove(); });
        c.appendChild(f);
        pileAmis().appendChild(c);
        setTimeout(function () { c.remove(); }, 15000);
    }
    function amiConnecte(d) {
        if (!d || !d.id || !d.pseudo) return;
        var vus = memoire('evc-amis-vus') || {}, t = Date.now();
        if (d.seq && vus['s' + d.seq]) return;                      // déjà reçu (socket + relève)
        if (vus['a' + d.id] && t - vus['a' + d.id] < AMIS_PAUSE_MS) return;
        Object.keys(vus).forEach(function (k) { if (t - vus[k] > AMIS_PAUSE_MS) delete vus[k]; });
        if (d.seq) vus['s' + d.seq] = t;
        vus['a' + d.id] = t;
        memoire('evc-amis-vus', vus);
        carteAmi(' est en ligne', d.pseudo, [{ texte: 'Écrire', url: 'messages.html?ecrire=' + Number(d.id) }]);
    }
    function demandeRecue(n, de) {
        var avant = memoire('evc-amis-recues');
        memoire('evc-amis-recues', n);
        majBadgeAmis(n);
        if (avant !== null && n > avant && !/amis(\.html)?$/.test(location.pathname)) {
            if (de && de.username) carteAmi(' vous a envoyé une demande d’ami', de.username, [{ texte: 'Voir', url: 'amis.html#recues' }]);
            else carteAmi(' demande d’ami reçue', n > 1 ? n + ' ' : 'Nouvelle', [{ texte: 'Voir', url: 'amis.html#recues' }]);
        }
    }
    function brancherAmis(s) {
        if (!s || s.__evcAmis) return; s.__evcAmis = true;
        s.on('ami:connecte', amiConnecte);
        s.on('ami:demande', function (d) { if (d && typeof d.recues === 'number') demandeRecue(d.recues, d.de); });
        s.on('ami:accepte', function (d) {
            if (d && d.par && d.par.username) carteAmi(' a accepté votre demande d’ami', d.par.username, [{ texte: 'Écrire', url: 'messages.html?ecrire=' + Number(d.par.id) }]);
        });
    }
    async function poulsAmis() {
        if (amisPoulsEnCours || document.hidden || typeof apiCall !== 'function' || typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
        amisPoulsEnCours = true;
        try {
            var curseur = memoire('evc-amis-curseur');
            var r = await apiCall('/amis/pouls' + (typeof curseur === 'number' ? '?apres=' + curseur : ''));
            if (r && typeof r.curseur === 'number') memoire('evc-amis-curseur', r.curseur);
            (r && r.connectes || []).forEach(amiConnecte);
            if (r && typeof r.demandesRecues === 'number') demandeRecue(r.demandesRecues);
        } catch (e) {} finally { amisPoulsEnCours = false; }
    }
    function demarrerAmis() {
        if (amisDemarre) { majBadgeAmis(window.__evcAmisDemandes || 0); return; }
        amisDemarre = true;
        poulsAmis();
        setInterval(poulsAmis, 45000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) poulsAmis(); });
    }
    window.EvcAmis = { badge: majBadgeAmis, actualiser: poulsAmis };
    // « Qui a vu mon profil » : pastille du menu du compte (nouvelles visites)
    var visitesN = 0;
    function majBadgeVisites() {
        document.querySelectorAll('[data-nav-visites-badge]').forEach(function (el) { el.textContent = visitesN > 99 ? '99+' : visitesN; el.classList.toggle('hidden', !visitesN || /visiteurs\.html$/.test(location.pathname)); });
    }
    var visitesAt = 0;
    async function poulsVisites() {
        if (document.hidden || typeof apiCall !== 'function' || typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
        if (Date.now() - visitesAt < 60000) { majBadgeVisites(); return; }
        visitesAt = Date.now();
        try { var r = await apiCall('/models/visiteurs/compte'); visitesN = (r && r.nouveaux) || 0; } catch (e) {}
        majBadgeVisites();
    }
    window.EvcVisites = { actualiser: poulsVisites };

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
                if (window.evcSurveillerSession) window.evcSurveillerSession(unreadSocket);   // fin de session (mot de passe changé, déconnexion…)

                unreadSocket.on('dm:unread-count', function(data) {
                    if (data && typeof data.count === 'number') {
                        updateNavBadge(data.count);
                    }
                });

                unreadSocket.on('dm:message', function(d) {
                    setTimeout(refreshUnreadCount, 500);
                    try { window.dispatchEvent(new CustomEvent('evc:dm', { detail: d || {} })); } catch (e) {}   // messagerie ouverte : mise à jour en direct
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
                unreadSocket.on('evenement:debut', function (d) {
                    if (!d || !d.titre || /chat(\.html)?$/.test(location.pathname) && new URLSearchParams(location.search).get('theme') === d.salon_slug) return;
                    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
                    var el = document.createElement('div'); el.className = 'ev-live-alert'; el.setAttribute('role', 'status');
                    el.innerHTML = '<span class="ev-live-dot"></span><div><b>' + esc(d.titre) + '</b> commence<small>' + esc(d.salon_nom) + '</small></div>' +
                        '<a href="chat.html?theme=' + encodeURIComponent(d.salon_slug) + '">Rejoindre</a><button type="button" aria-label="Fermer">×</button>';
                    el.querySelector('button').addEventListener('click', function () { el.remove(); });
                    document.body.appendChild(el); setTimeout(function () { el.remove(); }, 20000);
                });
                // 💞 Découverte : c'est réciproque
                unreadSocket.on('decouverte:reciproque', function(d) {
                    if (d && d.username && typeof showToast === 'function') showToast('💞 C\u2019est réciproque avec ' + d.username + ' ! Écrivez-lui depuis « Découverte ».', 'success');
                });
                // 🔒 Album privé : demande d'accès reçue, accès accordé
                unreadSocket.on('album:demande', function(d) {
                    if (d && d.de && typeof showToast === 'function') showToast('🔒 ' + d.de.username + ' demande l\u2019accès à votre album privé (Mon compte)', 'info');
                });
                unreadSocket.on('album:acces', function(d) {
                    if (d && d.par && typeof showToast === 'function') showToast('🔑 ' + d.par.username + ' vous a ouvert son album privé', 'success');
                });
                unreadSocket.on('favori:live', function(d) {
                    if (d && d.username) alerteLive(d);
                });
                brancherAmis(unreadSocket);
            }
        }
        demarrerAmis();
        poulsVisites();

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

    // 🔔 La cloche affiche aussi le nombre de messages non lus (en plus des pastilles « Messagerie ») :
    //    elle se balance tant qu'il en reste, sonne et joue un carillon à l'arrivée d'un message.
    // 📬 Pastille du nombre de messages non lus sur « Messagerie » (barre du haut) et « Ma messagerie » (menu du compte)
    function pastillesMessagerie(count) {
        document.querySelectorAll('.cam-topnav a[href="messages.html"], #userMenuDropdown a[href="messages.html"]').forEach(function (a) {
            var p = a.querySelector('.evc-nb-msg');
            if (!p) {
                p = document.createElement('span');
                p.className = 'evc-nb-msg';
                p.setAttribute('aria-hidden', 'true');
                p.style.cssText = 'display:none;min-width:18px;height:18px;margin-left:6px;padding:0 5px;border-radius:999px;background:#ff1680;color:#fff;font-size:11px;font-weight:800;line-height:18px;text-align:center;vertical-align:middle';
                (a.querySelector('div') || a).appendChild(p);
            }
            p.textContent = count > 99 ? '99+' : String(count);
            p.style.display = count > 0 ? 'inline-block' : 'none';
            a.setAttribute('aria-label', count > 0 ? 'Messagerie, ' + count + ' message' + (count > 1 ? 's' : '') + ' non lu' + (count > 1 ? 's' : '') : 'Messagerie');
        });
    }

    function updateNavBadge(count) {
        pastillesMessagerie(count);
        const nouveauMessage = dernierCompteVu !== null && count > dernierCompteVu;
        mettreAJourCloche(count);
        if (nouveauMessage) animerCloche(true);
        dernierCompteVu = count;
        // Partagé avec la barre du bas (mobile-nav.js) : dernier compte connu + événement à chaque mise à jour
        window.__evcDmNonLus = count;
        try { window.dispatchEvent(new CustomEvent('evc:dm-non-lus', { detail: { count: count } })); } catch (e) {}
    }

    function masquerRadio(masquer) {
        try { if (window.top !== window) window.top.document.documentElement.classList.toggle('evc-menu-compte', masquer); } catch (e) {}
    }
    // Clic sur un lien du menu : la page change, la radio doit réapparaître sur la suivante
    window.addEventListener('pagehide', function() { masquerRadio(false); });

    window.toggleUserMenu = function(event) {
        event.stopPropagation();
        const dropdown = document.getElementById('userMenuDropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
        pastillesMessagerie(window.__evcDmNonLus || 0);
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
