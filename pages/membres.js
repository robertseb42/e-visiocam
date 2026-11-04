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
    var filtres = { cherche: ['couples', 'femmes', 'hommes', 'trans'], correspond: false, ou: '50', photo: false, enligne: false, interet: '', tri: 'recents', q: '' };
    var page = 1, attente = null, demande = 0, maVille = null;
    var RAYONS = ['10', '25', '50', '100', '200'];

    // Choix gardés pour la prochaine visite (pratique seulement)
    try { var g = JSON.parse(localStorage.getItem('evcMembresFiltres') || 'null'); if (g && Array.isArray(g.cherche)) filtres = Object.assign(filtres, g, { q: '' }); } catch (e) {}
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
        presse('mbrCherche', 'cherche', true); presse('mbrTri', 'tri');
        $('mbrOu').value = filtres.ou;
        $('mbrCorrespond').checked = filtres.correspond; $('mbrPhoto').checked = filtres.photo; $('mbrEnLigne').checked = filtres.enligne;
        $('mbrInteret').value = filtres.interet;
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
            (m.online ? '<span class="mbr-enligne" title="En ligne"></span>' : '') + (m.correspond ? '<span class="mbr-match">Vous recherche</span>' : '') + (m.distance ? '<span class="mbr-km">' + (m.distance <= 5 ? '− de 5 km' : '≈ ' + m.distance + ' km') + '</span>' : '') + '</span>' +
            '<span class="mbr-corps"><b>' + esc(m.username) + '</b><span>' + esc(libelle(m)) + '</span>' +
            '<small>' + [(m.ages || []).length ? m.ages.join('/') + ' ans' : '', m.ville ? esc(m.ville) + (m.departement ? ' (' + esc(m.departement) + ')' : '') : (m.departement ? esc(m.departement) + (dep ? ' · ' + esc(dep) : '') : '')].filter(Boolean).join(' · ') + '</small>' +
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
        if (filtres.photo) p.set('photo', '1');
        if (filtres.enligne) p.set('enligne', '1');
        if (filtres.interet) p.set('interet', filtres.interet);
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
    [['mbrTri', 'tri']].forEach(function (z) {
        $(z[0]).addEventListener('click', function (e) { var b = e.target.closest('button'); if (!b) return; filtres[z[1]] = b.getAttribute('data-v'); changer(); });
    });
    [['mbrCorrespond', 'correspond'], ['mbrPhoto', 'photo'], ['mbrEnLigne', 'enligne']].forEach(function (c) {
        $(c[0]).addEventListener('change', function () { filtres[c[1]] = this.checked; changer(); });
    });
    $('mbrInteret').addEventListener('change', function () { filtres.interet = this.value; changer(); });
    $('mbrQ').addEventListener('input', function () { var v = this.value.trim(); clearTimeout(attente); attente = setTimeout(function () { filtres.q = v; charger(false); }, 300); });
    $('mbrPlus').addEventListener('click', function () { page++; charger(true); });

    fetch(API_URL + '/models/profil-options').then(function (r) { return r.json(); }).then(function (d) {
        OPT = d;
        $('mbrInteret').insertAdjacentHTML('beforeend', Object.keys(d.interets).map(function (k) { return '<option value="' + k + '">' + esc(d.interets[k]) + '</option>'; }).join(''));
        majControles(); charger(false);
    }).catch(function () { majControles(); charger(false); });
})();
