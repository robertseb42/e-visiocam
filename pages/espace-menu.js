// E-VISIOCAM — Espace équipe : menu commun à toutes les pages de l'équipe.
// Sur espace-equipe.html il remplit le menu latéral (#evxMenu) ; sur les anciennes pages (admin, modération, guide…)
// il ajoute une barre « ← Espace équipe » en haut, en attendant leur intégration complète (étapes P2 à P5).
(function () {
    'use strict';
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    var EQUIPE = ['moderator', 'super_admin', 'guide_editor', 'animateur'];
    if (!u || EQUIPE.indexOf(u.role) < 0) return;
    var R = u.role;
    // Qui voit quoi (doc d'audit, version 2). M = modération, S = super-admin, G = éditeur du guide, A = animateur
    var M = ['moderator', 'super_admin'], S = ['super_admin'], G = ['moderator', 'super_admin', 'guide_editor'], A = ['super_admin', 'animateur'], TOUS = EQUIPE;
    var MENU = [
        { nom: 'Vue d\'ensemble', ico: 'fa-gauge-high', roles: TOUS, liens: [['À traiter', 'espace-equipe.html', TOUS]] },
        { nom: 'Modération', ico: 'fa-shield-halved', roles: M, liens: [
            ['Signalements', 'moderation.html#reports', M], ['Alertes', 'moderation.html#alertes', M], ['Surveillance live', 'moderation.html#surveillance', M],
            ['Contestations', 'moderation.html#contestations', M], ['Photos de profil', 'moderation.html#photos', M], ['Mots interdits', 'moderation.html#words', M],
            ['Historique', 'moderation.html#viewlogs', M]] },
        { nom: 'Membres et équipe', ico: 'fa-users', roles: M, liens: [
            ['Membres', R === 'super_admin' ? 'admin.html#users' : 'moderation.html#users', M], ['Candidatures', 'moderation.html#candidatures', M],
            ['Rôles de l\'équipe', 'admin.html#users', S], ['Crédits et récompenses', 'admin.html#rewards', S]] },
        { nom: 'Communauté', ico: 'fa-people-group', roles: A, liens: [
            ['Programme du site', 'communaute.html#programme', A], ['Radios', 'communaute.html#radios', A], ['Salons et VIP', 'moderation-salons.html', S], ['Décor de l\'accueil', 'decor.html', S]] },
        { nom: 'Guide libertin', ico: 'fa-map-location-dot', roles: G, liens: [
            ['À valider', 'guide-equipe.html#glModeration', G], ['Fiches des lieux', 'guide-equipe.html#glEqTitre', G], ['Import CSV', 'guide-equipe.html#glImpTitre', G]] },
        { nom: 'Statistiques', ico: 'fa-chart-column', roles: S, liens: [['Fréquentation', 'guide-equipe.html#evFreq', S], ['Activité des membres', 'admin.html#stats', S]] },
        { nom: 'Messages', ico: 'fa-envelope', roles: S, liens: [['Demandes de contact', 'admin.html#contact', S]] },
        { nom: 'Système', ico: 'fa-gear', roles: S, liens: [['Maintenance et sauvegardes', 'admin.html', S], ['Journal des actions', 'admin.html#audit', S]] }
    ];
    var esc = function (t) { return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var ici = location.pathname.split('/').pop() + location.hash;
    window.addEventListener('hashchange', function () { ici = location.pathname.split('/').pop() + location.hash; brancher(); });

    function menuHTML() {
        return MENU.filter(function (f) { return f.roles.indexOf(R) >= 0; }).map(function (f) {
            var liens = f.liens.filter(function (l) { return l[2].indexOf(R) >= 0; });
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
        var titre = { 'admin.html': 'Administration', 'moderation.html': 'Modération', 'guide-equipe.html': 'Guide libertin', 'moderation-salons.html': 'Salons et VIP', 'decor.html': 'Décor de l\'accueil', 'communaute.html': 'Communauté' }[location.pathname.split('/').pop()] || document.title;
        main.insertAdjacentHTML('afterbegin', '<p id="evxRetour" class="evx-retour"><a href="espace-equipe.html"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i> Espace équipe</a><span aria-hidden="true">›</span><span>' + esc(titre) + '</span></p>');
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
})();
