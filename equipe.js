// ============================================================
// E-VISIOCAM — page « L'équipe » : fondateur, modérateurs, stagiaires
// ============================================================
(function () {
    'use strict';
    var boite = document.getElementById('evqListe');
    if (!boite) return;
    var TITRES = { fondateur: 'Fondateur', moderateur: 'Modérateur', stagiaire: 'Stagiaire' };
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function carte(m) {
        var photo = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        var dep = m.departement ? ' <small>(' + esc(m.departement) + ')</small>' : '';
        var lien = typeof getCurrentUser === 'function' && getCurrentUser() && getCurrentUser().id !== m.id ? 'messages.html?ecrire=' + Number(m.id) : null;
        return '<div class="evq-carte">' +
            (photo ? '<img class="evq-photo" src="' + esc(photo) + '" alt="" loading="lazy">' : '<div class="evq-initiale" aria-hidden="true">' + esc((m.username || '?').charAt(0).toUpperCase()) + '</div>') +
            '<div class="evq-nom" title="' + esc(m.username) + '">' + esc(m.username) + dep + '</div>' +
            '<span class="evq-grade ' + esc(m.grade) + '">' + esc(TITRES[m.grade] || m.grade) + '</span>' +
            (lien ? '<div style="margin-top:10px"><a href="' + lien + '" style="font-size:13px;font-weight:700"><i class="fa-regular fa-envelope"></i> Écrire</a></div>' : '') +
            '</div>';
    }
    fetch(API_URL + '/equipe', { credentials: 'include' }).then(function (r) { return r.json(); }).then(function (d) {
        var liste = d.equipe || [];
        if (!liste.length) { boite.innerHTML = '<p class="evr-muted">L’équipe se met en place.</p>'; return; }
        var ordre = ['fondateur', 'moderateur', 'stagiaire'];
        liste.sort(function (a, b) { return ordre.indexOf(a.grade) - ordre.indexOf(b.grade) || a.username.localeCompare(b.username, 'fr'); });
        boite.innerHTML = '<div class="evq-grille">' + liste.map(carte).join('') + '</div>';
    }).catch(function () { boite.innerHTML = '<p class="evr-muted">Impossible de charger l’équipe pour le moment.</p>'; });
})();
