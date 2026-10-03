// ============================================================
// E-VISIOCAM - Barre de navigation mobile (en bas de l'écran)
// ------------------------------------------------------------
// Visible seulement sous 1024 px (là où le menu du haut est masqué).
// Chargée automatiquement par footer.js ; ajoutée à la main sur chat.html.
// ============================================================
(function () {
    'use strict';
    if (document.querySelector('.ev-mnav')) return;

    var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (page.indexOf('.') === -1) page += '.html';
    var connecte = typeof isLoggedIn === 'function' && isLoggedIn();

    var LIENS = [
        { href: 'index.html', label: 'Accueil', svg: '<path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/>' },
        { href: 'salons.html', label: 'Salons', svg: '<path d="M4 4h16v11H8l-4 4z"/>', aussi: ['room.html', 'chat.html'] },
        { href: 'live.html', label: 'En direct', svg: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>' },
        { href: 'favoris.html', label: 'Favoris', svg: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>' },
        { href: connecte ? 'compte.html' : 'login.html', label: connecte ? 'Compte' : 'Connexion', svg: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7z"/>', aussi: ['profile.html', 'credits.html', 'messages.html', 'register.html'] }
    ];

    var nav = document.createElement('nav');
    nav.className = 'ev-mnav';
    nav.setAttribute('aria-label', 'Navigation mobile');
    nav.innerHTML = LIENS.map(function (l) {
        var courant = l.href === page || (l.aussi && l.aussi.indexOf(page) !== -1);
        return '<a href="' + l.href + '"' + (courant ? ' aria-current="page"' : '') + '>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' + l.svg + '</svg><span>' + l.label + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('has-mnav');
})();
