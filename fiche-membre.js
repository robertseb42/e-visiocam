// ============================================================
// FICHE MEMBRE (tiroir) — partagée par le panneau Admin et l'espace Modérateur
// ------------------------------------------------------------
//  EvcFicheMembre.ouvrir(userId, { api: '/admin' | '/mod', depuis: bouton })
//    • fiche : GET {api}/users/:id/fiche (le serveur retire l'e-mail et le journal pour un modérateur)
//    • notes internes : ajouter / supprimer les siennes ({api}/users/:id/notes)
//    • comptes liés : GET {api}/users/:id/comptes-lies (même connexion Internet, 90 jours)
//  EvcFicheMembre.configurer({ api, trouver(id), rafraichir(), charger() }) : réglages de la page
//  Menu « … », fenêtre de motif (rôle, mot de passe, suppression : Super Admin seulement).
// CSP stricte : aucun code inline, tout est branché avec addEventListener.
// Tout texte venant du serveur est échappé (esc) avant d'être inséré.
// ============================================================
(function () {
    'use strict';

    var MOTIF_MIN = 5;
    var NOTE_MAX = 1000;
    var NIVEAUX = { super_admin: 100, moderator: 50, model: 20, user: 10, bot: 10 };
    var ROLES = { user: 'Membre', model: 'Modèle', moderator: 'Modérateur', super_admin: 'Super Admin', bot: 'Animateur (IA)' };
    var ROLE_BADGE = { super_admin: 'evm-b-info', moderator: 'evm-b-info', model: 'evm-b-ok', user: '', bot: 'evm-b-warn' };
    var RAISONS = { contenu_illegal: 'Contenu illégal', mineur: 'Mineur', violence: 'Violence', harcelement: 'Harcèlement',
        contenu_sexuel_non_consenti: 'Contenu sexuel non consenti', spam: 'Spam', comportement: 'Comportement', autre: 'Autre' };
    var STATUTS_SIG = { pending: 'En attente', resolved: 'Traité', ignored: 'Ignoré', escalated: 'Transmis' };
    var TYPES_SANCTION = { mute: 'Muet', kick: 'Expulsion', ban: 'Bannissement', warn: 'Avertissement' };
    var TYPES_CREDITS = { reward: 'Gain', purchase: 'Achat', spend: 'Dépense', retrait: 'Retrait', gift: 'Cadeau' };
    var APPELS = { pending: 'En attente', accepted: 'Acceptée', rejected: 'Refusée' };
    var STATUTS_MEMBRE = { actif: ['evm-b-ok', 'actif'], muet: ['evm-b-warn', 'muet'], exclu: ['evm-b-danger', 'exclu'], banni: ['evm-b-danger', 'banni'] };
    var nf = new Intl.NumberFormat('fr-FR');

    var cfg = { api: '/admin', trouver: null, rafraichir: null, charger: null };
    var ficheOuverte = null;     // { id, data, api, lies }

    // ---------- Aides ----------
    function esc(t) {
        return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
    }
    function $(id) { return document.getElementById(id); }
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); else alert(m); }
    function moi() { try { return getCurrentUser() || {}; } catch (e) { return {}; } }
    function superAdmin() { return moi().role === 'super_admin'; }
    function api() { return (ficheOuverte && ficheOuverte.api) || cfg.api || '/admin'; }
    function racineApi() { return String(typeof API_URL === 'string' ? API_URL : '').replace(/\/api$/, ''); }
    function date(v) {
        if (!v) return null;
        if (typeof dateServeur === 'function') return dateServeur(v);
        if (typeof v === 'string') {
            var s = v.trim().replace(' ', 'T');
            return new Date(/(Z|[+-]\d\d:?\d\d)$/i.test(s) || !/T/.test(s) ? s : s + 'Z');
        }
        return new Date(v);
    }
    function dateCourte(v) {
        var d = date(v);
        if (!d || isNaN(d)) return '—';
        return d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');
    }
    function jour(v) {
        var d = date(v);
        if (!d || isNaN(d)) return '—';
        return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }
    // « à l'instant », « il y a 5 min », « il y a 3 h », « hier », « il y a 4 j », puis la date
    function relatif(v) {
        var d = date(v);
        if (!d || isNaN(d)) return 'jamais';
        var s = Math.round((Date.now() - d.getTime()) / 1000);
        if (s < 60) return 'à l\'instant';
        if (s < 3600) return 'il y a ' + Math.floor(s / 60) + ' min';
        if (s < 86400) return 'il y a ' + Math.floor(s / 3600) + ' h';
        if (s < 172800) return 'hier';
        if (s < 30 * 86400) return 'il y a ' + Math.floor(s / 86400) + ' j';
        return 'le ' + jour(v);
    }
    function peutAgir(u) {
        var m = moi();
        if (!u || !m.id || u.id === m.id) return false;
        return (NIVEAUX[m.role] || 0) > (NIVEAUX[u.role] || 0);
    }
    function enCours(u) { return window.EvcSanction ? EvcSanction.enCours(u) : []; }
    function badgeRole(r) { return '<span class="evm-badge ' + (ROLE_BADGE[r] || '') + '">' + esc(ROLES[r] || r) + '</span>'; }
    function initiale(nom) { return esc(String(nom || '?').charAt(0).toUpperCase()); }
    function trouver(id) {
        id = Number(id);
        var u = cfg.trouver ? cfg.trouver(id) : null;
        if (!u && ficheOuverte && ficheOuverte.id === id && ficheOuverte.data) {
            var i = ficheOuverte.data.identite;
            u = { id: i.id, username: i.username, role: i.role, status: i.statut === 'banni' ? 'banned' : 'active',
                kicked_until: i.statut === 'exclu' && i.sanctionEnCours ? i.sanctionEnCours.jusqua : null,
                muted_until: i.muetJusqua || null, banned_until: i.statut === 'banni' && i.sanctionEnCours ? i.sanctionEnCours.jusqua : null };
        }
        if (!u) { try { u = (typeof allUsers !== 'undefined' ? allUsers : []).find(function (x) { return x.id === id; }); } catch (e) {} }
        return u || { id: id, username: '#' + id, role: 'user' };
    }
    function recharger() {
        if (cfg.charger) cfg.charger();
        else if (typeof loadUsers === 'function') loadUsers();
    }
    function rafraichir() {
        if (cfg.rafraichir) cfg.rafraichir(); else recharger();
        if (ficheOuverte) chargerFiche(ficheOuverte.id);
    }
    function focusables(el) {
        return Array.prototype.filter.call(el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'),
            function (x) { return !x.disabled && x.getAttribute('aria-hidden') !== 'true' && (x.offsetWidth || x.offsetHeight || x.getClientRects().length); });
    }
    // Garde le focus dans « el » (Tab / Maj+Tab)
    function pieger(el, e) {
        if (e.key !== 'Tab') return;
        var f = focusables(el);
        if (!f.length) { e.preventDefault(); return; }
        if (e.shiftKey && (document.activeElement === f[0] || !el.contains(document.activeElement))) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }

    function sanctionner(u, type) {
        if (!window.EvcSanction) return;
        EvcSanction.ouvrir({ id: u.id, username: u.username, type: type, choisirType: !type, onDone: rafraichir });
    }

    // ============================================================
    // MENU « … » (libellés lisibles, clavier : flèches, Échap)
    // ============================================================
    function fermerMenu(rendreFocus) {
        var m = document.querySelector('.evm-menu');
        if (!m) return;
        var b = m._bouton;
        m.remove();
        document.removeEventListener('click', clicDehors, true);
        if (b) { b.setAttribute('aria-expanded', 'false'); if (rendreFocus) b.focus(); }
    }
    function clicDehors(e) { var m = document.querySelector('.evm-menu'); if (m && !m.contains(e.target) && e.target !== m._bouton && !(m._bouton && m._bouton.contains(e.target))) fermerMenu(false); }

    // Offrir des crédits : un modérateur ne s'en offre pas et n'en offre pas à l'équipe (même règle que le serveur)
    function peutOffrir(u) {
        if (typeof offrirA !== 'function' || u.status === 'banned') return false;
        if (superAdmin()) return true;
        return u.id !== moi().id && u.role !== 'moderator' && u.role !== 'super_admin';
    }

    function ouvrirMenu(u, bouton) {
        var deja = document.querySelector('.evm-menu');
        if (deja && deja._bouton === bouton) { fermerMenu(true); return; }
        fermerMenu(false);
        var agir = peutAgir(u), ec = enCours(u), banni = u.status === 'banned', sa = superAdmin();
        var items = [];
        if (peutOffrir(u)) items.push(['offrir', 'fa-gift', 'Offrir des crédits']);
        if (sa) items.push(['mdp', 'fa-key', 'Réinitialiser le mot de passe']);
        if (agir) {
            if (sa) items.push(['role', 'fa-user-shield', 'Changer le rôle']);
            if (items.length) items.push('-');
            items.push(ec.indexOf('mute') >= 0 ? ['lever-mute', 'fa-microphone', 'Rendre la parole'] : ['mute', 'fa-microphone-slash', 'Rendre muet']);
            items.push(ec.indexOf('kick') >= 0 ? ['lever-kick', 'fa-door-open', 'Lever l\'exclusion'] : ['kick', 'fa-right-from-bracket', 'Expulser']);
            if (banni) { if (sa) items.push(['lever-ban', 'fa-check', 'Débannir']); }
            else items.push(['ban', 'fa-ban', 'Bannir', true]);
            if (sa) { items.push('-'); items.push(['supprimer', 'fa-trash', 'Supprimer le compte', true]); }
        }
        if (!items.length) { toast('Aucune action possible sur ce compte', 'info'); return; }
        var m = document.createElement('div');
        m.className = 'evm-menu';
        m.setAttribute('role', 'menu');
        m.setAttribute('aria-label', 'Actions pour ' + u.username);
        m.innerHTML = items.map(function (it) {
            if (it === '-') return '<hr aria-hidden="true">';
            return '<button type="button" role="menuitem" tabindex="-1" data-menu="' + it[0] + '"' + (it[3] ? ' class="evm-m-danger"' : '') + '><i class="fa-solid ' + it[1] + '" aria-hidden="true"></i>' + esc(it[2]) + '</button>';
        }).join('');
        m._bouton = bouton;
        document.body.appendChild(m);
        placerMenu(m);
        bouton.setAttribute('aria-expanded', 'true');
        var boutons = Array.prototype.slice.call(m.querySelectorAll('[role="menuitem"]'));
        if (boutons[0]) boutons[0].focus();
        m.addEventListener('keydown', function (e) {
            var i = boutons.indexOf(document.activeElement);
            if (e.key === 'ArrowDown') { e.preventDefault(); boutons[(i + 1) % boutons.length].focus(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); boutons[(i - 1 + boutons.length) % boutons.length].focus(); }
            else if (e.key === 'Home') { e.preventDefault(); boutons[0].focus(); }
            else if (e.key === 'End') { e.preventDefault(); boutons[boutons.length - 1].focus(); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermerMenu(true); }
            else if (e.key === 'Tab') { fermerMenu(false); }
        });
        m.addEventListener('click', function (e) {
            var b = e.target.closest('[data-menu]');
            if (!b) return;
            fermerMenu(true);   // le focus revient sur « … », puis sur lui à la fermeture de la fenêtre suivante
            menuAction(b.getAttribute('data-menu'), u, bouton);
        });
        setTimeout(function () { document.addEventListener('click', clicDehors, true); }, 0);
    }
    // Position : sous le bouton, sans sortir de l'écran (recalculée au défilement)
    function placerMenu(m) {
        var b = m._bouton;
        if (!b || !document.body.contains(b)) return;
        var r = b.getBoundingClientRect();
        var w = m.offsetWidth, h = m.offsetHeight;
        var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
        var top = r.bottom + 6;
        if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
        m.style.left = left + 'px'; m.style.top = top + 'px';
    }
    window.addEventListener('resize', function () { fermerMenu(false); });
    window.addEventListener('scroll', function () { var m = document.querySelector('.evm-menu'); if (m) placerMenu(m); }, true);

    function menuAction(nom, u) {
        switch (nom) {
            case 'offrir':
                if (typeof offrirA === 'function') offrirA(u.username);
                break;
            case 'mdp': reinitialiserMdp(u.id, u.username); break;
            case 'role': changerRole(u.id); break;
            case 'mute': case 'kick': case 'ban': sanctionner(u, nom); break;
            case 'lever-mute': case 'lever-kick': case 'lever-ban':
                if (window.EvcSanction) EvcSanction.lever(u.id, nom.slice(6), rafraichir);
                break;
            case 'supprimer': supprimer(u.id); break;
        }
    }

    // ============================================================
    // FENÊTRE DE MOTIF (changer le rôle, réinitialiser, supprimer, traiter une alerte)
    // ============================================================
    // opt : { titre, texte, bouton, danger, avant (HTML en plus du motif), motifAide, motifFacultatif, valider(motif, form) → Promise }
    function dialogueMotif(opt) {
        var retour = document.activeElement;
        var facultatif = !!opt.motifFacultatif;
        var d = document.createElement('div');
        d.className = 'evm-dialogue';
        d.innerHTML = '<form novalidate role="dialog" aria-modal="true" aria-labelledby="evmDlgTitre" aria-describedby="evmDlgTexte">' +
            '<h2 id="evmDlgTitre">' + esc(opt.titre) + '</h2>' +
            '<p id="evmDlgTexte">' + esc(opt.texte || '') + '</p>' +
            (opt.avant || '') +
            '<label for="evmDlgMotif">' + esc(opt.motifLibelle || 'Motif') + (facultatif ? ' <span class="evm-sous">(facultatif)</span>' : ' <span style="color:var(--m-danger)">*</span>') + '</label>' +
            '<textarea id="evmDlgMotif" rows="2" maxlength="500"' + (facultatif ? '' : ' required aria-required="true"') + ' aria-describedby="evmDlgAide evmDlgErr" placeholder="' + esc(opt.motifExemple || 'Ex. : demande du membre, comportement répété…') + '"></textarea>' +
            '<p class="evm-aide" id="evmDlgAide" style="margin:0 0 4px">' + esc(opt.motifAide || ('Gardé dans le journal des actions (' + MOTIF_MIN + ' caractères au moins).')) + '</p>' +
            '<p class="evm-err" id="evmDlgErr" aria-live="assertive"></p>' +
            '<div class="evm-boutons"><button type="button" class="evm-btn evm-btn-ghost" data-annuler>Annuler</button>' +
            '<button type="submit" class="evm-btn ' + (opt.danger ? 'evm-btn-danger' : 'evm-btn-primaire') + '">' + esc(opt.bouton || 'Confirmer') + '</button></div></form>';
        document.body.appendChild(d);
        var form = d.querySelector('form'), motif = d.querySelector('#evmDlgMotif'), err = d.querySelector('#evmDlgErr');
        function fermer() { d.remove(); if (retour && retour.focus && document.body.contains(retour)) retour.focus(); }
        d.querySelector('[data-annuler]').addEventListener('click', fermer);
        d.addEventListener('click', function (e) { if (e.target === d) fermer(); });
        d.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fermer(); return; }
            pieger(form, e);
        });
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var v = motif.value.trim();
            if (!facultatif && v.length < MOTIF_MIN) {
                err.textContent = 'Le motif est obligatoire (' + MOTIF_MIN + ' caractères au moins).';
                motif.setAttribute('aria-invalid', 'true'); motif.focus(); return;
            }
            var ko = opt.verifier ? opt.verifier(form) : '';
            if (ko) { err.textContent = ko; return; }
            var b = form.querySelector('button[type="submit"]'); b.disabled = true;
            Promise.resolve(opt.valider(v, form)).then(function () { fermer(); })
                .catch(function (x) { b.disabled = false; err.textContent = x && x.message ? x.message : 'Action impossible'; });
        });
        setTimeout(function () { var f = form.querySelector('select, input:not([type="hidden"])') || motif; f.focus(); }, 0);
        return d;
    }

    function changerRole(id, roleCible) {
        var u = trouver(id);
        var m = moi();
        var options = ['user', 'model', 'moderator'].concat(m.role === 'super_admin' ? ['super_admin'] : []);
        dialogueMotif({
            titre: 'Changer le rôle de ' + u.username,
            texte: 'Rôle actuel : ' + (ROLES[u.role] || u.role) + '. Le membre est déconnecté du temps réel pour relire ses droits.',
            bouton: 'Changer le rôle',
            avant: '<label for="evmDlgRole">Nouveau rôle</label><select id="evmDlgRole">' + options.map(function (r) {
                return '<option value="' + r + '"' + ((roleCible || (u.role === 'user' ? 'moderator' : 'user')) === r ? ' selected' : '') + (r === u.role ? ' disabled' : '') + '>' + esc(ROLES[r]) + (r === u.role ? ' (actuel)' : '') + '</option>';
            }).join('') + '</select><div style="height:10px"></div>',
            verifier: function (f) { var r = f.querySelector('#evmDlgRole').value; return r === u.role ? 'Choisissez un autre rôle que le rôle actuel.' : ''; },
            valider: function (motif, f) {
                var role = f.querySelector('#evmDlgRole').value;
                if (role === 'super_admin' && !confirm('Donner TOUS les droits (Super Admin) à ' + u.username + ' ?')) return Promise.reject(new Error('Annulé'));
                return apiCall('/admin/users/' + id + '/role', { method: 'POST', body: JSON.stringify({ role: role, motif: motif }) }).then(function () {
                    toast('Rôle de ' + u.username + ' : ' + ROLES[role]);
                    recharger();
                    if (ficheOuverte) chargerFiche(ficheOuverte.id);
                });
            }
        });
    }

    function reinitialiserMdp(id, username) {
        var u = trouver(id);
        username = username || u.username;
        dialogueMotif({
            titre: 'Réinitialiser le mot de passe de ' + username,
            texte: 'Un mot de passe temporaire va être créé et affiché une seule fois. Le membre devra en choisir un nouveau à sa prochaine connexion ; ses sessions ouvertes seront déconnectées.',
            bouton: 'Réinitialiser',
            valider: function (motif) {
                return apiCall('/admin/users/' + id + '/reset-password', { method: 'POST', body: JSON.stringify({ motif: motif }) }).then(function (data) {
                    if (typeof afficherMotDePasseTemporaire === 'function') afficherMotDePasseTemporaire(data, username);
                    else window.prompt('Mot de passe temporaire de « ' + username + ' » :', data.tempPassword);
                    if (ficheOuverte) chargerFiche(ficheOuverte.id);
                });
            }
        });
    }

    function supprimer(id) {
        var u = trouver(id);
        dialogueMotif({
            titre: 'Supprimer le compte de ' + u.username,
            texte: 'Suppression définitive : profil, photo, messages et crédits. Cette action ne peut pas être annulée.',
            bouton: 'Supprimer définitivement',
            danger: true,
            avant: '<label for="evmDlgConf">Tapez le pseudo « ' + esc(u.username) + ' » pour confirmer</label><input id="evmDlgConf" type="text" autocomplete="off" spellcheck="false"><div style="height:10px"></div>',
            verifier: function (f) { return f.querySelector('#evmDlgConf').value.trim() === u.username ? '' : 'Le pseudo tapé ne correspond pas.'; },
            valider: function (motif) {
                return apiCall('/admin/users/' + id, { method: 'DELETE', body: JSON.stringify({ motif: motif }) }).then(function () {
                    toast('🗑️ Compte de ' + u.username + ' supprimé', 'warning');
                    if (ficheOuverte && ficheOuverte.id === id) fermerFiche();
                    recharger();
                });
            }
        });
    }

    // ============================================================
    // FICHE MEMBRE (tiroir)
    // ============================================================
    var tiroir = null, voile = null, retourFiche = null;

    // opt : { api: '/admin' | '/mod', depuis: élément qui reprend le focus à la fermeture } (ou directement l'élément)
    function ouvrirFiche(id, opt) {
        id = Number(id);
        if (!id) return;
        if (opt && opt.nodeType === 1) opt = { depuis: opt };
        opt = opt || {};
        var apiFiche = opt.api || (ficheOuverte && ficheOuverte.api) || cfg.api || '/admin';
        fermerMenu(false);
        if (!tiroir) {
            retourFiche = opt.depuis || document.activeElement;
            voile = document.createElement('div');
            voile.className = 'evm-voile';
            voile.addEventListener('click', fermerFiche);
            tiroir = document.createElement('aside');
            tiroir.className = 'evm-tiroir';
            tiroir.setAttribute('role', 'dialog');
            tiroir.setAttribute('aria-modal', 'true');
            tiroir.setAttribute('aria-labelledby', 'evmFicheTitre');
            tiroir.addEventListener('keydown', function (e) {
                if (e.key === 'Escape') {
                    if (document.querySelector('.evm-menu')) return;   // le menu se ferme d'abord
                    e.preventDefault(); fermerFiche(); return;
                }
                pieger(tiroir, e);
            });
            tiroir.addEventListener('click', clicFiche);
            tiroir.addEventListener('submit', soumettreFiche);
            document.body.appendChild(voile);
            document.body.appendChild(tiroir);
            document.body.classList.add('evm-bloque');
        }
        var u = trouver(id);
        tiroir.innerHTML = '<div class="evm-tiroir-tete"><div class="evm-av" aria-hidden="true">' + initiale(u.username) + '</div><div style="flex:1;min-width:0"><h2 id="evmFicheTitre">' + esc(u.username) + '</h2><p class="evm-sous">Chargement de la fiche…</p></div>' +
            '<button type="button" class="evm-btn evm-btn-ghost evm-btn-icone" data-evf="fermer" aria-label="Fermer la fiche"><span aria-hidden="true" style="font-size:18px;line-height:1">✕</span></button></div>' +
            '<div class="evm-tiroir-corps" aria-busy="true"><p class="evm-vide"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Chargement…</p></div>';
        tiroir.querySelector('[data-evf="fermer"]').focus();
        ficheOuverte = { id: id, data: null, api: apiFiche, lies: null };
        chargerFiche(id);
    }

    function fermerFiche() {
        if (!tiroir) return;
        fermerMenu(false);
        tiroir.remove(); voile.remove();
        tiroir = null; voile = null; ficheOuverte = null;
        document.body.classList.remove('evm-bloque');
        if (retourFiche && document.body.contains(retourFiche)) { try { retourFiche.focus(); } catch (e) {} }
        retourFiche = null;
    }

    function chargerFiche(id) {
        return apiCall(api() + '/users/' + id + '/fiche').then(function (f) {
            if (!tiroir || !ficheOuverte || ficheOuverte.id !== id) return;
            ficheOuverte.data = f;
            var corps = tiroir.querySelector('.evm-tiroir-corps');
            var defil = corps ? corps.scrollTop : 0;
            var actif = document.activeElement && document.activeElement.id;
            afficherFiche(f);
            var nc = tiroir.querySelector('.evm-tiroir-corps');
            if (nc) nc.scrollTop = defil;
            if (actif && $(actif)) $(actif).focus(); else if (!tiroir.contains(document.activeElement)) tiroir.querySelector('[data-evf="fermer"]').focus();
            chargerComptesLies(id);
        }).catch(function (err) {
            if (!tiroir) return;
            var c = tiroir.querySelector('.evm-tiroir-corps');
            c.removeAttribute('aria-busy');
            c.innerHTML = '<p class="evm-vide" style="color:var(--m-danger)">' + esc(err.message) + '</p>';
        });
    }

    // ---------- Comptes liés (même connexion Internet) ----------
    function chargerComptesLies(id) {
        if (ficheOuverte && ficheOuverte.lies) afficherComptesLies(ficheOuverte.lies);
        return apiCall(api() + '/users/' + id + '/comptes-lies').then(function (d) {
            if (!tiroir || !ficheOuverte || ficheOuverte.id !== id) return;
            ficheOuverte.lies = d;
            afficherComptesLies(d);
        }).catch(function (err) {
            var b = tiroir && tiroir.querySelector('[data-comptes-lies]');
            if (b) b.innerHTML = '<p class="evm-aide" style="color:var(--m-danger)">' + esc(err.message) + '</p>';
        });
    }

    function afficherComptesLies(d) {
        var b = tiroir && tiroir.querySelector('[data-comptes-lies]');
        if (!b) return;
        b.removeAttribute('aria-busy');
        var c = d.comptes || [];
        var h = '';
        if (d.contournementPossible) {
            h += '<div class="evm-carte" style="border-color:var(--m-danger);background:var(--m-danger-bg)"><b style="color:var(--m-danger)">⚠️ Contournement possible</b>' +
                '<div class="evm-sous" style="margin-top:2px">Un compte lié est banni ou exclu en ce moment. À vérifier avant toute décision.</div></div>';
        }
        h += c.length ? '<ul class="evm-liste" aria-label="Comptes liés">' + c.map(function (x) {
            var st = STATUTS_MEMBRE[x.statut] || ['', x.statut];
            return '<li><span class="evm-g"><button type="button" class="evm-lien" style="padding:0" data-evf="ouvrir" data-id="' + Number(x.id) + '">' + esc(x.username) + '</button> ' +
                '<span class="evm-badge ' + (x.force === 'fort' ? 'evm-b-warn' : '') + '" title="' + (x.force === 'fort' ? 'Même connexion et même navigateur' : 'Même connexion seulement (réseau partagé possible)') + '">lien ' + esc(x.force) + '</span> ' +
                '<span class="evm-badge ' + st[0] + '">' + esc(st[1]) + '</span>' + (x.role !== 'user' ? ' ' + badgeRole(x.role) : '') + '</span>' +
                '<span class="evm-d">' + nf.format(x.jours) + ' jour' + (x.jours > 1 ? 's' : '') + '<br>vu ' + esc(relatif(x.derniereVue)) + '</span></li>';
        }).join('') + '</ul>' : vide('Aucun autre compte vu sur la même connexion depuis ' + (d.fenetreJours || 90) + ' jours.');
        h += '<p class="evm-aide" style="margin-top:4px">Indice seulement : une connexion partagée (réseau mobile, wifi public, famille) peut relier des personnes différentes. « Lien fort » = même connexion et même navigateur. Rien n\'est sanctionné automatiquement.</p>';
        b.innerHTML = h;
        var tete = tiroir.querySelector('.evm-tiroir-tete .evm-badges');
        if (tete && d.contournementPossible && !tete.querySelector('[data-badge-contournement]')) {
            tete.insertAdjacentHTML('beforeend', '<span class="evm-badge evm-b-danger" data-badge-contournement>⚠️ contournement possible</span>');
        }
    }

    function ligne(dt, dd) { return '<dt>' + esc(dt) + '</dt><dd>' + dd + '</dd>'; }
    function vide(t) { return '<p class="evm-aide">' + esc(t) + '</p>'; }

    function afficherFiche(f) {
        var i = f.identite, a = f.activite, c = f.credits, mo = f.moderation;
        var sans = i.sanctionEnCours;
        var statut = { actif: '<span class="evm-badge evm-b-ok">✅ Actif</span>', muet: '<span class="evm-badge evm-b-warn">🔇 Muet</span>',
            exclu: '<span class="evm-badge evm-b-danger">🚪 Exclu</span>', banni: '<span class="evm-badge evm-b-danger">🔨 Banni</span>' }[i.statut] || esc(i.statut);
        if (sans) {
            statut += '<div class="evm-sous" style="margin-top:4px">' + esc(TYPES_SANCTION[sans.type] || sans.type) + ' ' +
                (sans.definitif ? 'définitif' : (sans.jusqua ? 'jusqu\'au ' + esc(dateCourte(sans.jusqua)) : '')) +
                (sans.motif ? ' · motif : ' + esc(sans.motif) : '') + '</div>';
        }
        if (i.statut !== 'muet' && i.muetJusqua) statut += '<div class="evm-sous">🔇 aussi muet jusqu\'au ' + esc(dateCourte(i.muetJusqua)) + '</div>';

        var photo = '—';
        var p = i.photo || {};
        if (p.status === 'approved') photo = '<img class="evm-photo" alt="Photo de profil de ' + esc(i.username) + '" src="' + esc(racineApi() + p.url) + '"><div class="evm-sous">✅ Validée' + (p.galerie === false ? ' · hors galerie' : '') + '</div>';
        else if (p.status === 'pending') photo = '<img class="evm-photo" alt="Photo en attente de ' + esc(i.username) + '" data-photo-attente="' + i.id + '"><div class="evm-sous">📷 En attente de validation</div>';
        else if (p.status === 'refused') photo = '<span class="evm-badge evm-b-danger">Refusée</span>' + (p.refuseeLe ? ' <span class="evm-sous">le ' + esc(jour(p.refuseeLe)) + '</span>' : '') + (p.motif ? '<div class="evm-sous">' + esc(p.motif) + '</div>' : '');
        else photo = '<span class="evm-sous">Aucune photo</span>';

        var identite = '<dl class="evm-dl">' +
            ligne('Pseudo', '<b>' + esc(i.username) + '</b> <span class="evm-sous">#' + i.id + '</span>') +
            (i.email !== undefined ? ligne('E-mail', esc(i.email) + ' ' + (i.emailVerifie ? '<span class="evm-badge evm-b-ok">vérifié</span>' : '<span class="evm-badge evm-b-warn">✉️ non vérifié</span>') +
                (i.emailEnAttente ? '<div class="evm-sous">Changement en attente : ' + esc(i.emailEnAttente) + '</div>' : '')) : ligne('E-mail', i.emailVerifie ? 'vérifié' : '✉️ non vérifié')) +
            ligne('Rôle', badgeRole(i.role) + (i.stagiaire ? ' <span class="evm-badge evm-b-warn">stagiaire jusqu\'au ' + esc(jour(i.stagiaire.fin)) + '</span>' : '')) +
            ligne('Statut', statut + (i.mustChangePassword ? '<div class="evm-sous">🔑 Mot de passe temporaire à changer</div>' : '')) +
            ligne('Inscrit le', esc(dateCourte(i.inscritLe))) +
            ligne('Dernière connexion', esc(i.derniereConnexion ? dateCourte(i.derniereConnexion) + ' (' + relatif(i.derniereConnexion) + ')' : 'jamais')) +
            ligne('En ligne', i.enLigne ? '<span class="evm-badge evm-b-ok">🟢 en ce moment</span>' : esc('non · vu ' + relatif(i.derniereActivite))) +
            ligne('Département', esc(i.departement || '—')) +
            ligne('Photo', photo) +
            ligne('Provenance', esc(i.provenance ? i.provenance.libelle : 'Directe / inconnue')) +
            ligne('Parrain', i.parrain ? '<button type="button" class="evm-lien" style="padding:0" data-evf="ouvrir" data-id="' + i.parrain.id + '">' + esc(i.parrain.username) + '</button>' : '—') +
            ligne('Filleuls', i.filleuls && i.filleuls.length ? i.filleuls.map(function (x) {
                return '<button type="button" class="evm-lien" style="padding:0 6px 0 0" data-evf="ouvrir" data-id="' + x.id + '">' + esc(x.username) + '</button>' + (x.parrainage ? '<span class="evm-sous">(' + esc({ pending: 'en cours', rewarded: 'validé', refused: 'refusé' }[x.parrainage] || x.parrainage) + ')</span> ' : '');
            }).join('') : '—') +
            '</dl>';

        var activite = '<div class="evm-chiffres"><div><b>' + nf.format(a.messagesSalon.total) + '</b><span>messages de salon</span></div>' +
            '<div><b>' + nf.format(a.mpEnvoyes) + '</b><span>messages privés envoyés</span></div>' +
            '<div><b>' + nf.format(a.lives.total) + '</b><span>lives</span></div></div>' +
            '<p class="evm-aide" style="margin-bottom:6px">Le contenu des messages privés n\'est jamais affiché ici (seules les preuves jointes à un signalement le sont).</p>' +
            (a.messagesSalon.derniers.length ? '<ul class="evm-liste" aria-label="Derniers messages de salon">' + a.messagesSalon.derniers.map(function (x) {
                return '<li><span class="evm-g">' + esc(x.text) + '</span><span class="evm-d">' + esc(x.salon) + '<br>' + esc(dateCourte(x.created_at)) + '</span></li>';
            }).join('') + '</ul>' : vide('Aucun message de salon.')) +
            (a.lives.derniers.length ? '<p class="evm-aide" style="margin:8px 0 2px">Derniers lives</p><ul class="evm-liste">' + a.lives.derniers.map(function (l) {
                return '<li><span class="evm-g">' + esc(l.salon) + (l.enCours ? ' <span class="evm-badge evm-b-ok">en cours</span>' : '') + '</span><span class="evm-d">' + esc(dateCourte(l.debut)) + (l.fin ? '<br>fin ' + esc(dateCourte(l.fin)) : '') + '</span></li>';
            }).join('') + '</ul>' : '');

        var credits = '<div class="evm-chiffres"><div><b>' + nf.format(c.solde) + '</b><span>solde</span></div><div><b>' + nf.format(c.totalGagne) + '</b><span>reçus au total</span></div><div><b>' + nf.format(c.totalDepense) + '</b><span>dépensés</span></div></div>' +
            (c.transactions.length ? '<ul class="evm-liste" aria-label="10 dernières opérations">' + c.transactions.map(function (t) {
                return '<li><span class="evm-g">' + esc(TYPES_CREDITS[t.type] || t.type) + (t.description ? ' — ' + esc(t.description) : '') + '</span><span class="evm-d"><b style="color:' + (t.amount >= 0 ? 'var(--m-ok)' : 'var(--m-danger)') + '">' + (t.amount > 0 ? '+' : '') + nf.format(t.amount) + '</b><br>' + esc(dateCourte(t.created_at)) + '</span></li>';
            }).join('') + '</ul>' : vide('Aucune opération.'));

        var sr = mo.signalementsRecus, se = mo.signalementsEmis;
        var moderation = '<div class="evm-chiffres"><div><b>' + nf.format(sr.total) + '</b><span>signalements reçus' + (sr.enAttente ? ' · ' + sr.enAttente + ' en attente' : '') + '</span></div>' +
            '<div><b>' + nf.format(se.total) + '</b><span>signalements émis</span></div>' +
            '<div><b>' + nf.format(mo.blocages.bloquePar) + '</b><span>membre(s) l\'ont bloqué · il en bloque ' + nf.format(mo.blocages.bloque) + '</span></div></div>' +
            '<p class="evm-aide" style="margin:8px 0 4px" id="evmComptesLiesTitre">Comptes liés <span class="evm-sous">(même connexion Internet, 90 jours)</span></p>' +
            '<div data-comptes-lies aria-labelledby="evmComptesLiesTitre" aria-busy="true"><p class="evm-aide"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Recherche…</p></div>' +
            '<p class="evm-aide" style="margin:8px 0 4px">Historique des sanctions</p>' +
            (mo.sanctions.length ? '<ul class="evm-liste">' + mo.sanctions.map(function (s) {
                return '<li><span class="evm-g"><b>' + esc(TYPES_SANCTION[s.type] || s.type) + '</b> · ' + esc(s.duree) + (s.reason ? ' — ' + esc(s.reason) : '') +
                    '<br><span class="evm-sous">par ' + esc(s.by_name || '?') + (s.lifted_at ? ' · levée le ' + esc(dateCourte(s.lifted_at)) + (s.lifted_by ? ' par ' + esc(s.lifted_by) : '') : '') + '</span></span>' +
                    '<span class="evm-d">' + esc(dateCourte(s.created_at)) + '</span></li>';
            }).join('') + '</ul>' : vide('Aucune sanction.')) +
            (mo.avertissements.length ? '<p class="evm-aide" style="margin:8px 0 4px">Avertissements</p><ul class="evm-liste">' + mo.avertissements.map(function (w) {
                return '<li><span class="evm-g">' + esc(w.message) + '</span><span class="evm-d">' + esc(dateCourte(w.created_at)) + '</span></li>';
            }).join('') + '</ul>' : '') +
            '<p class="evm-aide" style="margin:10px 0 4px">Signalements reçus</p>' +
            (sr.liste.length ? sr.liste.map(function (r) {
                var pr = r.preuve;
                var ctx = pr && pr.contexte && pr.contexte.avant && pr.contexte.avant.length ? '<div class="evm-sous" style="margin-top:4px">Avant : ' + pr.contexte.avant.map(function (l) { return esc(l.auteur) + ' : « ' + esc(l.texte) + ' »'; }).join(' · ') + '</div>' : '';
                return '<div class="evm-carte"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><b>' + esc(RAISONS[r.raison] || r.raison) + '</b>' +
                    '<span class="evm-badge ' + (r.statut === 'pending' ? 'evm-b-warn' : '') + '">' + esc(STATUTS_SIG[r.statut] || r.statut) + '</span></div>' +
                    '<div class="evm-sous">par ' + esc(r.par || '?') + ' · ' + esc(dateCourte(r.date)) + (r.action && r.action !== 'none' ? ' · mesure : ' + esc(r.action) : '') + (r.traitePar ? ' · traité par ' + esc(r.traitePar) : '') + '</div>' +
                    (r.description ? '<p style="margin-top:4px">' + esc(r.description) + '</p>' : '') +
                    (pr ? '<div class="evm-preuve"><span class="evm-sous">Preuve jointe (' + esc(pr.source === 'prive' ? 'message privé' : 'salon' + (pr.contexte && pr.contexte.salon ? ' ' + pr.contexte.salon : '')) + (pr.date ? ', ' + esc(dateCourte(pr.date)) : '') + ') :</span><br>' + esc(pr.texte) + '</div>' + ctx : '') +
                    '</div>';
            }).join('') : vide('Aucun signalement reçu.')) +
            '<p class="evm-aide" style="margin:10px 0 4px">Signalements émis</p>' +
            (se.liste.length ? '<ul class="evm-liste">' + se.liste.map(function (r) {
                return '<li><span class="evm-g">' + esc(r.cible || '?') + ' — ' + esc(RAISONS[r.raison] || r.raison) + '</span><span class="evm-d">' + esc(STATUTS_SIG[r.statut] || r.statut) + '<br>' + esc(dateCourte(r.date)) + '</span></li>';
            }).join('') + '</ul>' : vide('Aucun signalement émis.')) +
            '<p class="evm-aide" style="margin:10px 0 4px">Contestations</p>' +
            (mo.contestations.length ? mo.contestations.map(function (x) {
                return '<div class="evm-carte"><div style="display:flex;justify-content:space-between;gap:8px"><b>' + esc(TYPES_SANCTION[x.sanction.type] || x.sanction.type) + ' · ' + esc(x.sanction.duree) + '</b><span class="evm-badge">' + esc(APPELS[x.statut] || x.statut) + '</span></div>' +
                    '<p style="margin-top:4px">« ' + esc(x.message) + ' »</p><div class="evm-sous">' + esc(dateCourte(x.date)) + (x.decidePar ? ' · décision de ' + esc(x.decidePar) : '') + '</div>' +
                    (x.note ? '<p class="evm-sous" style="margin-top:2px">Réponse : ' + esc(x.note) + '</p>' : '') + '</div>';
            }).join('') : vide('Aucune contestation.'));

        var notes = '<form class="evm-note-form" data-note-form>' +
            '<label for="evmNoteTexte" class="sr-only">Nouvelle note interne</label>' +
            '<textarea id="evmNoteTexte" maxlength="' + NOTE_MAX + '" placeholder="Note interne (jamais visible par le membre)…"></textarea>' +
            '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin:4px 0 10px"><span class="evm-aide" id="evmNoteCompte">0 / ' + NOTE_MAX + '</span>' +
            '<button type="submit" class="evm-btn evm-btn-primaire">Ajouter la note</button></div></form>' +
            (f.notes.length ? f.notes.map(function (n) {
                return '<div class="evm-carte"><p style="white-space:pre-wrap">' + esc(n.texte) + '</p><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:4px">' +
                    '<span class="evm-sous">' + esc(n.auteur) + ' · ' + esc(dateCourte(n.date)) + '</span>' +
                    (n.supprimable ? '<button type="button" class="evm-lien" data-evf="note-suppr" data-note="' + n.id + '" aria-label="Supprimer la note du ' + esc(dateCourte(n.date)) + '">Supprimer</button>' : '') + '</div></div>';
            }).join('') : vide('Aucune note.'));

        var journal = f.audit ? (f.audit.length ? '<ul class="evm-liste">' + f.audit.map(function (e) {
            return '<li><span class="evm-g"><b>' + esc(e.libelle) + '</b> par ' + esc(e.acteur || '?') + (e.motif ? ' — ' + esc(e.motif) : '') + (detailsTexte(e) ? '<br><span class="evm-sous">' + esc(detailsTexte(e)) + '</span>' : '') + '</span><span class="evm-d">' + esc(dateCourte(e.date)) + '</span></li>';
        }).join('') + '</ul>' : vide('Aucune action de l\'équipe sur ce compte.')) : '';

        var sections = [['identite', 'Identité', identite], ['activite', 'Activité', activite], ['credits', 'Crédits', credits], ['moderation', 'Modération', moderation], ['notes', 'Notes internes', notes]];
        if (f.audit) sections.push(['journal', 'Journal', journal]);

        var avatar = p.status === 'approved' ? '<img alt="" src="' + esc(racineApi() + p.url) + '">' : initiale(i.username);
        tiroir.innerHTML = '<div class="evm-tiroir-tete"><div class="evm-av" aria-hidden="true">' + avatar + '</div>' +
            '<div style="flex:1;min-width:0"><h2 id="evmFicheTitre">' + esc(i.username) + '</h2><div class="evm-badges">' + badgeRole(i.role) +
                (i.enLigne ? '<span class="evm-badge evm-b-ok">🟢 en ligne</span>' : '') + (sr.enAttente ? '<span class="evm-badge evm-b-warn">⚠️ ' + sr.enAttente + ' en attente</span>' : '') + '</div></div>' +
            '<button type="button" class="evm-btn evm-btn-ghost evm-btn-icone" data-evf="fermer" aria-label="Fermer la fiche"><span aria-hidden="true" style="font-size:18px;line-height:1">✕</span></button></div>' +
            '<nav class="evm-nav-sections" aria-label="Sections de la fiche">' + sections.map(function (s) { return '<a href="#evmS-' + s[0] + '" data-evf="aller" data-cible="evmS-' + s[0] + '">' + esc(s[1]) + '</a>'; }).join('') + '</nav>' +
            '<div class="evm-tiroir-corps">' + sections.map(function (s) {
                return '<section class="evm-section" id="evmS-' + s[0] + '" aria-labelledby="evmH-' + s[0] + '"><h3 id="evmH-' + s[0] + '">' + esc(s[1]) + '</h3>' + s[2] + '</section>';
            }).join('') + '</div>' +
            '<div class="evm-tiroir-pied">' +
                (f.droits && f.droits.peutAgir ? '<button type="button" class="evm-btn evm-btn-danger" data-evf="sanction">Sanctionner</button>' : '') +
                '<button type="button" class="evm-btn evm-btn-ghost" data-evf="menu" aria-haspopup="menu" aria-expanded="false">Plus d\'actions <span aria-hidden="true">⋯</span></button>' +
                '<button type="button" class="evm-btn evm-btn-ghost" data-evf="fermer">Fermer</button></div>';

        // Photo en attente : image protégée (session de l'équipe), chargée à part
        var img = tiroir.querySelector('[data-photo-attente]');
        if (img) {
            fetch(racineApi() + '/api/avatars/pending/' + i.id + '/image', { credentials: 'include' })
                .then(function (r) { return r.ok ? r.blob() : null; })
                .then(function (b) { if (b && document.body.contains(img)) img.src = URL.createObjectURL(b); }).catch(function () {});
        }
        var ta = tiroir.querySelector('#evmNoteTexte');
        if (ta) ta.addEventListener('input', function () { $('evmNoteCompte').textContent = ta.value.length + ' / ' + NOTE_MAX; });
    }

    function detailsTexte(e) {
        var d = e.details || {};
        switch (true) {
            case /^sanction_/.test(e.action): return d.duree ? 'Durée : ' + d.duree + (d.jusqua ? ' (jusqu\'au ' + dateCourte(d.jusqua) + ')' : '') : '';
            case e.action === 'role_change' || /^stage_/.test(e.action): return d.avant ? (ROLES[d.avant] || d.avant) + ' → ' + (ROLES[d.apres] || d.apres) : '';
            case /^credits_/.test(e.action): return d.montant ? nf.format(d.montant) + ' crédits' : '';
            case /^note_/.test(e.action): return d.extrait ? '« ' + d.extrait + ' »' : '';
            case e.action === 'signalement_traite': return 'Signalement #' + d.signalement + ' : ' + (d.decision || '') + ' (' + (STATUTS_SIG[d.statut] || d.statut || '') + ')';
            case /^levee_/.test(e.action): return d.suiteContestation ? 'Suite à une contestation' : '';
            case e.action === 'live_arrete': return d.salon ? 'Salon ' + d.salon : '';
            case e.action === 'alerte_traitee': return d.libelle ? 'Alerte #' + d.alerte + ' : ' + d.libelle : '';
            default: return '';
        }
    }

    function clicFiche(e) {
        var b = e.target.closest('[data-evf]');
        if (!b || !ficheOuverte) return;
        var nom = b.getAttribute('data-evf');
        var f = ficheOuverte.data;
        var u = f ? trouver(f.identite.id) : null;
        if (nom === 'fermer') return fermerFiche();
        if (nom === 'aller') { e.preventDefault(); var s = $(b.getAttribute('data-cible')); if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'start' }); s.setAttribute('tabindex', '-1'); s.focus({ preventScroll: true }); } return; }
        if (nom === 'ouvrir') return ouvrirFiche(Number(b.getAttribute('data-id')));
        if (!f) return;
        if (nom === 'sanction') return sanctionner(u);
        if (nom === 'menu') return ouvrirMenu(u, b);
        if (nom === 'note-suppr') {
            if (!confirm('Supprimer cette note interne ?')) return;
            apiCall(api() + '/users/' + f.identite.id + '/notes/' + Number(b.getAttribute('data-note')), { method: 'DELETE' })
                .then(function () { toast('Note supprimée'); chargerFiche(f.identite.id); })
                .catch(function (err) { toast(err.message, 'error'); });
        }
    }

    function soumettreFiche(e) {
        var form = e.target.closest('[data-note-form]');
        if (!form || !ficheOuverte || !ficheOuverte.data) return;
        e.preventDefault();
        var ta = form.querySelector('textarea'), texte = ta.value.trim();
        if (texte.length < 2) { toast('Écrivez la note', 'error'); ta.focus(); return; }
        var b = form.querySelector('button[type="submit"]'); b.disabled = true;
        apiCall(api() + '/users/' + ficheOuverte.data.identite.id + '/notes', { method: 'POST', body: JSON.stringify({ texte: texte }) })
            .then(function () { toast('📝 Note ajoutée'); return chargerFiche(ficheOuverte.data.identite.id); })
            .then(function () { var t = $('evmNoteTexte'); if (t) t.focus(); })
            .catch(function (err) { b.disabled = false; toast(err.message, 'error'); });
    }

    function configurer(o) { Object.keys(o || {}).forEach(function (k) { cfg[k] = o[k]; }); }

    window.EvcFicheMembre = {
        configurer: configurer,
        ouvrir: ouvrirFiche, fermer: fermerFiche, recharger: function () { if (ficheOuverte) chargerFiche(ficheOuverte.id); },
        ouverte: function () { return ficheOuverte ? ficheOuverte.id : null; },
        ouvrirMenu: ouvrirMenu, fermerMenu: fermerMenu, dialogueMotif: dialogueMotif,
        changerRole: changerRole, reinitialiserMdp: reinitialiserMdp, supprimer: supprimer, sanctionner: sanctionner,
        detailsTexte: detailsTexte, trouver: trouver,
        util: { esc: esc, dateCourte: dateCourte, jour: jour, relatif: relatif, badgeRole: badgeRole, initiale: initiale, peutAgir: peutAgir, enCours: enCours, ROLES: ROLES, nf: nf }
    };
})();
