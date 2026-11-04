// ============================================================
// E-VISIOCAM — « Qui a vu mon profil » (visiteurs des 30 derniers jours)
//   Clic sur une carte : mini-fiche (membres-social.js, data-fiche). Sans photo : masque vénitien.
//   « Visite discrète » : mes visites ne sont plus notées, et je ne vois plus mes visiteurs.
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var liste = $('visListe');
    if (!liste || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var GENRES = { couple: 'Couple', femme: 'Femme', homme: 'Homme', trans: 'Trans' };
    var moi = typeof getCurrentUser === 'function' && getCurrentUser();
    if (!moi) { location.href = 'login.html?redirect=visiteurs.html'; return; }

    function ilYa(v) {
        var d = new Date(String(v).replace(' ', 'T') + 'Z'), s = (Date.now() - d) / 1000;
        if (isNaN(s)) return '';
        if (s < 3600) return 'il y a ' + Math.max(1, Math.round(s / 60)) + ' min';
        if (s < 86400) return 'il y a ' + Math.round(s / 3600) + ' h';
        var j = Math.round(s / 86400); return j === 1 ? 'hier' : 'il y a ' + j + ' jours';
    }
    function carte(m) {
        var photo = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        var dep = m.departement ? ((window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[m.departement]) || '') : '';
        return '<button type="button" class="mbr-carte" data-fiche="' + Number(m.id) + '" title="Voir le profil de ' + esc(m.username) + '">' +
            '<span class="mbr-visuel">' + (photo ? '<img src="' + esc(photo) + '" alt="" loading="lazy">' : (typeof evcMasque === 'function' ? evcMasque(m.genre, m.id) : '')) +
            (m.online ? '<span class="mbr-enligne" title="En ligne"></span>' : '') + (m.nouveau ? '<span class="mbr-dispo">Nouveau</span>' : '') + '</span>' +
            '<span class="mbr-corps"><b>' + esc(m.username) + (m.certifie ? ' <i class="mbr-certif" title="Profil certifié" aria-label="Profil certifié">✔</i>' : '') + '</b>' +
            '<span>' + esc(GENRES[m.genre] || 'Membre') + (m.departement ? ' · ' + esc(m.departement) + (dep ? ' ' + esc(dep) : '') : '') + '</span>' +
            '<small>👁 ' + esc(ilYa(m.vuLe)) + '</small></span></button>';
    }
    async function charger() {
        try {
            var r = await fetch(API_URL + '/models/visiteurs', { credentials: 'include' });
            if (r.status === 401) { location.href = 'login.html?redirect=visiteurs.html'; return; }
            var d = await r.json();
            $('visDiscret').checked = !!d.discret;
            if (d.discret) {
                $('visResume').textContent = 'Visite discrète activée.';
                liste.innerHTML = '<p class="mbr-vide">Vous naviguez en <b>visite discrète</b> : les profils que vous regardez ne voient pas votre passage, et vous ne voyez pas vos visiteurs. Désactivez-la pour les voir.</p>';
                return;
            }
            var n = d.visiteurs.length;
            $('visResume').textContent = n ? n + ' visiteur' + (n > 1 ? 's' : '') + ' ces 30 derniers jours' + (d.nouveaux ? ', dont ' + d.nouveaux + ' nouveau' + (d.nouveaux > 1 ? 'x' : '') : '') + '.' : 'Personne pour le moment.';
            liste.innerHTML = n ? d.visiteurs.map(carte).join('')
                : '<div class="mbr-vide"><p style="margin:0 0 16px">Aucune visite ces 30 derniers jours. Complétez votre profil (photo, annonce, ce que vous recherchez), indiquez-vous « Libre ce soir » et passez dans les <a href="salons.html">salons</a> : vous serez plus vu.</p>' +
                  '<p style="margin:0;display:flex;flex-wrap:wrap;gap:10px;justify-content:center">' +
                  '<a class="mbr-btn" href="compte.html#profilLibertin">✏️ Gérer mon profil</a>' +
                  '<a class="mbr-btn mbr-btn-2" href="membres.html#mbrLibre">🌙 Libre ce soir</a></p></div>';
            if (d.nouveaux) fetch(API_URL + '/models/visiteurs/vus', { method: 'POST', credentials: 'include' }).then(function () {
                document.querySelectorAll('[data-nav-visites-badge]').forEach(function (b) { b.classList.add('hidden'); });
            }).catch(function () {});
        } catch (e) { liste.innerHTML = '<p class="mbr-vide">La liste est indisponible pour le moment. Réessayez dans un instant.</p>'; }
    }
    $('visDiscret').addEventListener('change', function () {
        var actif = this.checked;
        fetch(API_URL + '/models/visites-discretes', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actif: actif }) })
            .then(function (r) { if (!r.ok) throw new Error(); if (typeof showToast === 'function') showToast(actif ? 'Visite discrète activée' : 'Visite discrète désactivée', 'success'); charger(); })
            .catch(function () { if (typeof showToast === 'function') showToast('Impossible d’enregistrer pour le moment', 'error'); });
    });
    charger();
})();
