// Essai sans compte (apercu.html) : un vrai salon public EN DIRECT, en lecture seule.
// - Messages relus toutes les 5 secondes sur GET /api/salons/apercu (pseudos masqués par le serveur,
//   jamais de salon privé ni masqué, 20 derniers messages des 48 h, limite de débit côté serveur).
//   Pas de connexion temps réel anonyme : rien de nouveau à protéger côté serveur.
// - La barre de saisie ressemble à celle du salon : la toucher (ou caméra, réaction, message privé)
//   ouvre une fiche d'inscription rapide par le bas, sans quitter la page.
// - Compte créé : direction chat.html?theme=<même salon>, le message tapé est remis dans la zone de
//   saisie (sessionStorage « evc-brouillon », lu par pages/chat.js) ; bienvenue.html est sautée.
// - Adresse e-mail à confirmer (EMAIL_VERIFICATION) : « vérifiez votre e-mail », on reste ici.
(function () {
    'use strict';
    var api = typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api';
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var $ = function (id) { return document.getElementById(id); };
    var onglets = $('apcOnglets');
    var fil = $('apcFil');
    var PERIODE = 5000, PERIODE_RALENTIE = 30000, MAX_LIGNES = 60;
    var salons = [], choisi = null, minuteur = null;
    var affiche = { slug: null, ids: new Set() };   // ce qui est déjà dessiné dans le fil
    var enAttenteDeConfirmation = null;              // { email, username } après une inscription à confirmer

    // Salon demandé : apercu.html?salon=<slug>, sinon celui regardé juste avant dans cette visite
    var demande = '';
    try { demande = new URLSearchParams(location.search).get('salon') || sessionStorage.getItem('evc-apercu-salon') || ''; } catch (e) {}
    demande = /^[a-z0-9_-]{1,40}$/i.test(demande) ? demande : '';

    // Dates du serveur en UTC (« 2026-10-07 20:15:03 ») → heure locale
    function heure(d) {
        var t = new Date(String(d || '').replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(d) ? '' : 'Z'));
        return isNaN(t) ? '' : t.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
    function presents(s) { return s.presents > 0 ? s.presents + (s.presents > 1 ? ' présents' : ' présent') : ''; }
    function salonChoisi() { return salons.find(function (x) { return x.slug === choisi; }) || null; }

    // Par défaut : le salon où les VRAIS membres parlent le plus (pas celui où l'animateur a parlé
    // en dernier), puis le plus récent entre membres, puis le plus fréquenté
    function salonParDefaut() {
        function membres(s) { return s.messages.filter(function (m) { return !m.animateur; }); }
        function dernierMembre(s) { var m = membres(s); return m.length ? m[m.length - 1].id : 0; }
        var tri = salons.slice().sort(function (a, b) {
            return (membres(b).length - membres(a).length) || (dernierMembre(b) - dernierMembre(a)) ||
                (b.presents - a.presents) || (b.messages.length - a.messages.length);
        });
        return tri[0] ? tri[0].slug : null;
    }

    function afficherOnglets() {
        onglets.innerHTML = salons.map(function (s) {
            var info = presents(s);
            return '<button type="button" class="apc-onglet" data-slug="' + esc(s.slug) + '" aria-pressed="' + (s.slug === choisi) + '">' +
                esc(s.icon) + ' ' + esc(s.name) + (info ? ' <small>· ' + esc(info) + '</small>' : '') + '</button>';
        }).join('');
        var total = salons.reduce(function (n, s) { return n + (s.presents || 0); }, 0);
        $('apcEnLigne').innerHTML = total > 0 ? '<span class="apc-pt" aria-hidden="true"></span>' + total + ' en ligne' : '';
    }

    function ligne(m, nouveau) {
        return '<div class="apc-msg' + (m.animateur ? ' anim' : '') + (nouveau ? ' nouveau' : '') + '" data-id="' + Number(m.id) + '"><b>' + (m.animateur ? '🤖 ' : '') + esc(m.auteur) + '</b>' +
            '<time>' + esc(heure(m.date)) + '</time><p>' + esc(m.texte) + '</p></div>';
    }

    // Dessin du fil : complet au changement de salon, puis seulement les nouveaux messages
    // (pas de clignotement, la lecture en cours n'est pas arrachée)
    function afficherSalon() {
        var s = salonChoisi();
        if (!s) return;
        $('apcNom').textContent = s.icon + ' ' + s.name;
        var info = presents(s);
        $('apcPresents').innerHTML = info ? '<span class="apc-pt" aria-hidden="true"></span>' + esc(info) + ' en ce moment' : '';
        $('apcInput').placeholder = enAttenteDeConfirmation ? 'Confirmez votre e-mail pour écrire…' : 'Écrire dans ' + s.name + '…';
        var enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60;
        if (affiche.slug !== s.slug) {
            affiche = { slug: s.slug, ids: new Set(s.messages.map(function (m) { return m.id; })) };
            fil.innerHTML = s.messages.length ? s.messages.map(function (m) { return ligne(m, false); }).join('')
                : '<p class="apc-vide">Ce salon est calme en ce moment.<br>Lancez la conversation : les membres connectés vous verront arriver.</p>';
            fil.scrollTop = fil.scrollHeight;
            return;
        }
        var neufs = s.messages.filter(function (m) { return !affiche.ids.has(m.id); });
        if (!neufs.length) return;
        var vide = fil.querySelector('.apc-vide'); if (vide) vide.remove();
        fil.insertAdjacentHTML('beforeend', neufs.map(function (m) { affiche.ids.add(m.id); return ligne(m, true); }).join(''));
        while (fil.children.length > MAX_LIGNES) fil.removeChild(fil.firstChild);
        if (enBas) fil.scrollTop = fil.scrollHeight;
    }

    // Le fil change de hauteur après coup (barre du bas ajoutée sur mobile, rotation, clavier) :
    // s'il était calé en bas, il y reste
    var colle = true;
    fil.addEventListener('scroll', function () { colle = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60; }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(function () { if (colle) fil.scrollTop = fil.scrollHeight; }).observe(fil);

    function planifier(ms) { clearTimeout(minuteur); minuteur = setTimeout(charger, ms); }

    function charger(premiere) {
        if (document.visibilityState === 'hidden' && !premiere) return;   // relancé au retour sur l'onglet
        return fetch(api + '/salons/apercu' + (demande ? '?salon=' + encodeURIComponent(demande) : ''), { credentials: 'omit' })
            .then(function (r) {
                if (r.status === 429) { var e = new Error('limite'); e.limite = true; throw e; }
                return r.ok ? r.json() : Promise.reject(new Error('http'));
            })
            .then(function (d) {
                salons = (d && d.salons) || [];
                if (!salons.length) throw new Error('vide');
                if (!choisi) choisi = salons.some(function (s) { return s.slug === demande; }) ? demande : null;
                if (!choisi || !salonChoisi()) choisi = salonParDefaut();
                afficherOnglets();
                afficherSalon();
                planifier(PERIODE);
            })
            .catch(function (e) {
                planifier(e && e.limite ? PERIODE_RALENTIE : PERIODE * 2);   // trop de requêtes : on ralentit
                if (!premiere || salons.length) return;   // une mise à jour ratée : on garde l'affichage actuel
                $('apcNom').textContent = 'Aperçu indisponible';
                fil.innerHTML = '<p class="apc-vide">Impossible d’afficher les salons pour le moment.<br>Nouvel essai dans quelques secondes…</p>';
            });
    }

    onglets.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-slug]');
        if (!b) return;
        choisi = b.dataset.slug;
        try { sessionStorage.setItem('evc-apercu-salon', choisi); } catch (er) {}
        afficherOnglets();
        afficherSalon();
    });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') charger(false); });

    // ============================================================
    // BROUILLON : le message tapé suit le visiteur jusque dans le salon
    // ============================================================
    var vers = function () { return 'chat.html?theme=' + encodeURIComponent(choisi || 'general'); };
    function garderBrouillon() {
        var texte = ($('apcBrouillon').value || $('apcInput').value || '').trim().slice(0, 500);
        try {
            if (texte) sessionStorage.setItem('evc-brouillon', JSON.stringify({ salon: choisi, texte: texte, t: Date.now() }));
            else sessionStorage.removeItem('evc-brouillon');
        } catch (e) {}
    }

    // ============================================================
    // FICHE D'INSCRIPTION RAPIDE
    // ============================================================
    var fiche = $('apcFiche'), voile = $('apcVoile'), saisie = $('apcInput');
    var MOTIFS = {
        ecrire: ['Écrivez dans le salon', 'Choisissez votre pseudo : 30 secondes, et vous restez dans '],
        cam: ['Activez votre webcam', 'La webcam est réservée aux membres (et reste toujours facultative). Créez votre compte, vous restez dans '],
        reaction: ['Réagissez en direct', 'Les réactions sont réservées aux membres. Créez votre compte en 30 secondes, vous restez dans '],
        prive: ['Envoyez un message privé', 'Les messages privés sont réservés aux membres : chacun sait à qui il parle. Créez votre compte, vous restez dans ']
    };
    // Date de naissance : au plus tard il y a 18 ans
    (function () {
        var d = new Date(); d.setFullYear(d.getFullYear() - 18);
        var iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        $('apcNaissance').max = iso; $('apcNaissance').min = '1900-01-01';
    })();

    function ouvrirFiche(motif) {
        var s = salonChoisi();
        // Déjà membre (connecté sur ce navigateur) : on entre directement dans le salon
        if (typeof isLoggedIn === 'function' && isLoggedIn()) { garderBrouillon(); location.href = vers(); return; }
        var m = MOTIFS[motif] || MOTIFS.ecrire;
        $('apcFicheTitre').textContent = s && motif === 'ecrire' ? 'Écrivez dans ' + s.name : m[0];
        $('apcFicheSous').innerHTML = esc(m[1]) + '<strong>' + esc(s ? s.icon + ' ' + s.name : 'ce salon') + '</strong>.';
        if (!$('apcBrouillon').value && saisie.value) $('apcBrouillon').value = saisie.value;
        $('apcErreur').hidden = true;   // pas d'erreur d'une tentative précédente
        var cible = enAttenteDeConfirmation ? 'apcVerifOk' : (motif === 'ecrire' && !$('apcBrouillon').value ? 'apcBrouillon' : 'apcPseudo');
        $('apcConnexion').href = 'login.html?redirect=' + encodeURIComponent(vers());
        $('apcVerifConnexion').href = $('apcConnexion').href;
        voile.hidden = false; fiche.hidden = false;
        document.documentElement.style.overflow = 'hidden';
        $(cible).focus({ preventScroll: true });
    }
    function fermerFiche() {
        if (fiche.hidden) return;
        garderBrouillon();
        if ($('apcBrouillon').value) saisie.value = $('apcBrouillon').value;
        voile.hidden = true; fiche.hidden = true;
        document.documentElement.style.overflow = '';
        $('apcEnvoyer').focus({ preventScroll: true });   // pas la zone de saisie : elle rouvrirait la fiche
    }

    // Barre de saisie : toucher le champ, Envoyer ou une action → la fiche
    saisie.addEventListener('focus', function () { ouvrirFiche('ecrire'); });
    $('apcSaisie').addEventListener('submit', function (e) { e.preventDefault(); ouvrirFiche('ecrire'); });
    $('apcSaisie').addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-action]');
        if (b) ouvrirFiche(b.dataset.action);
    });
    $('apcFermer').addEventListener('click', fermerFiche);
    $('apcVerifOk').addEventListener('click', fermerFiche);
    voile.addEventListener('click', fermerFiche);
    $('apcConnexion').addEventListener('click', garderBrouillon);
    $('apcVerifConnexion').addEventListener('click', garderBrouillon);
    $('apcBrouillon').addEventListener('input', garderBrouillon);
    document.addEventListener('keydown', function (e) {
        if (fiche.hidden) return;
        if (e.key === 'Escape') { fermerFiche(); return; }
        if (e.key !== 'Tab') return;
        // Le focus reste dans la fiche
        var f = Array.prototype.filter.call(fiche.querySelectorAll('button, input, a[href]'), function (el) { return el.offsetParent !== null && !el.disabled; });
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });

    $('apcVoirMdp').addEventListener('click', function () {
        var c = $('apcMdp'), voir = c.type === 'password';
        c.type = voir ? 'text' : 'password';
        this.setAttribute('aria-pressed', String(voir));
        this.setAttribute('aria-label', voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
        this.querySelector('i').className = voir ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    function erreur(msg) {
        var box = $('apcErreur');
        box.textContent = msg; box.hidden = false;
        // Le champ concerné reprend la main
        var champ = /pseudo|utilisateur/i.test(msg) ? 'apcPseudo' : /mail/i.test(msg) ? 'apcEmail' : /mot de passe/i.test(msg) ? 'apcMdp'
            : /naissance|18 ans/i.test(msg) ? 'apcNaissance' : /CGU/.test(msg) ? 'apcCgu' : null;
        if (champ) $(champ).focus({ preventScroll: true });
        try { box.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }

    var btn = $('apcCreer');
    $('apcForm').addEventListener('submit', function (e) {
        e.preventDefault();
        if (btn.disabled) return;
        $('apcErreur').hidden = true;
        var c = {
            username: $('apcPseudo').value.trim(),
            email: $('apcEmail').value.trim(),
            birthdate: $('apcNaissance').value,
            password: $('apcMdp').value
        };
        var msg = EvcInscription.verifier(c) || (!$('apcCgu').checked ? 'Veuillez accepter les CGU et la politique de confidentialité' : '');
        if (msg) { erreur(msg); return; }
        btn.disabled = true; $('apcCreerTexte').textContent = 'Création…';
        garderBrouillon();
        register(c.username, c.email, c.password, EvcInscription.parrainDeLaVisite(), '', c.birthdate).then(function (user) {
            if (user && user.needVerification) {
                // ✉️ Pas encore de session : on reste dans la vue en lecture seule
                enAttenteDeConfirmation = { email: user.email, username: c.username };
                $('apcForm').hidden = true; $('apcVerif').hidden = false;
                $('apcFicheTitre').textContent = 'Vérifiez votre e-mail';
                $('apcFicheSous').textContent = 'Dernière étape avant d’écrire dans le salon.';
                $('apcVerifEmail').textContent = user.email || 'votre adresse';
                var note = $('apcVerifNote');
                note.textContent = '✉️ Confirmez votre adresse e-mail (lien envoyé à ' + (user.email || 'votre adresse') + ') pour écrire dans le salon.';
                note.hidden = false;
                afficherSalon();
                $('apcVerifOk').focus({ preventScroll: true });
                return;
            }
            // ✅ Connecté : même salon, message prêt dans la zone de saisie, accueil léger dans le salon
            try { sessionStorage.setItem('evc-accueil', choisi || 'general'); } catch (er) {}
            location.href = vers();
        }).catch(function (err) {
            erreur((err && err.message) || 'Inscription impossible pour le moment');
        }).then(function () {
            btn.disabled = false; $('apcCreerTexte').textContent = 'Créer mon compte et écrire';
        });
    });

    $('apcRenvoi').addEventListener('click', function () {
        var b = this, m = $('apcVerifMsg');
        if (!enAttenteDeConfirmation) return;
        b.disabled = true; m.textContent = 'Envoi…';
        renvoyerConfirmation(enAttenteDeConfirmation.username)
            .then(function (r) { m.textContent = r.message; })
            .catch(function (er) { m.textContent = er.message; })
            .then(function () { setTimeout(function () { b.disabled = false; }, 5000); });
    });

    charger(true);
})();
