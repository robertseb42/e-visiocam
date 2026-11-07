// ============================================================
// E-VISIOCAM — Page Membres : annuaire avec recherche (membres connectés)
//   Vous cherchez (couples, femmes, hommes, trans) · Qui me recherchent aussi · Où (rayon autour de ma ville, département, région, partout)
//   Avec photo · En ligne · Intérêt · Pseudo · Tri (nouveaux, connectés) · « Voir plus » par pages de 48
//   Clic sur une carte : mini-fiche (membres-social.js, data-fiche). Sans photo : masque vénitien.
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var liste = $('mbrListe');
    if (!liste || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var moi = (typeof getCurrentUser === 'function' && getCurrentUser()) || null;
    var OPT = { tendances: {}, interets: {} };
    var GENRES = { couple: 'Couple', femme: 'Femme', homme: 'Homme', trans: 'Trans', autre: 'Membre', '': 'Membre' };
    var COUPLES = { hf: 'Couple', ff: 'Couple de femmes', hh: 'Couple d\'hommes' };
    var filtres = { cherche: ['couples', 'femmes', 'hommes', 'trans'], correspond: false, ou: '50', photo: false, certifie: false, enligne: false, interet: '', objectif: '', tri: 'recents', q: '', dispo: '' };
    var page = 1, attente = null, demande = 0, maVille = null;
    var RAYONS = ['10', '25', '50', '100', '200'];

    // Choix gardés pour la prochaine visite (pratique seulement)
    try { var g = JSON.parse(localStorage.getItem('evcMembresFiltres') || 'null'); if (g && Array.isArray(g.cherche)) filtres = Object.assign(filtres, g, { q: '' }); } catch (e) {}
    // Recherche du site (pseudo) : membres.html?q=pseudo
    var qUrl = (new URLSearchParams(location.search).get('q') || '').trim().slice(0, 30);
    if (qUrl) { filtres.q = qUrl; filtres.ou = 'partout'; }
    // Lien « Membres en ligne » du menu : membres.html?enligne=1
    if (new URLSearchParams(location.search).get('enligne') === '1') { filtres.enligne = true; filtres.tri = 'connectes'; }
    function memoriser() { try { localStorage.setItem('evcMembresFiltres', JSON.stringify(filtres)); } catch (e) {} }

    if (!moi) {
        document.querySelector('.mbr-filtres').hidden = true;
        $('mbrResume').textContent = 'Couples, femmes, hommes et trans de toute la France.';
        liste.innerHTML = '<div class="mbr-vide mbr-invite"><div class="mbr-mosaique">' + ['couple', 'femme', 'homme', 'couple', 'femme', 'trans'].map(function (x, i) { return '<span>' + (typeof evcMasque === 'function' ? evcMasque(x, 'invite' + i) : '') + '</span>'; }).join('') + '</div>' +
            '<h2>L\'annuaire est réservé aux membres</h2><p>Inscrivez-vous gratuitement pour voir les profils, chercher près de chez vous et écrire aux membres. Pseudo, masque ou photo : vous choisissez ce que vous montrez.</p>' +
            '<div class="mbr-actions"><a class="mbr-btn" href="register.html">Créer mon compte gratuit</a><a class="mbr-btn mbr-btn-2" href="login.html?redirect=membres.html">Se connecter</a></div></div>';
        return;
    }

    function presse(zone, cle, multiple) {
        $(zone).querySelectorAll('button').forEach(function (b) {
            var v = b.getAttribute('data-v');
            b.setAttribute('aria-pressed', String(multiple ? filtres[cle].indexOf(v) >= 0 : filtres[cle] === v));
        });
    }
    function majControles() {
        presse('mbrCherche', 'cherche', true); presse('mbrTri', 'tri'); presse('mbrDispo', 'dispo');
        $('mbrOu').value = filtres.ou;
        $('mbrCorrespond').checked = filtres.correspond; $('mbrPhoto').checked = filtres.photo; $('mbrCertifie').checked = !!filtres.certifie; $('mbrEnLigne').checked = filtres.enligne;
        $('mbrInteret').value = filtres.interet;
        if ($('mbrObjectif')) $('mbrObjectif').value = filtres.objectif || '';
        if ($('mbrQ') && filtres.q && !$('mbrQ').value) $('mbrQ').value = filtres.q;
        var dep = moi && moi.departement, rayon = RAYONS.indexOf(filtres.ou) >= 0;
        // Message « indiquez votre ville » : rayon sans ville connue, ou département/région sans département
        $('mbrOuNote').hidden = filtres.ou === 'partout' || (rayon ? maVille !== false : !!dep);
        $('mbrCorrespond').closest('label').title = moi && moi.gender ? '' : 'Choisissez « Je suis » dans Mon compte pour utiliser ce filtre';
    }
    function libelle(m) {
        var t = m.genre === 'couple' ? (COUPLES[m.couple] || 'Couple') : (GENRES[m.genre] || 'Membre');
        var tend = (m.tendances || []).map(function (k) { return (OPT.tendances[k] || '').toLowerCase(); }).filter(Boolean);
        if (tend.length) t += ' · ' + Array.from(new Set(tend)).join(' / ');
        return t;
    }
    function carte(m) {
        var photo = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        var dep = m.departement ? ((window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[m.departement]) || '') : '';
        return '<button type="button" class="mbr-carte" data-fiche="' + Number(m.id) + '" title="Voir le profil de ' + esc(m.username) + '">' +
            '<span class="mbr-visuel">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : (typeof evcMasque === 'function' ? evcMasque(m.genre, m.id) : '')) +
            (m.online ? '<span class="mbr-enligne" title="En ligne"></span>' : '') + (m.correspond ? '<span class="mbr-match">Vous recherche</span>' : '') + (m.dispo ? '<span class="mbr-dispo">' + (m.dispo.type === 'soir' ? '🌙 Libre ce soir' : '📅 Libre ce week-end') + '</span>' : '') +
            (m.distance ? '<span class="mbr-km">' + (m.distance <= 5 ? '− de 5 km' : '≈ ' + m.distance + ' km') + '</span>' : '') + '</span>' +
            '<span class="mbr-corps"><b>' + esc(m.username) + (m.certifie ? ' <i class="mbr-certif" title="Profil certifié par l’équipe" aria-label="Profil certifié">✔</i>' : '') + (m.niveau ? ' <i class="mbr-niv" title="Niveau ' + m.niveau.n + ' sur 8 : ' + esc(m.niveau.nom) + '">Niv. ' + m.niveau.n + '</i>' : '') + '</b><span>' + esc(libelle(m)) + '</span>' +
            '<small>' + [(m.ages || []).length ? m.ages.join('/') + ' ans' : '', m.ville ? esc(m.ville) + (m.departement ? ' (' + esc(m.departement) + ')' : '') : (m.departement ? esc(m.departement) + (dep ? ' · ' + esc(dep) : '') : '')].filter(Boolean).join(' · ') + '</small>' +
            (m.voyage ? '<small class="mbr-voyage">✈️ À ' + esc(m.voyage.ville) + ' du ' + new Date(m.voyage.du + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' au ' + new Date(m.voyage.au + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + '</small>' : '') +
            ((m.interets || []).length ? '<span class="mbr-tags">' + m.interets.slice(0, 3).map(function (k) { return '<i>' + esc(OPT.interets[k] || k) + '</i>'; }).join('') + '</span>' : '') +
            '</span></button>';
    }
    function url() {
        var p = new URLSearchParams();
        if (filtres.cherche.length && filtres.cherche.length < 4) p.set('cherche', filtres.cherche.join(','));
        if (filtres.correspond) p.set('correspond', '1');
        var dep = moi && moi.departement;
        if (RAYONS.indexOf(filtres.ou) >= 0) p.set('rayon', filtres.ou);
        if (dep && filtres.ou === 'dep') p.set('dep', dep);
        if (dep && filtres.ou === 'region' && window.evcRegionDe) { var r = window.evcRegionDe(dep); if (r) p.set('region', r.slug); }
        if (filtres.dispo) p.set('dispo', filtres.dispo);
        if (filtres.photo) p.set('photo', '1');
        if (filtres.certifie) p.set('certifie', '1');
        if (filtres.enligne) p.set('enligne', '1');
        if (filtres.interet) p.set('interet', filtres.interet);
        if (filtres.objectif) p.set('objectif', filtres.objectif);
        if (filtres.q) p.set('q', filtres.q);
        p.set('tri', filtres.tri); p.set('page', page);
        return API_URL + '/models/annuaire?' + p.toString();
    }
    function charger(ajouter) {
        if (!filtres.cherche.length) { liste.innerHTML = '<p class="mbr-vide">Choisissez au moins un profil dans « Vous cherchez ».</p>'; $('mbrPlus').hidden = true; $('mbrResume').textContent = ''; return; }
        var n = ++demande;
        if (!ajouter) { page = 1; liste.setAttribute('aria-busy', 'true'); }
        fetch(url(), { credentials: 'include' }).then(function (r) {
            if (r.status === 401) { location.href = 'login.html?redirect=membres.html'; return null; }
            return r.json();
        }).then(function (d) {
            if (!d || n !== demande) return;
            var html = d.membres.map(carte).join('');
            if (ajouter) liste.insertAdjacentHTML('beforeend', html);
            else liste.innerHTML = html || '<p class="mbr-vide">Aucun membre ne correspond à ces critères pour le moment. Élargissez la recherche (« Partout », moins de filtres).</p>';
            if (maVille !== !!d.maVille) { maVille = !!d.maVille; majControles(); }
            $('mbrResume').textContent = d.total + ' membre' + (d.total > 1 ? 's' : '') + ' trouvé' + (d.total > 1 ? 's' : '');
            $('mbrPlus').hidden = d.page >= d.pages;
            liste.removeAttribute('aria-busy');
        }).catch(function () { liste.innerHTML = '<p class="mbr-vide">La recherche est indisponible pour le moment. Réessayez dans un instant.</p>'; });
    }
    function changer() { memoriser(); majControles(); charger(false); }

    $('mbrCherche').addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        var v = b.getAttribute('data-v'), i = filtres.cherche.indexOf(v);
        if (i >= 0) filtres.cherche.splice(i, 1); else filtres.cherche.push(v);
        changer();
    });
    $('mbrOu').addEventListener('change', function () { filtres.ou = this.value; changer(); });
    [['mbrTri', 'tri'], ['mbrDispo', 'dispo']].forEach(function (z) {
        $(z[0]).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtres[z[1]] = b.getAttribute('data-v'); changer(); });
    });
    [['mbrCorrespond', 'correspond'], ['mbrPhoto', 'photo'], ['mbrCertifie', 'certifie'], ['mbrEnLigne', 'enligne']].forEach(function (c) {
        $(c[0]).addEventListener('change', function () { filtres[c[1]] = this.checked; changer(); });
    });
    $('mbrInteret').addEventListener('change', function () { filtres.interet = this.value; changer(); });
    if ($('mbrObjectif')) $('mbrObjectif').addEventListener('change', function () { filtres.objectif = this.value; changer(); });
    $('mbrQ').addEventListener('input', function () { var v = this.value.trim(); clearTimeout(attente); attente = setTimeout(function () { filtres.q = v; charger(false); }, 300); });
    $('mbrPlus').addEventListener('click', function () { page++; charger(true); });

    // ---------- Ma disponibilité : « Libre ce soir / ce week-end » ----------
    var maDispo = null;
    function heureFin(iso) {
        var d = new Date(iso); if (isNaN(d)) return '';
        var jours = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        var demain = new Date(); demain.setDate(demain.getDate() + 1);
        var jour = d.toDateString() === new Date().toDateString() ? 'aujourd’hui' : d.toDateString() === demain.toDateString() ? 'demain' : jours[d.getDay()];
        return jour + ' ' + d.getHours() + ' h';
    }
    function majDispo() {
        var bloc = $('mbrLibre'), type = maDispo ? maDispo.type : '';
        bloc.hidden = false;
        bloc.classList.toggle('est-libre', !!maDispo);
        $('mbrMaDispo').querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === type)); });
        $('mbrEnvie').value = maDispo ? (maDispo.envie || '') : $('mbrEnvie').value;
        $('mbrLibreEtat').textContent = maDispo
            ? (type === 'soir' ? 'Vous êtes affiché libre ce soir' : 'Vous êtes affiché libre ce week-end') + ', jusqu’à ' + heureFin(maDispo.fin) + '. Le badge s’effacera tout seul.'
            : 'Signalez-le : votre carte affichera un badge et vous apparaîtrez dans « Disponibles ».';
    }
    function envoyerDispo(type) {
        fetch(API_URL + '/models/ma-dispo', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, envie: $('mbrEnvie').value }) })
            .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
            .then(function (d) {
                maDispo = d.dispo; majDispo();
                if (typeof showToast === 'function') showToast(maDispo ? 'C’est noté, vous êtes affiché disponible' : 'Vous n’êtes plus affiché disponible', 'success');
            })
            .catch(function () { if (typeof showToast === 'function') showToast('Impossible d’enregistrer pour le moment', 'error'); });
    }
    $('mbrMaDispo').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) envoyerDispo(b.getAttribute('data-v')); });
    $('mbrEnvie').addEventListener('change', function () { if (maDispo) envoyerDispo(maDispo.type); });
    fetch(API_URL + '/users/me', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        if (!d || !d.user) return;
        maDispo = d.user.dispo || null; majDispo();
    }).catch(function () {});

    fetch(API_URL + '/models/profil-options').then(function (r) { return r.json(); }).then(function (d) {
        OPT = d;
        $('mbrEnvie').insertAdjacentHTML('beforeend', Object.keys(d.envies || {}).map(function (k) { return '<option value="' + k + '">' + esc(d.envies[k]) + '</option>'; }).join(''));
        if (maDispo) $('mbrEnvie').value = maDispo.envie || '';
        if ($('mbrObjectif')) $('mbrObjectif').insertAdjacentHTML('beforeend', Object.keys(d.objectifs || {}).map(function (k) { return '<option value="' + k + '">' + esc(d.objectifs[k]) + '</option>'; }).join(''));
        $('mbrInteret').insertAdjacentHTML('beforeend', Object.keys(d.interets).map(function (k) { return '<option value="' + k + '">' + esc(d.interets[k]) + '</option>'; }).join(''));
        majControles(); charger(false);
    }).catch(function () { majControles(); charger(false); });
})();
