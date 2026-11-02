// ============================================================
// E-VISIOCAM - Barre de navigation mobile (en bas de l'écran)
// ------------------------------------------------------------
// Visible seulement sous 1024 px (là où le menu du haut est masqué).
// Chargée automatiquement par footer.js ; ajoutée à la main sur chat.html.
// Membre connecté : onglet « Messages » avec le nombre de messages non lus
// (fourni par nav-auth.js : window.__evcDmNonLus + événement « evc:dm-non-lus »).
// Les favoris restent dans le menu du compte (avatar en haut à droite).
// ============================================================
(function () {
    'use strict';
    if (document.querySelector('.ev-mnav')) return;

    var page = ((function (p) { return p && p.indexOf('.') === -1 ? p + '.html' : p; })(location.pathname.split('/').pop()) || 'index.html').toLowerCase();
    if (page.indexOf('.') === -1) page += '.html';
    var connecte = typeof isLoggedIn === 'function' && isLoggedIn();

    var ongletFavoris = { href: 'favoris.html', label: 'Favoris', svg: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>' };
    var ongletMessages = { href: 'messages.html', label: 'Messages', messages: true, svg: '<path fill-rule="evenodd" d="M2 5h20v14H2zM4.5 7 12 12.4 19.5 7z"/>' };

    var LIENS = [
        { href: 'index.html', label: 'Accueil', svg: '<path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/>' },
        { href: 'salons.html', label: 'Salons', svg: '<path d="M4 4h16v11H8l-4 4z"/>', aussi: ['room.html', 'chat.html'] },
        { href: 'live.html', label: 'En direct', svg: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>' },
        connecte ? ongletMessages : ongletFavoris,
        { href: connecte ? 'compte.html' : 'login.html', label: connecte ? 'Compte' : 'Connexion', svg: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7z"/>',
          aussi: connecte ? ['profile.html', 'credits.html', 'favoris.html', 'bienvenue.html'] : ['profile.html', 'credits.html', 'messages.html', 'register.html'] }
    ];

    var nav = document.createElement('nav');
    nav.className = 'ev-mnav';
    nav.setAttribute('aria-label', 'Navigation mobile');
    nav.innerHTML = LIENS.map(function (l) {
        var courant = l.href === page || (l.aussi && l.aussi.indexOf(page) !== -1);
        var badge = l.messages
            ? '<span data-mnav-badge aria-hidden="true" hidden style="position:absolute;top:0;left:calc(50% + 4px);min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;border-radius:999px;background:#ff1680;color:#fff;font:800 10px/17px Inter,Arial,sans-serif;text-align:center"></span>'
            : '';
        return '<a href="' + l.href + '"' + (courant ? ' aria-current="page"' : '') + (l.messages ? ' data-mnav-messages style="position:relative"' : '') + '>' +
            '<svg viewBox="0 0 24 24" aria-hidden="true">' + l.svg + '</svg><span>' + l.label + '</span>' + badge + '</a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('has-mnav');

    // Pastille des messages non lus : cachée à 0, « 9+ » au-delà de 9
    var lien = nav.querySelector('[data-mnav-messages]');
    if (!lien) return;
    var pastille = lien.querySelector('[data-mnav-badge]');
    function majPastille(n) {
        n = Math.max(0, parseInt(n, 10) || 0);
        if (n > 0) {
            pastille.textContent = n > 9 ? '9+' : String(n);
            pastille.hidden = false;
            lien.setAttribute('aria-label', 'Messages, ' + n + ' non lu' + (n > 1 ? 's' : ''));
        } else {
            pastille.hidden = true;
            pastille.textContent = '';
            lien.setAttribute('aria-label', 'Messages');
        }
    }
    majPastille(window.__evcDmNonLus);
    window.addEventListener('evc:dm-non-lus', function (e) { majPastille(e.detail && e.detail.count); });
})();
