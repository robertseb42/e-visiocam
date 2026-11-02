// ============================================================
// E-VISIOCAM - Live privé sur invitation : sélecteur d'invités + bannière d'invitation
// ------------------------------------------------------------
// Partagé par le salon (chat.html) et la page Live (live.html).
//   LivePrive.ouvrir({ membres, preselection, deja, titre, bouton, onConfirm(ids, noms) })
//   LivePrive.banniere({ de, onRegarder, adulte, streamId, socket })
//   LivePrive.confirmerAdulte({ titre, intro, points, bouton, opaque, onOui, onNon })
//   LivePrive.accepterLiveAdulte(socket, streamId, nom, onOk)   (confirmation + live:adulte-accept)
//   LivePrive.signaler({ nom, contexte })                       (« Arrêter et signaler »)
// 🔞 Live « sans restriction » : réservé aux adultes consentants. Le diffuseur le choisit,
// chaque invité confirme lui-même (le serveur refuse la vidéo tant qu'il n'a pas confirmé).
// Tout le texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    var MAX = 20;
    var ID_PANNEAU = 'evc-prive-overlay', ID_BANNIERE = 'evc-prive-banniere';

    function sombre() { return document.documentElement.getAttribute('data-theme') !== 'light'; }
    function couleurs() {
        return sombre()
            ? { fond: '#1c1c20', texte: '#f5f5f7', doux: '#b1b1bd', ligne: '#3b3b43', champ: '#25252b', accent: '#ffe500', surAccent: '#111113' }
            : { fond: '#ffffff', texte: '#14161c', doux: '#6a7282', ligne: '#dcdfe6', champ: '#eef0f4', accent: '#e91e63', surAccent: '#ffffff' };
    }
    function el(tag, css, texte) {
        var n = document.createElement(tag);
        if (css) n.style.cssText = css;
        if (texte !== undefined) n.textContent = texte;
        return n;
    }
    function fermer() {
        var o = document.getElementById(ID_PANNEAU);
        if (o && o.parentNode) o.parentNode.removeChild(o);
        document.removeEventListener('keydown', surTouche);
    }
    function surTouche(e) { if (e.key === 'Escape') fermer(); }

    // options.membres : [{ id, username }] ; options.preselection : ids déjà cochés ;
    // options.deja : ids déjà invités (cochés et verrouillés : on ne peut qu'en ajouter)
    function ouvrir(options) {
        fermer();
        var c = couleurs();
        var membres = (options.membres || []).filter(function (m) { return m && m.id != null; });
        var deja = {}; (options.deja || []).forEach(function (id) { deja[String(id)] = true; });
        var choisis = {}; (options.preselection || []).forEach(function (id) { choisis[String(id)] = true; });
        Object.keys(deja).forEach(function (k) { choisis[k] = true; });

        var fond = el('div', 'position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.6);font-family:system-ui,sans-serif');
        fond.id = ID_PANNEAU;
        fond.addEventListener('click', function (e) { if (e.target === fond) fermer(); });
        var p = el('div', 'width:100%;max-width:440px;max-height:90vh;display:flex;flex-direction:column;background:' + c.fond + ';color:' + c.texte + ';border:1px solid ' + c.ligne + ';border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)');
        p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-labelledby', ID_PANNEAU + '-t');
        var t = el('h2', 'margin:0 0 6px;font-size:19px;font-weight:800', options.titre || '🔒 Live privé');
        t.id = ID_PANNEAU + '-t';
        p.appendChild(t);
        p.appendChild(el('p', 'margin:0 0 12px;font-size:13px;line-height:1.5;color:' + c.doux,
            'Seuls les membres que vous choisissez, et l\'équipe de modération, pourront voir votre caméra. ' + MAX + ' invités au maximum. ' +
            'Vous pourrez en ajouter pendant le live ; pour en retirer, terminez le live.'));

        // 🔞 Option « sans restriction » (au lancement seulement, pas en cours de live)
        var adulteCb = null;
        if (options.avecAdulte) {
            var boiteA = el('label', 'display:flex;gap:10px;align-items:flex-start;margin:0 0 12px;padding:10px 12px;border-radius:10px;border:1px solid ' + c.ligne + ';cursor:pointer;font-size:13px;line-height:1.45');
            adulteCb = document.createElement('input');
            adulteCb.type = 'checkbox'; adulteCb.checked = !!options.adulte; adulteCb.style.accentColor = c.accent; adulteCb.style.marginTop = '2px';
            var txtA = el('span', '');
            txtA.appendChild(el('strong', '', '🔞 Sans restriction (adultes consentants)'));
            txtA.appendChild(el('span', 'display:block;color:' + c.doux, 'Ce qui se passe entre adultes d\'accord reste privé. Chaque invité devra confirmer qu\'il est majeur et d\'accord avant de vous voir. Comptes de plus de 3 jours.'));
            boiteA.appendChild(adulteCb); boiteA.appendChild(txtA);
            p.appendChild(boiteA);
        }

        var recherche = el('input', 'width:100%;padding:9px 12px;margin-bottom:8px;border-radius:10px;border:1px solid ' + c.ligne + ';background:' + c.champ + ';color:' + c.texte + ';font-size:14px;box-sizing:border-box');
        recherche.type = 'search'; recherche.placeholder = 'Rechercher un membre…'; recherche.setAttribute('aria-label', 'Rechercher un membre');
        p.appendChild(recherche);

        var liste = el('div', 'flex:1;min-height:60px;max-height:280px;overflow:auto;border:1px solid ' + c.ligne + ';border-radius:10px;margin-bottom:10px');
        p.appendChild(liste);
        var compteur = el('p', 'margin:0 0 12px;font-size:12px;color:' + c.doux);
        p.appendChild(compteur);
        var rangee = el('div', 'display:flex;gap:8px;justify-content:flex-end');
        var annuler = el('button', 'padding:10px 16px;border-radius:10px;border:1px solid ' + c.ligne + ';background:transparent;color:' + c.texte + ';font-weight:600;cursor:pointer', 'Annuler');
        annuler.type = 'button';
        var valider = el('button', 'padding:10px 18px;border-radius:10px;border:0;background:' + c.accent + ';color:' + c.surAccent + ';font-weight:700;cursor:pointer', options.bouton || 'Valider');
        valider.type = 'button';
        rangee.appendChild(annuler); rangee.appendChild(valider); p.appendChild(rangee);

        function nombre() { return Object.keys(choisis).length; }
        function majPied() {
            var n = nombre();
            compteur.textContent = n + ' invité' + (n > 1 ? 's' : '') + ' sur ' + MAX;
            var vide = n === 0 || (options.deja && n === Object.keys(deja).length);
            valider.disabled = vide;
            valider.style.opacity = vide ? '.45' : '1';
            valider.style.cursor = vide ? 'not-allowed' : 'pointer';
        }
        function dessiner() {
            var q = recherche.value.trim().toLowerCase();
            while (liste.firstChild) liste.removeChild(liste.firstChild);
            var vus = membres.filter(function (m) { return String(m.username || '').toLowerCase().indexOf(q) !== -1; });
            if (!vus.length) {
                liste.appendChild(el('p', 'margin:0;padding:14px;font-size:13px;color:' + c.doux, membres.length ? 'Aucun membre ne correspond.' : 'Aucun autre membre n\'est connecté pour le moment.'));
            }
            vus.forEach(function (m) {
                var cle = String(m.id), verrou = !!deja[cle];
                var ligne = el('label', 'display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid ' + c.ligne + ';cursor:' + (verrou ? 'default' : 'pointer') + ';font-size:14px');
                var cb = document.createElement('input');
                cb.type = 'checkbox'; cb.checked = !!choisis[cle]; cb.disabled = verrou;
                cb.style.accentColor = c.accent;
                cb.addEventListener('change', function () {
                    if (cb.checked) {
                        if (nombre() >= MAX) { cb.checked = false; compteur.textContent = 'Maximum atteint : ' + MAX + ' invités.'; return; }
                        choisis[cle] = true;
                    } else { delete choisis[cle]; }
                    majPied();
                });
                ligne.appendChild(cb);
                ligne.appendChild(el('span', 'flex:1', m.username || '?'));
                if (verrou) ligne.appendChild(el('span', 'font-size:11px;color:' + c.doux, 'déjà invité'));
                liste.appendChild(ligne);
            });
            majPied();
        }
        recherche.addEventListener('input', dessiner);
        annuler.addEventListener('click', fermer);
        valider.addEventListener('click', function () {
            if (valider.disabled) return;
            var ids = [], noms = {};
            membres.forEach(function (m) { if (choisis[String(m.id)]) { ids.push(m.id); noms[m.id] = m.username; } });
            fermer();
            if (options.onConfirm) options.onConfirm(ids, noms, { adulte: !!(adulteCb && adulteCb.checked) });
        });
        document.addEventListener('keydown', surTouche);
        fond.appendChild(p);
        document.body.appendChild(fond);
        dessiner();
        recherche.focus();
        return fond;
    }

    // Invitation reçue : petite bannière en bas de l'écran
    function banniere(options) {
        var ancienne = document.getElementById(ID_BANNIERE);
        if (ancienne && ancienne.parentNode) ancienne.parentNode.removeChild(ancienne);
        var c = couleurs();
        var b = el('div', 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:2147482000;max-width:calc(100vw - 24px);display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:10px;padding:12px 16px;border-radius:14px;background:' + c.fond + ';color:' + c.texte + ';border:1px solid ' + c.accent + ';box-shadow:0 10px 40px rgba(0,0,0,.45);font-family:system-ui,sans-serif;font-size:14px');
        b.id = ID_BANNIERE;
        b.setAttribute('role', 'alert');
        b.appendChild(el('span', 'font-weight:700', (options.adulte ? '🔞 ' : '🔒 ') + (options.de || 'Un membre') + ' vous invite à son live privé' + (options.adulte ? ' sans restriction' : '')));
        var voir = el('button', 'padding:8px 14px;border-radius:9px;border:0;background:' + c.accent + ';color:' + c.surAccent + ';font-weight:700;cursor:pointer', 'Regarder');
        voir.type = 'button';
        var plusTard = el('button', 'padding:8px 12px;border-radius:9px;border:1px solid ' + c.ligne + ';background:transparent;color:' + c.texte + ';font-weight:600;cursor:pointer', 'Plus tard');
        plusTard.type = 'button';
        function retirer() { if (b.parentNode) b.parentNode.removeChild(b); }
        voir.addEventListener('click', function () {
            retirer();
            if (!options.onRegarder) return;
            if (options.adulte && options.socket) accepterLiveAdulte(options.socket, options.streamId, options.de, options.onRegarder);
            else options.onRegarder();
        });
        plusTard.addEventListener('click', retirer);
        b.appendChild(voir); b.appendChild(plusTard);
        document.body.appendChild(b);
        return b;
    }

    // ============================================================
    // 🔞 Confirmation « majeur et d'accord » (live sans restriction, salon coquin)
    // ============================================================
    var ID_ACCORD = 'evc-accord-adulte';
    function confirmerAdulte(o) {
        o = o || {};
        var ancien = document.getElementById(ID_ACCORD);
        if (ancien && ancien.parentNode) ancien.parentNode.removeChild(ancien);
        var c = couleurs();
        var fond = el('div', 'position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,' + (o.opaque ? '.94' : '.7') + ');font-family:system-ui,sans-serif');
        fond.id = ID_ACCORD;
        var p = el('div', 'width:100%;max-width:460px;max-height:92vh;overflow:auto;background:' + c.fond + ';color:' + c.texte + ';border:1px solid ' + c.ligne + ';border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)');
        p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-labelledby', ID_ACCORD + '-t');
        var t = el('h2', 'margin:0 0 8px;font-size:19px;font-weight:800', o.titre || '🔞 Espace sans restriction');
        t.id = ID_ACCORD + '-t';
        p.appendChild(t);
        if (o.intro) p.appendChild(el('p', 'margin:0 0 12px;font-size:13px;line-height:1.5;color:' + c.doux, o.intro));
        var cases = [];
        (o.points || []).forEach(function (txt) {
            var l = el('label', 'display:flex;gap:10px;align-items:flex-start;margin:0 0 10px;font-size:14px;line-height:1.45;cursor:pointer');
            var cb = document.createElement('input');
            cb.type = 'checkbox'; cb.style.accentColor = c.accent; cb.style.marginTop = '3px';
            l.appendChild(cb); l.appendChild(el('span', '', txt));
            p.appendChild(l); cases.push(cb);
        });
        var rangee = el('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:14px');
        var non = el('button', 'padding:10px 16px;border-radius:10px;border:1px solid ' + c.ligne + ';background:transparent;color:' + c.texte + ';font-weight:600;cursor:pointer', o.boutonNon || 'Non merci');
        var oui = el('button', 'padding:10px 18px;border-radius:10px;border:0;background:' + c.accent + ';color:' + c.surAccent + ';font-weight:700;cursor:pointer', o.bouton || 'Je confirme');
        non.type = oui.type = 'button';
        rangee.appendChild(non); rangee.appendChild(oui); p.appendChild(rangee);
        function maj() { var ok = cases.every(function (x) { return x.checked; }); oui.disabled = !ok; oui.style.opacity = ok ? '1' : '.45'; oui.style.cursor = ok ? 'pointer' : 'not-allowed'; }
        cases.forEach(function (x) { x.addEventListener('change', maj); });
        function fin(r) {
            if (fond.parentNode) fond.parentNode.removeChild(fond);
            document.removeEventListener('keydown', echap, true);
            if (r) { if (o.onOui) o.onOui(); } else if (o.onNon) o.onNon();
        }
        function echap(e) { if (e.key === 'Escape') { e.stopPropagation(); fin(false); } }
        non.addEventListener('click', function () { fin(false); });
        oui.addEventListener('click', function () { if (!oui.disabled) fin(true); });
        document.addEventListener('keydown', echap, true);
        fond.appendChild(p);
        document.body.appendChild(fond);
        maj();
        if (cases[0]) cases[0].focus();
        return fond;
    }

    // Invité d'un live sans restriction : confirmation, puis accord envoyé au serveur
    function accepterLiveAdulte(socket, streamId, nom, onOk) {
        confirmerAdulte({
            titre: '🔞 Live privé sans restriction',
            intro: (nom || 'Ce membre') + ' vous invite à un live réservé aux adultes consentants. Vous pouvez partir à tout moment.',
            points: [
                'J\'ai 18 ans ou plus.',
                'Je choisis de voir un live sans restriction, entre adultes consentants.',
                'Je n\'enregistre rien et ne fais aucune capture : c\'est interdit et sanctionné par un bannissement définitif.'
            ],
            bouton: 'Regarder',
            onOui: function () {
                if (!socket) return;
                var fini = false;
                function ok(d) {
                    if (fini || !d || d.streamId !== streamId) return;
                    fini = true; socket.off('live:adulte-ok', ok);
                    if (onOk) onOk();
                }
                socket.on('live:adulte-ok', ok);
                setTimeout(function () { if (!fini) { fini = true; socket.off('live:adulte-ok', ok); } }, 10000);
                socket.emit('live:adulte-accept', { streamId: streamId });
            }
        });
    }

    // ============================================================
    // 🚩 « Arrêter et signaler » : motifs fixes (liste blanche du serveur) + précisions
    // ============================================================
    var MOTIFS = [
        ['contenu_sexuel_non_consenti', 'Contenu imposé ou sans mon accord'],
        ['mineur', 'La personne semble mineure'],
        ['harcelement', 'Chantage, menace ou harcèlement'],
        ['contenu_illegal', 'Contenu illégal'],
        ['autre', 'Autre problème']
    ];
    function signaler(o) {
        o = o || {};
        var ancien = document.getElementById(ID_ACCORD);
        if (ancien && ancien.parentNode) ancien.parentNode.removeChild(ancien);
        var c = couleurs();
        var fond = el('div', 'position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.7);font-family:system-ui,sans-serif');
        fond.id = ID_ACCORD;
        var p = el('form', 'width:100%;max-width:440px;background:' + c.fond + ';color:' + c.texte + ';border:1px solid ' + c.ligne + ';border-radius:16px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.5)');
        p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true');
        p.appendChild(el('h2', 'margin:0 0 6px;font-size:19px;font-weight:800', '🚩 Signaler ' + (o.nom || 'ce membre')));
        p.appendChild(el('p', 'margin:0 0 12px;font-size:13px;color:' + c.doux, 'La caméra est coupée de votre côté. La modération reçoit votre signalement.'));
        var nomGroupe = 'evc-motif-' + Date.now();
        MOTIFS.forEach(function (m, i) {
            var l = el('label', 'display:flex;gap:10px;align-items:center;margin:0 0 8px;font-size:14px;cursor:pointer');
            var r = document.createElement('input');
            r.type = 'radio'; r.name = nomGroupe; r.value = m[0]; if (i === 0) r.checked = true; r.style.accentColor = c.accent;
            l.appendChild(r); l.appendChild(el('span', '', m[1]));
            p.appendChild(l);
        });
        var details = document.createElement('textarea');
        details.maxLength = 500; details.rows = 3; details.placeholder = 'Précisions (facultatif)';
        details.style.cssText = 'width:100%;box-sizing:border-box;margin:6px 0 12px;padding:9px 12px;border-radius:10px;border:1px solid ' + c.ligne + ';background:' + c.champ + ';color:' + c.texte + ';font-size:14px;font-family:inherit';
        p.appendChild(details);
        var erreur = el('p', 'margin:0 0 10px;font-size:13px;color:#f87171;display:none');
        p.appendChild(erreur);
        var rangee = el('div', 'display:flex;gap:8px;justify-content:flex-end');
        var annuler = el('button', 'padding:10px 16px;border-radius:10px;border:1px solid ' + c.ligne + ';background:transparent;color:' + c.texte + ';font-weight:600;cursor:pointer', 'Annuler');
        var envoyer = el('button', 'padding:10px 18px;border-radius:10px;border:0;background:#e11d48;color:#fff;font-weight:700;cursor:pointer', 'Envoyer le signalement');
        annuler.type = 'button'; envoyer.type = 'submit';
        rangee.appendChild(annuler); rangee.appendChild(envoyer); p.appendChild(rangee);
        function fermerS() { if (fond.parentNode) fond.parentNode.removeChild(fond); }
        annuler.addEventListener('click', fermerS);
        p.addEventListener('submit', function (e) {
            e.preventDefault();
            var choisi = p.querySelector('input[name="' + nomGroupe + '"]:checked');
            var corps = { targetType: 'user', targetUsername: o.nom, reason: choisi ? choisi.value : 'autre',
                description: ((o.contexte ? '[' + o.contexte + '] ' : '') + details.value.trim()).slice(0, 1000) };
            envoyer.disabled = true;
            var envoi = typeof apiCall === 'function'
                ? apiCall('/reports', { method: 'POST', body: JSON.stringify(corps) })
                : Promise.reject(new Error('Signalement indisponible'));
            envoi.then(function () {
                fermerS();
                if (typeof showToast === 'function') showToast('✅ Signalement envoyé à la modération', 'success');
            }).catch(function (err) {
                envoyer.disabled = false;
                erreur.textContent = (err && err.message) || 'Envoi impossible pour le moment.';
                erreur.style.display = 'block';
            });
        });
        fond.addEventListener('click', function (e) { if (e.target === fond) fermerS(); });
        fond.appendChild(p);
        document.body.appendChild(fond);
        return fond;
    }

    window.LivePrive = { MAX: MAX, ouvrir: ouvrir, banniere: banniere, fermer: fermer,
        confirmerAdulte: confirmerAdulte, accepterLiveAdulte: accepterLiveAdulte, signaler: signaler };
})();
