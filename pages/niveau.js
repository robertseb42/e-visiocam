// ============================================================
// E-VISIOCAM — « Mon niveau » dans Mon compte (8 niveaux, points calculés par le serveur)
// ============================================================
(function () {
    'use strict';
    var zone = document.getElementById('niveauZone');
    if (!zone || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    function rendre(d) {
        var actuel = d.niveaux[d.niveau.n - 1], suivant = d.suivant;
        var pct = suivant ? Math.round((d.points - actuel.seuil) / (suivant.seuil - actuel.seuil) * 100) : 100;
        var aFaire = d.etapes.filter(function (e) { return e.points < e.max && ['anciennete', 'amis', 'suivi'].indexOf(e.cle) < 0; });
        var certif = d.etapes.find(function (e) { return e.cle === 'certification'; });
        zone.innerHTML = '<div class="niv-carte">' +
            '<div class="niv-tete"><span class="niv-num" aria-hidden="true">' + d.niveau.n + '</span><div><b>Niveau ' + d.niveau.n + ' sur ' + d.total + ' · ' + esc(d.niveau.nom) + '</b>' +
            '<span>' + d.points + ' points' + (suivant ? ' · encore ' + suivant.manque + ' pour « ' + esc(suivant.nom) + ' »' : ' · niveau maximum, bravo !') + '</span></div></div>' +
            '<div class="niv-barre" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '"><i style="width:' + Math.max(3, pct) + '%"></i></div>' +
            (certif && !certif.points ? '<p class="niv-conseil">💡 <b>Faites certifier votre profil</b> : +150 points d’un coup, et le badge ✔ sur votre carte (bloc « Profil certifié » plus bas).</p>' : '') +
            (aFaire.length ? '<ul class="niv-etapes">' + aFaire.map(function (e) { return '<li><span>' + esc(e.libelle) + '</span><em>+' + (e.max - e.points) + '</em></li>'; }).join('') + '</ul>' : '') +
            '<ul class="niv-etapes"><li><span>Ancienneté, amis et membres qui vous suivent font aussi monter votre niveau.</span></li></ul>' +
            '</div>';
    }
    function charger() {
        fetch(API_URL + '/models/mon-niveau', { credentials: 'include' }).then(function (r) { return r.ok ? r.json() : null; })
            .then(function (d) { if (d) rendre(d); else zone.innerHTML = '<p class="text-xs text-slate-500">Votre niveau est indisponible pour le moment.</p>'; })
            .catch(function () { zone.innerHTML = '<p class="text-xs text-slate-500">Votre niveau est indisponible pour le moment.</p>'; });
    }
    charger();
    // Après « Enregistrer », le niveau peut changer
    document.addEventListener('submit', function () { setTimeout(charger, 1500); }, true);
})();
