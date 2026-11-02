// ============================================================
// E-VISIOCAM — Chat roulette modéré (roulette.html)
// ------------------------------------------------------------
// Vidéo 1 à 1, en direct entre les deux membres (WebRTC, relais TURN via /api/turn/credentials).
// Le serveur (backend/roulette.js) forme les paires et ne relaie la signalisation qu'entre elles.
// Visiteur : la page explique et propose l'inscription ; l'application ne marche que connecté.
// Tout texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var CLE_REGLES = 'evc-roulette-regles-v1';
    var CLE_FILTRES = 'evc-roulette-filtres';
    var PAUSE_SUIVANT = 2000;
    var BASE = (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api').replace(/\/api\/?$/, '');

    var moi = null, statut = null, socket = null, flux = null, pc = null, rtcConfig = null;
    var session = null, partenaire = null, initiateur = false, candidats = [];
    var enMarche = false, sansCamera = false, dernierSuivant = 0, attenteDepuis = 0, enLigne = 0, minuterieVide = null, relance = null;

    function lire(cle) { try { return localStorage.getItem(cle); } catch (e) { return null; } }
    function ecrire(cle, v) { try { localStorage.setItem(cle, v); } catch (e) {} }
    function toast(t, type) { if (window.EvcSecurite && EvcSecurite.toast) EvcSecurite.toast(t, type); }
    async function api(chemin) {
        if (typeof apiCall === 'function') return apiCall(chemin);
        var r = await fetch(BASE + '/api' + chemin, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }

    // ============================================================
    // ÉCRAN (états : repos, attente, connexion, session, vide, camera)
    // ============================================================
    var ICONES = { repos: 'fa-shuffle', attente: 'fa-rotate', connexion: 'fa-link', vide: 'fa-moon', camera: 'fa-video-slash', fin: 'fa-hand' };
    function ecran(etat, titre, texte, opts) {
        opts = opts || {};
        $('rlScene').setAttribute('data-etat', etat);
        $('rlEcranTitre').textContent = titre || '';
        $('rlEcranTexte').textContent = texte || '';
        $('rlEcranIcone').firstElementChild.className = 'fa-solid ' + (ICONES[opts.icone || etat] || 'fa-shuffle');
        $('rlProgramme').hidden = !opts.programme;
        $('rlEcranActions').hidden = !opts.camera;
        majBoutons();
    }
    function etat() { return $('rlScene').getAttribute('data-etat'); }

    function majBoutons() {
        var e = etat(), avecPartenaire = !!partenaire && (e === 'session' || e === 'connexion');
        $('rlDemarrer').hidden = enMarche;
        $('rlSuivant').hidden = !enMarche;
        $('rlArreter').hidden = !enMarche;
        $('rlDemarrer').disabled = !!(statut && !statut.ok) || !socket;
        $('rlSignaler').disabled = !avecPartenaire;
        $('rlBloquer').disabled = !avecPartenaire;
        $('rlChatTexte').disabled = !avecPartenaire;
        $('rlPartenaire').hidden = !avecPartenaire;
        $('rlFile').hidden = !(enMarche && (e === 'attente' || e === 'vide'));
    }

    function majFile() {
        var n = Math.max(0, enLigne - 1);
        $('rlFile').textContent = n === 0 ? 'Vous êtes seul(e) à chercher' : n === 1 ? '1 autre personne cherche' : n + ' autres personnes cherchent';
    }

    // ============================================================
    // CAMÉRA
    // ============================================================
    async function allumerCamera() {
        if (flux && flux.getTracks().some(function (t) { return t.readyState === 'live'; })) return true;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('NonDisponible'), { name: 'NonDisponible' });
        if (window.EvcAideCam && EvcAideCam.prevenir && !(await EvcAideCam.prevenir())) return false;
        flux = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
            audio: { echoCancellation: true, noiseSuppression: true }
        });
        $('rlLocale').srcObject = flux;
        $('rlLocale').play().catch(function () {});
        $('rlLocaleCadre').classList.remove('rl-off');
        $('rlMicro').setAttribute('aria-pressed', 'false');
        $('rlCamera').setAttribute('aria-pressed', 'false');
        return true;
    }
    function eteindreCamera() {
        if (flux) flux.getTracks().forEach(function (t) { t.stop(); });
        flux = null;
        $('rlLocale').srcObject = null;
        $('rlLocaleCadre').classList.add('rl-off');
    }
    function cameraActive() { return !!flux && flux.getVideoTracks().some(function (t) { return t.enabled && t.readyState === 'live'; }); }

    function basculer(kind, bouton, libelleOn, libelleOff) {
        if (!flux) return;
        var pistes = kind === 'audio' ? flux.getAudioTracks() : flux.getVideoTracks();
        if (!pistes.length) return;
        var coupe = pistes[0].enabled;
        pistes.forEach(function (t) { t.enabled = !coupe; });
        bouton.setAttribute('aria-pressed', coupe ? 'true' : 'false');
        bouton.title = coupe ? libelleOff : libelleOn;
        bouton.setAttribute('aria-label', bouton.title);
        if (kind === 'video') $('rlLocaleCadre').classList.toggle('rl-off', coupe);
    }

    // ============================================================
    // TURN (relais : les adresses IP des deux membres restent cachées l'un pour l'autre)
    // ============================================================
    async function chargerTurn() {
        if (rtcConfig) return rtcConfig;
        rtcConfig = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], iceTransportPolicy: 'all' };
        try {
            var d = await api('/turn/credentials');
            if (d && d.iceServers && d.iceServers.length) rtcConfig = { iceServers: d.iceServers, iceTransportPolicy: d.iceTransportPolicy || 'all' };
        } catch (e) {}
        return rtcConfig;
    }

    // ============================================================
    // CONNEXION WEBRTC AVEC LE PARTENAIRE
    // ============================================================
    function signal(type, contenu) {
        if (!socket || !session) return;
        var d = { sessionId: session, type: type };
        if (type === 'ice') d.candidate = contenu; else d.description = contenu;
        socket.emit('roulette:signal', d);
    }
    function ajouterPistes() {
        if (!pc || !flux) return;
        var deja = pc.getSenders().map(function (s) { return s.track; });
        flux.getTracks().forEach(function (t) { if (deja.indexOf(t) === -1) pc.addTrack(t, flux); });
    }
    function creerPc() {
        fermerPc();
        var p = pc = new RTCPeerConnection(rtcConfig);
        var distant = new MediaStream();
        p.ontrack = function (e) {
            if (p !== pc) return;
            var s = e.streams && e.streams[0];
            if (s) distant = s; else distant.addTrack(e.track);
            var v = $('rlDistante');
            if (v.srcObject !== distant) v.srcObject = distant;
            v.play().catch(function () { v.muted = true; v.play().catch(function () {}); toast('Son coupé par le navigateur : touchez la vidéo pour l’activer.'); });
        };
        p.onicecandidate = function (e) { if (p === pc) signal('ice', e.candidate ? e.candidate.toJSON() : null); };
        p.onconnectionstatechange = function () {
            if (p !== pc) return;
            if (p.connectionState === 'connected') { ecran('session'); }
            else if (p.connectionState === 'failed') {
                toast('La connexion vidéo n’a pas pu s’établir. Personne suivante…', 'error');
                setTimeout(function () { if (p === pc) suivant(true); }, 1200);
            }
        };
        if (initiateur) {
            if (flux) ajouterPistes();
            else { p.addTransceiver('video', { direction: 'recvonly' }); p.addTransceiver('audio', { direction: 'recvonly' }); }
        }
        return p;
    }
    function fermerPc() {
        if (pc) { try { pc.ontrack = pc.onicecandidate = pc.onconnectionstatechange = null; pc.close(); } catch (e) {} }
        pc = null; candidats = [];
        var v = $('rlDistante');
        v.srcObject = null; v.muted = false;
        $('rlScene').classList.remove('rl-flou'); $('rlMasque').hidden = true;
    }
    async function viderCandidats() {
        var l = candidats; candidats = [];
        for (var i = 0; i < l.length; i++) { try { await pc.addIceCandidate(l[i]); } catch (e) {} }
    }

    async function surSignal(d) {
        if (!d || d.sessionId !== session || !pc) return;
        var p = pc;
        try {
            if (d.type === 'offer' && !initiateur) {
                await p.setRemoteDescription(d.description);
                ajouterPistes();
                var rep = await p.createAnswer();
                await p.setLocalDescription(rep);
                if (p !== pc) return;
                signal('answer', { type: p.localDescription.type, sdp: p.localDescription.sdp });
                await viderCandidats();
            } else if (d.type === 'answer' && initiateur) {
                await p.setRemoteDescription(d.description);
                await viderCandidats();
            } else if (d.type === 'ice') {
                if (d.candidate === null) return;
                if (p.remoteDescription) await p.addIceCandidate(d.candidate).catch(function () {});
                else candidats.push(d.candidate);
            }
        } catch (e) { console.warn('Roulette WebRTC :', e && e.message); }
    }

    async function surTrouve(d) {
        clearTimeout(minuterieVide); clearTimeout(relance);
        session = d.sessionId; partenaire = d.partenaire || {}; initiateur = !!d.initiateur;
        afficherPartenaire();
        viderChat('Vous êtes en relation avec ' + (partenaire.pseudo || 'un membre') + '. Dites bonjour !');
        ecran('connexion', 'Connexion avec ' + (partenaire.pseudo || 'un membre') + '…', 'La vidéo arrive dans un instant.');
        await chargerTurn();
        if (session !== d.sessionId) return;
        var p = creerPc();
        if (initiateur) {
            try {
                var offre = await p.createOffer();
                await p.setLocalDescription(offre);
                if (p === pc) signal('offer', { type: p.localDescription.type, sdp: p.localDescription.sdp });
            } catch (e) { console.warn('Roulette offre :', e && e.message); }
        }
    }

    function afficherPartenaire() {
        var a = $('rlAvatar'); a.textContent = '';
        var src = partenaire.avatar && typeof urlAvatar === 'function' ? urlAvatar(partenaire.avatar) : null;
        if (src) { var img = new Image(); img.alt = ''; img.src = src; a.appendChild(img); }
        else a.textContent = String(partenaire.pseudo || '?').charAt(0).toUpperCase();
        var p = $('rlPseudo'); p.textContent = partenaire.pseudo || 'Membre';
        if (partenaire.equipe) { var b = document.createElement('span'); b.className = 'rl-badge-equipe'; b.textContent = 'Équipe'; p.appendChild(b); }
        $('rlRegion').textContent = partenaire.region || 'Région non indiquée';
        $('rlProfil').href = 'membre.html?u=' + encodeURIComponent(partenaire.pseudo || '');
    }

    // ============================================================
    // DISCUSSION ÉCRITE
    // ============================================================
    function viderChat(info) {
        var l = $('rlMessages'); l.textContent = '';
        if (info) { var li = document.createElement('li'); li.className = 'rl-msg-info'; li.textContent = info; l.appendChild(li); }
        $('rlChatErreur').hidden = true;
    }
    function ajouterMessage(d) {
        if (!d || d.sessionId !== session) return;
        var li = document.createElement('li');
        var mien = moi && Number(d.de) === Number(moi.id);
        li.className = mien ? 'rl-moi' : '';
        var b = document.createElement('b'); b.textContent = mien ? 'Vous' : d.pseudo;
        li.appendChild(b); li.appendChild(document.createTextNode(d.texte));
        var l = $('rlMessages'); l.appendChild(li); l.scrollTop = l.scrollHeight;
    }
    function envoyerMessage(e) {
        e.preventDefault();
        var champ = $('rlChatTexte'), texte = champ.value.trim();
        if (!texte || !socket || !session) return;
        socket.emit('roulette:message', { texte: texte }, function (r) {
            if (r && r.ok) { champ.value = ''; $('rlChatErreur').hidden = true; }
            else if (r && r.message) { $('rlChatErreur').textContent = r.message; $('rlChatErreur').hidden = false; }
        });
    }

    // ============================================================
    // FILTRES
    // ============================================================
    function filtres() {
        return { cameraSeulement: $('rlFiltreCam').checked, memeRegion: $('rlFiltreRegion').checked && !$('rlFiltreRegion').disabled, genre: $('rlFiltreGenre').value };
    }
    function majResumeFiltres() {
        var f = filtres(), n = (f.cameraSeulement ? 1 : 0) + (f.memeRegion ? 1 : 0) + (f.genre ? 1 : 0);
        $('rlFiltresResume').textContent = n ? '(' + n + ' actif' + (n > 1 ? 's' : '') + ')' : '';
        ecrire(CLE_FILTRES, JSON.stringify(f));
    }
    function chargerFiltres() {
        var f = {}; try { f = JSON.parse(lire(CLE_FILTRES) || '{}') || {}; } catch (e) {}
        $('rlFiltreCam').checked = f.cameraSeulement === true;
        $('rlFiltreRegion').checked = f.memeRegion === true;
        if (['', 'homme', 'femme', 'autre'].indexOf(f.genre) !== -1) $('rlFiltreGenre').value = f.genre || '';
        majResumeFiltres();
    }

    // ============================================================
    // DÉMARRER / SUIVANT / ARRÊTER
    // ============================================================
    function reglesAcceptees() { return lire(CLE_REGLES) === '1'; }
    function demanderRegles() {
        return new Promise(function (resoudre) {
            var v = $('rlRegles'), ok = $('rlReglesOk'), oui = $('rlReglesOui'), non = $('rlReglesNon');
            ok.checked = false; oui.disabled = true; v.hidden = false; ok.focus();
            function fin(r) { v.hidden = true; ok.onchange = oui.onclick = non.onclick = null; document.removeEventListener('keydown', echap, true); resoudre(r); }
            function echap(e) { if (e.key === 'Escape') { e.stopPropagation(); fin(false); } }
            ok.onchange = function () { oui.disabled = !ok.checked; };
            oui.onclick = function () { ecrire(CLE_REGLES, '1'); fin(true); };
            non.onclick = function () { fin(false); };
            document.addEventListener('keydown', echap, true);
        });
    }

    async function demarrer() {
        if (enMarche || !socket) return;
        if (statut && !statut.ok) return;
        if (!reglesAcceptees() && !(await demanderRegles())) return;
        if (!sansCamera) {
            try {
                if (!(await allumerCamera())) { ecranCamera(null); return; }
            } catch (err) {
                ecranCamera(err);
                if (window.EvcAideCam) EvcAideCam.expliquerErreur(err, function () { sansCamera = false; demarrer(); });
                return;
            }
        }
        await chargerTurn();
        enMarche = true;
        rejoindre();
    }
    function ecranCamera(err) {
        var nom = err && err.name;
        var texte = nom === 'NotAllowedError' || nom === 'SecurityError' ? 'L’accès à la caméra a été refusé. Autorisez-la dans les réglages du navigateur, ou discutez par écrit seulement.'
            : nom === 'NotFoundError' ? 'Aucune caméra trouvée sur cet appareil. Vous pouvez discuter par écrit seulement.'
            : nom === 'NotReadableError' ? 'Votre caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.'
            : 'La caméra n’a pas démarré. Réessayez, ou discutez par écrit seulement.';
        ecran('camera', 'Caméra indisponible', texte, { camera: true });
    }

    function rejoindre() {
        if (!enMarche || !socket) return;
        clearTimeout(relance);
        attenteDepuis = Date.now();
        ecran('attente', 'Recherche d’une personne…', 'Nous cherchons quelqu’un de disponible' + (filtres().memeRegion || filtres().genre || filtres().cameraSeulement ? ' selon vos filtres.' : '.'));
        socket.emit('roulette:rejoindre', { filtres: filtres(), camera: cameraActive() }, function (r) {
            if (r && r.ok) { enLigne = r.enLigne || enLigne; majFile(); surveillerVide(); return; }
            refus(r);
        });
    }

    function suivant(auto) {
        if (!enMarche || !socket) return;
        var t = Date.now();
        if (!auto && t - dernierSuivant < PAUSE_SUIVANT) return;
        clearTimeout(relance);
        dernierSuivant = t;
        $('rlSuivant').disabled = true;
        setTimeout(function () { $('rlSuivant').disabled = false; }, PAUSE_SUIVANT);
        fermerPc(); session = null; partenaire = null;
        viderChat();
        attenteDepuis = Date.now();
        ecran('attente', 'Recherche d’une autre personne…', 'Un instant, nous cherchons quelqu’un de disponible.');
        socket.emit('roulette:suivant', { filtres: filtres(), camera: cameraActive() }, function (r) {
            if (r && r.ok) { enLigne = r.enLigne || enLigne; majFile(); surveillerVide(); return; }
            if (r && r.code === 'rythme') { relance = setTimeout(function () { suivant(true); }, (r.attente || 1000) + 50); return; }
            refus(r);
        });
    }

    function arreter(texte) {
        enMarche = false;
        clearTimeout(minuterieVide); clearTimeout(relance);
        if (socket) socket.emit('roulette:quitter');
        fermerPc(); session = null; partenaire = null;
        eteindreCamera();
        ecran('repos', texte ? texte.titre : 'Prêt pour une rencontre ?', texte ? texte.texte : 'Appuyez sur « Démarrer » : nous cherchons une personne disponible.', { icone: texte ? 'fin' : 'repos' });
    }

    function refus(r) {
        var msg = (r && r.message) || 'La roulette est indisponible pour le moment.';
        enMarche = false;
        fermerPc(); session = null; partenaire = null;
        ecran('repos', 'Pas tout de suite…', msg, { icone: 'fin' });
        if (r && (r.code === 'age' || r.code === 'sanction' || r.code === 'email' || r.code === 'compte')) {
            statut = { ok: false, message: msg }; afficherRefus(msg); majBoutons();
        }
    }
    function afficherRefus(msg) { var b = $('rlRefus'); b.textContent = msg; b.hidden = !msg; }

    // Personne n'est disponible : on le dit, on propose le programme, et on continue à chercher
    function surveillerVide() {
        clearTimeout(minuterieVide);
        minuterieVide = setTimeout(function () {
            if (!enMarche || session || (etat() !== 'attente' && etat() !== 'vide')) return;
            if (enLigne <= 1) ecran('vide', 'Personne n’est disponible', 'Personne n’est disponible — essayez pendant les soirées (programme). Nous continuons à chercher automatiquement.', { programme: true });
            surveillerVide();
        }, 8000);
    }

    function surFin(d) {
        if (!d || (session && d.sessionId && d.sessionId !== session && d.raison !== 'autre_onglet')) return;
        var avait = partenaire && partenaire.pseudo;
        fermerPc(); session = null; partenaire = null;
        switch (d.raison) {
            case 'suivant': return majBoutons();   // déjà remis dans la file par le serveur
            case 'partenaire_parti':
                if (!enMarche) return ecran('repos');
                viderChat((avait || 'Votre partenaire') + ' est parti(e).');
                ecran('attente', (avait || 'Votre partenaire') + ' est parti(e)', 'Nous cherchons quelqu’un d’autre…');
                relance = setTimeout(rejoindre, 700);
                return;
            case 'bloque':
                toast((avait || 'Ce membre') + ' est bloqué : vous ne le recroiserez plus.');
                if (enMarche) { viderChat(); relance = setTimeout(rejoindre, 700); }
                return;
            case 'signale':
                enMarche = false; clearTimeout(minuterieVide);
                viderChat('Signalement envoyé. Merci : la modération va l’examiner.');
                ecran('repos', 'Conversation arrêtée', 'Votre signalement a été envoyé avec les messages échangés. Vous ne recroiserez pas cette personne. Appuyez sur « Démarrer » quand vous voulez.', { icone: 'fin' });
                return;
            case 'sanction': return arreter({ titre: 'Session arrêtée', texte: d.message || 'Session arrêtée par la modération.' });
            case 'autre_onglet': return arreter({ titre: 'Roulette ouverte ailleurs', texte: 'Vous avez lancé la roulette dans un autre onglet ou appareil.' });
            default: if (enMarche) relance = setTimeout(rejoindre, 700); else ecran('repos');
        }
    }

    // ============================================================
    // SIGNALER / BLOQUER
    // ============================================================
    function masquerVideo() { $('rlScene').classList.add('rl-flou'); $('rlMasque').hidden = false; }
    function signaler() {
        if (!partenaire || !partenaire.id) return;
        masquerVideo();   // la vidéo est floutée pendant le signalement (« Afficher » pour la remettre)
        if (window.EvcSecurite) EvcSecurite.signaler({ type: 'user', userId: partenaire.id, username: partenaire.pseudo, peutBloquer: true });
    }
    async function bloquer() {
        if (!partenaire || !partenaire.id || !socket) return;
        var p = partenaire;
        var ok = window.EvcSecurite ? await EvcSecurite.bloquer(p.id, p.pseudo) : true;
        if (!ok) return;
        socket.emit('roulette:bloquer', {}, function () {});
    }

    // ============================================================
    // TEMPS RÉEL
    // ============================================================
    function connecter() {
        if (typeof io === 'undefined') { afficherRefus('Serveur temps réel injoignable : rechargez la page dans un instant.'); return; }
        socket = io(BASE, { withCredentials: true, transports: ['websocket', 'polling'], reconnection: true, reconnectionDelay: 1000 });
        if (window.evcSurveillerSession) window.evcSurveillerSession(socket);
        if (window.EvcSecurite && EvcSecurite.brancher) EvcSecurite.brancher(socket);
        socket.on('connect', function () { majBoutons(); if (enMarche && !session) rejoindre(); });
        socket.on('disconnect', function () {
            fermerPc(); session = null; partenaire = null;
            if (enMarche) ecran('attente', 'Connexion perdue', 'Reconnexion en cours…');
        });
        socket.on('roulette:trouve', surTrouve);
        socket.on('roulette:signal', surSignal);
        socket.on('roulette:message', ajouterMessage);
        socket.on('roulette:fin', surFin);
        socket.on('roulette:attente', function (d) { enLigne = (d && d.enLigne) || 0; majFile(); if (etat() === 'vide' && enLigne > 1) ecran('attente', 'Recherche d’une personne…', 'Des personnes sont arrivées, nous cherchons…'); });
        socket.on('roulette:erreur', function (d) { refus(d); });
        majBoutons();
    }

    // ============================================================
    // CLAVIER : → ou Échap = Suivant (hors saisie et hors fenêtre ouverte)
    // ============================================================
    function fenetreOuverte() {
        if (!$('rlRegles').hidden || document.getElementById('evq-voile') || document.getElementById('evcAideCam')) return true;
        try { if (window.top !== window && window.top.document.getElementById('evq-voile')) return true; } catch (e) {}
        return false;
    }
    function touche(e) {
        if (e.key !== 'ArrowRight' && e.key !== 'Escape') return;
        var t = e.target, tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        if (fenetreOuverte() || !enMarche) return;
        e.preventDefault();
        suivant();
    }

    // ============================================================
    // ÉQUIPE : nombre de sessions en cours (aucune vidéo visible : elle est directe entre les membres)
    // ============================================================
    function compteursEquipe() {
        api('/roulette/equipe').then(function (d) {
            var p = $('rlEquipe');
            p.textContent = 'Équipe : ' + d.sessions + ' conversation' + (d.sessions > 1 ? 's' : '') + ' en cours · ' + d.enAttente + ' en attente. La vidéo est directe entre les membres : vous ne pouvez pas la voir, seuls les signalements vous parviennent.';
            p.hidden = false;
        }).catch(function () {});
    }

    // ============================================================
    // DÉMARRAGE DE LA PAGE
    // ============================================================
    function compteurPublic() {
        fetch(BASE + '/api/roulette/statut').then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
            if (!d) return;
            var p = $('rlCompteurPublic');
            p.textContent = d.enAttente > 1 ? d.enAttente + ' personnes cherchent quelqu’un en ce moment' : 'Plus animé en soirée : consultez le programme';
            p.hidden = false;
        }).catch(function () {});
    }

    async function init() {
        var connecte = typeof isLoggedIn === 'function' && isLoggedIn();
        if (!connecte) { compteurPublic(); return; }
        moi = getCurrentUser();
        document.querySelector('.rl-main').classList.add('rl-connecte');
        $('rlVisiteur').hidden = true;
        $('rlApp').hidden = false;
        $('rlLocaleCadre').classList.add('rl-off');
        chargerFiltres();
        ['rlFiltreCam', 'rlFiltreRegion', 'rlFiltreGenre'].forEach(function (id) { $(id).addEventListener('change', majResumeFiltres); });
        $('rlDemarrer').addEventListener('click', demarrer);
        $('rlSuivant').addEventListener('click', function () { suivant(); });
        $('rlArreter').addEventListener('click', function () { arreter(); });
        $('rlSignaler').addEventListener('click', signaler);
        $('rlBloquer').addEventListener('click', bloquer);
        $('rlDemasquer').addEventListener('click', function () { $('rlScene').classList.remove('rl-flou'); $('rlMasque').hidden = true; });
        $('rlMicro').addEventListener('click', function () { basculer('audio', this, 'Couper le micro', 'Rallumer le micro'); });
        $('rlCamera').addEventListener('click', function () { basculer('video', this, 'Couper la caméra', 'Rallumer la caméra'); });
        $('rlReessayerCam').addEventListener('click', function () { sansCamera = false; demarrer(); });
        $('rlSansCamera').addEventListener('click', function () { sansCamera = true; eteindreCamera(); demarrer(); });
        $('rlChatForm').addEventListener('submit', envoyerMessage);
        $('rlDistante').addEventListener('click', function () { var v = $('rlDistante'); if (v.muted) { v.muted = false; v.play().catch(function () {}); } });
        document.addEventListener('keydown', touche);
        window.addEventListener('pagehide', function () { if (socket) socket.emit('roulette:quitter'); eteindreCamera(); });
        ecran('repos');
        connecter();
        try {
            statut = await api('/roulette/moi');
            if (!statut.ok) afficherRefus(statut.message);
            var reg = $('rlFiltreRegion');
            if (statut.region) $('rlFiltreRegionTxt').textContent = 'Même région que moi (' + statut.region + ')';
            else { reg.checked = false; reg.disabled = true; reg.parentNode.classList.add('rl-inactif'); $('rlFiltreRegionTxt').textContent = 'Même région que moi (indiquez votre département dans Mon profil)'; majResumeFiltres(); }
        } catch (e) { statut = null; }
        majBoutons();
        if (typeof isModerator === 'function' && isModerator()) { compteursEquipe(); setInterval(compteursEquipe, 20000); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
