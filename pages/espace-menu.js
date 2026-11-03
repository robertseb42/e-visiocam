// E-VISIOCAM — Espace équipe : menu commun à toutes les pages de l'équipe.
// Sur espace-equipe.html il remplit le menu latéral (#evxMenu) ; sur les anciennes pages (admin, modération, guide…)
// il ajoute une barre « ← Espace équipe » en haut, en attendant leur intégration complète (étapes P2 à P5).
(function () {
    'use strict';
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!u || (u.role !== 'moderator' && u.role !== 'super_admin')) return;
    var SUPER = u.role === 'super_admin';
    // [libellé, lien, réservé au super-admin ?]
    var MENU = [
        { nom: 'Vue d\'ensemble', ico: 'fa-gauge-high', liens: [['À traiter', 'espace-equipe.html']] },
        { nom: 'Modération', ico: 'fa-shield-halved', liens: [
            ['Signalements', 'moderation.html#reports'], ['Alertes', 'moderation.html#alertes'], ['Surveillance live', 'moderation.html#surveillance'],
            ['Contestations', 'moderation.html#contestations'], ['Photos de profil', 'moderation.html#photos'], ['Mots interdits', 'moderation.html#words'],
            ['Historique', 'moderation.html#viewlogs']] },
        { nom: 'Membres et équipe', ico: 'fa-users', liens: [
            ['Membres', SUPER ? 'admin.html#users' : 'moderation.html#users'], ['Candidatures', 'moderation.html#candidatures'],
            ['Rôles de l\'équipe', 'admin.html#mods', true], ['Crédits et récompenses', 'admin.html#rewards', true]] },
        { nom: 'Communauté', ico: 'fa-people-group', admin: true, liens: [
            ['Salons et VIP', 'moderation-salons.html'], ['Programme du site', 'admin.html#programme'], ['Radios', 'admin.html#radios'], ['Décor de l\'accueil', 'decor.html']] },
        { nom: 'Guide libertin', ico: 'fa-map-location-dot', liens: [
            ['À valider', 'guide-equipe.html#glModeration'], ['Fiches des lieux', 'guide-equipe.html#glEqTitre'], ['Import CSV', 'guide-equipe.html#glImpTitre']] },
        { nom: 'Statistiques', ico: 'fa-chart-column', admin: true, liens: [['Fréquentation', 'guide-equipe.html#evFreq'], ['Activité des membres', 'admin.html#stats']] },
        { nom: 'Messages', ico: 'fa-envelope', admin: true, liens: [['Demandes de contact', 'admin.html#contact']] },
        { nom: 'Système', ico: 'fa-gear', admin: true, liens: [['Maintenance et sauvegardes', 'admin.html'], ['Journal des actions', 'admin.html#audit']] }
    ];
    var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var ici = location.pathname.split('/').pop() + location.hash;

    function menuHTML() {
        return MENU.filter(function (f) { return SUPER || !f.admin; }).map(function (f) {
            var liens = f.liens.filter(function (l) { return SUPER || !l[2]; });
            return '<div class="evx-famille"><p class="evx-famille-nom"><i class="fa-solid ' + f.ico + '" aria-hidden="true"></i> ' + esc(f.nom) + '</p><ul>' +
                liens.map(function (l) { var actif = l[1] === ici || (l[1] === 'espace-equipe.html' && /espace-equipe/.test(ici)); return '<li><a href="' + l[1] + '"' + (actif ? ' aria-current="page"' : '') + '>' + esc(l[0]) + '</a></li>'; }).join('') +
                '</ul></div>';
        }).join('');
    }
    function brancher() {
        var nav = document.getElementById('evxMenu');
        if (nav) {
            nav.innerHTML = '<details class="evx-menu-mobile" open><summary><i class="fa-solid fa-bars" aria-hidden="true"></i> Menu de l\'équipe</summary>' + menuHTML() + '</details>';
            if (window.matchMedia && matchMedia('(max-width: 900px)').matches) nav.querySelector('details').open = false;
            return;
        }
        // Anciennes pages : barre de retour vers l'Espace équipe
        if (document.getElementById('evxRetour')) return;
        var main = document.querySelector('main'); if (!main) return;
        var titre = { 'admin.html': 'Administration', 'moderation.html': 'Modération', 'guide-equipe.html': 'Guide libertin', 'moderation-salons.html': 'Salons et VIP', 'decor.html': 'Décor de l\'accueil' }[location.pathname.split('/').pop()] || document.title;
        main.insertAdjacentHTML('afterbegin', '<p id="evxRetour" class="evx-retour"><a href="espace-equipe.html"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Espace équipe</a><span aria-hidden="true">›</span><span>' + esc(titre) + '</span></p>');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
})();
