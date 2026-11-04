// ============================================================
// E-VISIOCAM — Découverte : un profil à la fois (« Ça me plaît » / « Suivant »), clavier ← →
//   Réciproque : écran « C'est réciproque ! » et liste à droite pour écrire.
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var scene = $('decScene');
    if (!scene || typeof API_URL === 'undefined') return;
    var moi = typeof getCurrentUser === 'function' && getCurrentUser();
    if (!moi) { location.href = 'login.html?redirect=decouverte.html'; return; }
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var OPT = { tendances: {}, interets: {}, recherche: {}, envies: {} }, actuel = null, occupe = false;
    var GENRES = { couple: 'Couple', femme: 'Femme', homme: 'Homme', trans: 'Trans' };
    try { var r0 = localStorage.getItem('evcDecRayon'); if (r0 !== null) $('decRayon').value = r0; } catch (e) {}
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    async function api(chemin, opts) {
        var r = await fetch(API_URL + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = {}; try { d = await r.json(); } catch (e) {}
        if (r.status === 401) { location.href = 'login.html?redirect=decouverte.html'; throw new Error(''); }
        if (!r.ok) throw new Error(d.error || 'Erreur, réessayez dans un instant.');
        return d;
    }
    function carte(m) {
        var photo = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        var lieu = m.ville ? m.ville + (m.departement ? ' (' + m.departement + ')' : '') : (m.departement ? m.departement + ' · ' + ((window.EVC_DEPARTEMENTS || {})[m.departement] || '') : '');
        var tend = (m.tendances || []).map(function (k) { return (OPT.tendances[k] || '').toLowerCase(); }).filter(Boolean);
        return '<article class="dec-carte">' +
            '<div class="dec-visuel">' + (photo ? '<img src="' + esc(photo) + '" alt="">' : (typeof evcMasque === 'function' ? evcMasque(m.genre, m.id) : '')) +
                (m.online ? '<span class="mbr-enligne" title="En ligne"></span>' : '') + (m.correspond ? '<span class="mbr-match">Vous recherche</span>' : '') +
                (m.dispo ? '<span class="mbr-dispo">' + (m.dispo.type === 'soir' ? '🌙 Libre ce soir' : '📅 Libre ce week-end') + '</span>' : '') + '</div>' +
            '<div class="dec-corps"><h2>' + esc(m.username) + (m.certifie ? ' <i class="mbr-certif" title="Profil certifié">✔</i>' : '') + (m.niveau ? ' <i class="mbr-niv">Niv. ' + m.niveau.n + '</i>' : '') + '</h2>' +
                '<p class="dec-qui">' + esc(GENRES[m.genre] || 'Membre') + (tend.length ? ' · ' + esc(Array.from(new Set(tend)).join(' / ')) : '') + ((m.ages || []).length ? ' · ' + m.ages.join('/') + ' ans' : '') + '</p>' +
                (lieu || m.distance ? '<p class="dec-lieu">📍 ' + esc(lieu) + (m.distance ? ' · ' + (m.distance <= 5 ? 'moins de 5 km' : '≈ ' + m.distance + ' km') : '') + '</p>' : '') +
                ((m.recherche || []).length ? '<p class="dec-lieu">Recherche : ' + esc(m.recherche.map(function (k) { return OPT.recherche[k] || k; }).join(', ')) + '</p>' : '') +
                (m.annonce ? '<p class="dec-annonce">' + esc(m.annonce) + '</p>' : '') +
                ((m.interets || []).length ? '<div class="mbr-tags">' + m.interets.map(function (k) { return '<i>' + esc(OPT.interets[k] || k) + '</i>'; }).join('') + '</div>' : '') +
            '</div>' +
            '<div class="dec-actions"><button type="button" class="dec-non" data-dec="non" title="Suivant (flèche gauche)" aria-label="Suivant">✕</button>' +
                '<button type="button" class="dec-profil" data-fiche="' + Number(m.id) + '">Voir le profil</button>' +
                '<button type="button" class="dec-oui" data-dec="oui" title="Ça me plaît (flèche droite)" aria-label="Ça me plaît">❤</button></div>' +
            '</article>';
    }
    async function suivant() {
        scene.innerHTML = '<p class="mbr-vide">Chargement…</p>';
        try {
            var d = await api('/models/decouverte?rayon=' + encodeURIComponent($('decRayon').value));
            actuel = d.membre;
            if (!actuel) {
                scene.innerHTML = '<div class="mbr-vide"><p><b>Vous avez vu tous les profils' + ($('decRayon').value !== '0' ? ' à cette distance' : '') + '.</b></p>' +
                    '<p>Élargissez la distance, ou revoyez les profils passés.</p><div class="mbr-actions"><button type="button" class="mbr-btn" data-dec-recommencer>Revoir les profils passés</button><a class="mbr-btn mbr-btn-2" href="membres.html">Chercher dans les membres</a></div></div>';
                return;
            }
            scene.innerHTML = carte(actuel);
            $('decResume').textContent = d.restants + ' profil' + (d.restants > 1 ? 's' : '') + ' à découvrir' + ($('decRayon').value !== '0' ? ' autour de vous' : '') + '.';
        } catch (e) { scene.innerHTML = '<p class="mbr-vide">' + esc(e.message) + '</p>'; }
    }
    async function choisir(choix) {
        if (!actuel || occupe) return;
        occupe = true;
        var m = actuel, c = scene.querySelector('.dec-carte');
        if (c) c.classList.add(choix === 'oui' ? 'part-droite' : 'part-gauche');
        try {
            var r = await api('/models/decouverte/' + Number(m.id), { method: 'POST', body: JSON.stringify({ choix: choix }) });
            if (r.reciproque) { reciproque(m); chargerReciproques(); }
        } catch (e) { toast(e.message, 'error'); }
        setTimeout(function () { occupe = false; suivant(); }, 260);
    }
    function reciproque(m) {
        var f = document.createElement('div'); f.className = 'dec-bravo';
        f.innerHTML = '<div><p class="dec-bravo-titre">💞 C’est réciproque !</p><p>Vous et <b>' + esc(m.username) + '</b> vous plaisez mutuellement.</p>' +
            '<div class="mbr-actions"><a class="mbr-btn" href="messages.html?ecrire=' + Number(m.id) + '">Lui écrire</a><button type="button" class="mbr-btn mbr-btn-2" data-fermer-bravo>Continuer</button></div></div>';
        document.body.appendChild(f);
        f.addEventListener('click', function (e) { if (e.target === f || e.target.closest('[data-fermer-bravo]')) f.remove(); });
    }
    async function chargerReciproques() {
        try {
            var d = await api('/models/decouverte/reciproques');
            $('decReciproques').innerHTML = d.membres.length ? d.membres.map(function (m) {
                return '<div class="dec-rec"><button type="button" data-fiche="' + Number(m.id) + '">' + (m.online ? '🟢 ' : '') + esc(m.username) + '</button><a href="messages.html?ecrire=' + Number(m.id) + '">Écrire</a></div>';
            }).join('') : '<p class="mbr-note">Personne pour le moment. Continuez à découvrir !</p>';
        } catch (e) {}
    }
    scene.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-dec]'); if (b) { choisir(b.getAttribute('data-dec')); return; }
        if (e.target.closest('[data-dec-recommencer]')) { try { await api('/models/decouverte/recommencer', { method: 'POST', body: '{}' }); } catch (x) {} suivant(); }
    });
    document.addEventListener('keydown', function (e) {
        if (/input|textarea|select/i.test((e.target && e.target.tagName) || '') || document.querySelector('.dec-bravo')) return;
        if (e.key === 'ArrowRight') choisir('oui'); else if (e.key === 'ArrowLeft') choisir('non');
    });
    $('decRayon').addEventListener('change', function () { try { localStorage.setItem('evcDecRayon', this.value); } catch (e) {} suivant(); });
    fetch(API_URL + '/models/profil-options').then(function (r) { return r.json(); }).then(function (d) { OPT = d; }).catch(function () {}).then(function () { suivant(); chargerReciproques(); });
})();
