// ============================================================
// E-VISIOCAM — « Ma messagerie » façon boîte mail (messages.html)
// Dossiers Reçus / Envoyés / Corbeille, objet, lecture, Répondre. API : /api/mail (serveur).
// On peut écrire à un membre hors ligne : le message l'attend dans ses Reçus.
// Liens existants conservés : messages.html?ecrire=<id>[&demande=cam]
// ============================================================
(function () {
    'use strict';
    var moi = null, dossier = 'recus', page = 1, recherche = '', ouvert = null, destinataire = null, attenteRecherche = null;
    var $ = function (id) { return document.getElementById(id); };
    var racine = document.querySelector('.evm');

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function avatar(u) {
        var src = u && typeof urlAvatar === 'function' ? urlAvatar(u.avatar) : null;
        if (src) return '<img class="evm-av" src="' + esc(src) + '" alt="" loading="lazy">';
        return '<span class="evm-av" aria-hidden="true">' + esc(((u && u.username) || '?').charAt(0).toUpperCase()) + '</span>';
    }
    function dateSql(d) { return new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(d) ? '' : 'Z')); }
    function dateCourte(d) {
        var x = dateSql(d), n = new Date();
        if (x.toDateString() === n.toDateString()) return x.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        var hier = new Date(n); hier.setDate(n.getDate() - 1);
        if (x.toDateString() === hier.toDateString()) return 'Hier';
        return x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: x.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
    }
    function dateLongue(d) { return dateSql(d).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); }
    function toast(t, type) { if (typeof showToast === 'function') showToast(t, type || 'info'); }

    // ---------- Compteur des non lus ----------
    function majCompteur(n) {
        var b = $('evmCompteRecus');
        if (!b) return;
        b.textContent = n > 99 ? '99+' : String(n);
        b.hidden = !n;
        document.title = (n ? '(' + n + ') ' : '') + 'Ma messagerie — E-VISIOCAM';
    }

    // ---------- Liste ----------
    async function charger(ajouter) {
        var ul = $('evmListe');
        if (!ajouter) { page = 1; ul.innerHTML = '<li class="evm-rien"><i class="fa-solid fa-spinner fa-spin"></i>Chargement…</li>'; }
        try {
            var d = await apiCall('/mail?dossier=' + dossier + '&page=' + page + (recherche ? '&q=' + encodeURIComponent(recherche) : ''));
            majCompteur(d.nonLus || 0);
            var html = (d.messages || []).map(function (m) {
                var qui = m.envoye ? 'À : ' + m.autre.username : m.autre.username;
                return '<li><button type="button" class="evm-ligne' + (m.lu ? '' : ' non-lu') + (ouvert === m.id ? ' ouvert' : '') + '" data-id="' + m.id + '">' +
                    avatar(m.autre) +
                    '<span class="evm-de">' + esc(qui) + '</span>' +
                    '<span class="evm-date">' + esc(dateCourte(m.date)) + '</span>' +
                    '<span class="evm-resume">' + (m.objet ? '<strong>' + esc(m.objet) + '</strong> — ' : '') + esc(m.apercu) + '</span>' +
                    '</button></li>';
            }).join('');
            if (!ajouter) ul.innerHTML = html || vide();
            else ul.insertAdjacentHTML('beforeend', html);
            $('evmPlus').hidden = !d.suite;
        } catch (e) {
            if (!ajouter) ul.innerHTML = '<li class="evm-rien"><i class="fa-solid fa-triangle-exclamation"></i>' + esc(e.message || 'Messagerie indisponible') + '</li>';
        }
    }
    function vide() {
        var t = recherche ? 'Aucun message ne correspond.' : dossier === 'recus' ? 'Aucun message reçu pour le moment.' : dossier === 'envoyes' ? 'Vous n\'avez encore rien envoyé.' : 'La corbeille est vide.';
        return '<li class="evm-rien"><i class="fa-regular fa-envelope"></i>' + t + '</li>';
    }

    function choisirDossier(nom) {
        dossier = nom; ouvert = null;
        document.querySelectorAll('.evm-dossiers [data-dossier]').forEach(function (b) {
            var actif = b.getAttribute('data-dossier') === nom;
            b.classList.toggle('actif', actif);
            if (actif) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
        });
        fermerLecture();
        charger();
    }

    // ---------- Lecture ----------
    function fermerLecture() {
        ouvert = null;
        racine.classList.remove('lecture-ouverte');
        $('evmLecture').innerHTML = '<div class="evm-vide"><i class="fa-regular fa-envelope" aria-hidden="true"></i><p>Sélectionnez un message pour le lire</p></div>';
        document.querySelectorAll('.evm-ligne.ouvert').forEach(function (l) { l.classList.remove('ouvert'); });
    }

    async function ouvrir(id) {
        ouvert = id;
        document.querySelectorAll('.evm-ligne').forEach(function (l) { l.classList.toggle('ouvert', Number(l.getAttribute('data-id')) === id); });
        var zone = $('evmLecture');
        racine.classList.add('lecture-ouverte');
        zone.innerHTML = '<div class="evm-vide"><i class="fa-solid fa-spinner fa-spin"></i></div>';
        try {
            var d = await apiCall('/mail/' + id);
            var m = d.message;
            var ligne = document.querySelector('.evm-ligne[data-id="' + id + '"]');
            if (ligne) ligne.classList.remove('non-lu');
            var outils = '<div class="evm-outils">' +
                '<button type="button" class="evm-btn evm-icone evm-retour" data-action="retour" aria-label="Retour à la liste"><i class="fa-solid fa-arrow-left"></i></button>' +
                (m.corbeille
                    ? '<button type="button" class="evm-btn" data-action="restaurer"><i class="fa-solid fa-rotate-left"></i> Restaurer</button>' +
                      '<button type="button" class="evm-btn" data-action="effacer"><i class="fa-solid fa-trash"></i> Supprimer définitivement</button>'
                    : (d.bloque ? '' : '<button type="button" class="evm-btn evm-btn-ecrire" data-action="repondre"><i class="fa-solid fa-reply"></i> Répondre</button>') +
                      (m.envoye ? '' : '<button type="button" class="evm-btn" data-action="non-lu"><i class="fa-regular fa-envelope"></i> Non lu</button>') +
                      '<button type="button" class="evm-btn" data-action="corbeille"><i class="fa-solid fa-trash-can"></i> Corbeille</button>') +
                '<span class="evm-espace"></span>' +
                (m.envoye ? '' : '<button type="button" class="evm-btn evm-icone" data-action="signaler" title="Signaler ce membre" aria-label="Signaler ce membre"><i class="fa-solid fa-flag"></i></button>' +
                                 '<button type="button" class="evm-btn evm-icone" data-action="bloquer" title="Bloquer ce membre" aria-label="Bloquer ce membre"><i class="fa-solid fa-ban"></i></button>') +
                '</div>';
            var de = m.envoye ? 'Vous → <a href="#" class="evc-profil-lien" data-fiche="' + m.autre.id + '">' + esc(m.autre.username) + '</a>'
                              : '<a href="#" class="evc-profil-lien" data-fiche="' + m.autre.id + '">' + esc(m.autre.username) + '</a> → vous';
            var fil = (d.fil || []).length ? '<div class="evm-fil"><h3>Échanges précédents avec ' + esc(m.autre.username) + '</h3>' + d.fil.map(function (f) {
                return '<details><summary><b>' + esc(f.envoye ? 'Vous' : f.autre.username) + '</b><span>' + esc(f.objet || f.apercu) + '</span><time>' + esc(dateCourte(f.date)) + '</time></summary>' +
                    '<div class="evm-corps">' + esc(f.texte) + '</div></details>';
            }).join('') + '</div>' : '';
            zone.innerHTML = outils +
                (d.bloque ? '<p class="evm-bloque">Vous ne pouvez plus écrire à ce membre (blocage).</p>' : '') +
                '<article class="evm-message"><h2>' + esc(m.objet || '(sans objet)') + '</h2>' +
                '<div class="evm-entete">' + avatar(m.autre) + '<div>' + de + '<small>' + esc(dateLongue(m.date)) + '</small></div></div>' +
                '<div class="evm-corps">' + esc(m.texte) + '</div></article>' + fil;
            zone.dataset.autreId = m.autre.id; zone.dataset.autreNom = m.autre.username; zone.dataset.autreRole = m.autre.role || '';
            zone.dataset.objet = m.objet || '';
            zone.scrollTop = 0;
            rafraichirCompteur();
        } catch (e) {
            zone.innerHTML = '<div class="evm-vide"><i class="fa-solid fa-triangle-exclamation"></i><p>' + esc(e.message || 'Message introuvable') + '</p></div>';
        }
    }

    async function rafraichirCompteur() {
        try { var d = await apiCall('/mail?dossier=recus&page=999'); majCompteur(d.nonLus || 0); } catch (e) {}
    }

    async function action(nom) {
        var zone = $('evmLecture'), id = ouvert;
        if (nom === 'retour') { fermerLecture(); return; }
        if (nom === 'repondre') {
            var o = zone.dataset.objet || '';
            ecrire({ id: Number(zone.dataset.autreId), username: zone.dataset.autreNom }, o ? (/^re\s*:/i.test(o) ? o : 'Re : ' + o) : '');
            return;
        }
        if (nom === 'signaler' && window.EvcSecurite) {
            EvcSecurite.signaler({ type: 'user', userId: Number(zone.dataset.autreId), username: zone.dataset.autreNom, peutBloquer: !/moderator|super_admin/.test(zone.dataset.autreRole) });
            return;
        }
        if (nom === 'bloquer' && window.EvcSecurite) {
            if (await EvcSecurite.bloquer(Number(zone.dataset.autreId), zone.dataset.autreNom)) { fermerLecture(); charger(); }
            return;
        }
        if (!id) return;
        try {
            if (nom === 'corbeille') await apiCall('/mail/' + id + '/corbeille', { method: 'POST' });
            else if (nom === 'restaurer') await apiCall('/mail/' + id + '/restaurer', { method: 'POST' });
            else if (nom === 'non-lu') await apiCall('/mail/' + id + '/non-lu', { method: 'POST' });
            else if (nom === 'effacer') {
                if (!confirm('Supprimer définitivement ce message de votre messagerie ?')) return;
                await apiCall('/mail/' + id, { method: 'DELETE' });
            }
            toast(nom === 'corbeille' ? 'Message mis à la corbeille' : nom === 'restaurer' ? 'Message restauré' : nom === 'non-lu' ? 'Marqué comme non lu' : 'Message supprimé', 'success');
            fermerLecture();
            charger();
        } catch (e) { toast(e.message || 'Action impossible', 'error'); }
    }

    // ---------- Écrire ----------
    function choisirDestinataire(u) {
        destinataire = u;
        var puce = $('evmAChoisi'), champ = $('evmA');
        if (u) {
            puce.innerHTML = esc(u.username) + ' <button type="button" aria-label="Changer de destinataire"><i class="fa-solid fa-xmark"></i></button>';
            puce.hidden = false; champ.hidden = true; champ.value = '';
            puce.querySelector('button').addEventListener('click', function () { choisirDestinataire(null); $('evmA').focus(); });
        } else { puce.hidden = true; champ.hidden = false; }
        $('evmSuggestions').hidden = true;
    }

    function ecrire(pour, objet, texte) {
        $('evmFenetreTitre').textContent = objet && /^re\s*:/i.test(objet) ? 'Répondre' : 'Nouveau message';
        choisirDestinataire(pour || null);
        $('evmObjet').value = objet || '';
        $('evmTexte').value = texte || '';
        $('evmErreur').hidden = true;
        majLongueur();
        $('evmFenetre').hidden = false;
        (pour ? (objet ? $('evmTexte') : $('evmObjet')) : $('evmA')).focus();
    }
    function fermerFenetre() {
        var t = $('evmTexte').value.trim();
        if (t && !confirm('Abandonner ce message ?')) return;
        $('evmFenetre').hidden = true;
    }
    function majLongueur() { $('evmCompteur').textContent = $('evmTexte').value.length + ' / 2000'; }

    async function chercherMembres() {
        var q = $('evmA').value.trim(), ul = $('evmSuggestions');
        if (q.length < 2) { ul.hidden = true; return; }
        try {
            var d = await apiCall('/mail/destinataires?q=' + encodeURIComponent(q));
            var l = d.membres || [];
            ul.innerHTML = l.length ? l.map(function (u, i) {
                return '<li><button type="button" data-i="' + i + '">' + avatar(u) + esc(u.username) + '</button></li>';
            }).join('') : '<li class="evm-rien" style="padding:12px">Aucun membre trouvé</li>';
            ul.hidden = false;
            ul.querySelectorAll('button[data-i]').forEach(function (b) {
                b.addEventListener('click', function () { choisirDestinataire(l[Number(b.getAttribute('data-i'))]); $('evmObjet').focus(); });
            });
        } catch (e) { ul.hidden = true; }
    }

    async function envoyer(e) {
        e.preventDefault();
        var err = $('evmErreur'), bouton = $('evmEnvoyer');
        err.hidden = true;
        var texte = $('evmTexte').value.trim();
        if (!destinataire) { err.textContent = 'Choisissez un destinataire dans la liste.'; err.hidden = false; $('evmA').focus(); return; }
        if (!texte) { err.textContent = 'Écrivez votre message.'; err.hidden = false; $('evmTexte').focus(); return; }
        bouton.disabled = true;
        try {
            await apiCall('/mail', { method: 'POST', body: JSON.stringify({ a: destinataire.id, objet: $('evmObjet').value.trim(), texte: texte }) });
            $('evmTexte').value = '';
            $('evmFenetre').hidden = true;
            toast('Message envoyé à ' + destinataire.username, 'success');
            if (dossier === 'envoyes') charger();
        } catch (x) {
            err.textContent = x.message || 'Envoi impossible pour le moment.';
            err.hidden = false;
        } finally { bouton.disabled = false; }
    }

    // ---------- Démarrage ----------
    document.addEventListener('DOMContentLoaded', function () {
        moi = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
        if (!moi) { location.href = 'login.html?redirect=messages.html'; return; }

        document.querySelectorAll('.evm-dossiers [data-dossier]').forEach(function (b) {
            b.addEventListener('click', function () { choisirDossier(b.getAttribute('data-dossier')); });
        });
        $('evmListe').addEventListener('click', function (e) {
            var l = e.target.closest('.evm-ligne');
            if (l) ouvrir(Number(l.getAttribute('data-id')));
        });
        $('evmLecture').addEventListener('click', function (e) {
            var b = e.target.closest('[data-action]');
            if (b) { e.preventDefault(); action(b.getAttribute('data-action')); }
        });
        $('evmPlus').addEventListener('click', function () { page++; charger(true); });
        $('evmRecherche').addEventListener('input', function () {
            clearTimeout(attenteRecherche);
            attenteRecherche = setTimeout(function () { recherche = $('evmRecherche').value.trim(); fermerLecture(); charger(); }, 300);
        });
        $('evmNouveau').addEventListener('click', function () { ecrire(null); });
        $('evmFermer').addEventListener('click', fermerFenetre);
        $('evmFenetre').addEventListener('click', function (e) { if (e.target === $('evmFenetre')) fermerFenetre(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('evmFenetre').hidden) fermerFenetre(); });
        $('evmForm').addEventListener('submit', envoyer);
        $('evmTexte').addEventListener('input', majLongueur);
        $('evmA').addEventListener('input', function () { clearTimeout(attenteRecherche); attenteRecherche = setTimeout(chercherMembres, 250); });

        // Nouveau message reçu pendant que la page est ouverte
        if (typeof io !== 'undefined') {
            try {
                var s = io('https://api.e-visiocam.com', { withCredentials: true, transports: ['websocket', 'polling'] });
                if (window.evcSurveillerSession) window.evcSurveillerSession(s);
                if (window.EvcSecurite) EvcSecurite.brancher(s);
                s.on('dm:message', function (d) {
                    if (d && d.message && d.message.sender_id !== moi.id) {
                        toast('Nouveau message de ' + (d.message.sender_username || 'un membre'), 'info');
                        if (dossier === 'recus' && !recherche) charger();
                    }
                });
            } catch (e) {}
        }

        // Liens existants : messages.html?ecrire=12 (galerie, fiche membre, notification push)
        var p = new URLSearchParams(location.search);
        var ecrireA = parseInt(p.get('ecrire'), 10), demande = p.get('demande');
        charger().then(async function () {
            if (!(ecrireA > 0) || ecrireA === moi.id) return;
            try { history.replaceState(null, '', location.pathname); } catch (e) {}
            // Un message non lu de ce membre (arrivée par une notification) : on l'ouvre
            try {
                var d = await apiCall('/mail?dossier=recus');
                var m = (d.messages || []).filter(function (x) { return !x.lu && x.autre.id === ecrireA; })[0];
                if (m) { ouvrir(m.id); return; }
                var u = (d.messages || []).map(function (x) { return x.autre; }).filter(function (a) { return a.id === ecrireA; })[0];
                if (!u) { var prof = await apiCall('/mail/membre/' + ecrireA).catch(function () { return null; }); u = prof && prof.membre; }
                if (!u || !u.username) u = { id: ecrireA, username: 'ce membre' };
                ecrire({ id: ecrireA, username: u.username },
                    demande === 'cam' ? 'Demande de caméra' : '',
                    demande === 'cam' ? '📷 Bonjour ! Ça vous dirait d’allumer votre cam ? Si vous êtes d’accord, vous pouvez m’inviter dans un live privé. Pas de souci si vous préférez ne pas le faire.' : '');
            } catch (e) {}
        });
    });
})();
