// ============================================================
// E-VISIOCAM - Pied de page commun à toutes les pages
// ------------------------------------------------------------
// Ajouter avant </body> :  <script src="footer.js" defer></script>
// Pour modifier un lien ou une adresse, c'est ici et nulle part ailleurs.
// Les styles sont dans style.css (section « PIED DE PAGE COMMUN »).
// ============================================================
(function () {
    'use strict';

    var COLONNES = [
        { titre: 'Informations légales', liens: [
            ['mentions-legales.html', 'Mentions légales'],
            ['cgu.html', 'Conditions générales (CGU)'],
            ['rgpd.html', 'Confidentialité et vos droits (RGPD)'],
            ['cookies.html', 'Cookies']
        ]},
        { titre: 'E-VISIOCAM', liens: [
            ['a-propos.html', 'À propos'],
            ['salons.html', 'Salons'],
            ['tchat-regions.html', 'Chat par région'],
            ['guide.html', 'Guide libertin des clubs'],
            ['etablissements.html', 'Établissements : badge vérifié'],
            ['programme.html', 'Programme des soirées'],
            ['modeles.html', 'Modèles'],
            ['credits.html', 'Récompenses'],
            ['guides.html', 'Guides du chat webcam'],
            ['equipe.html', 'L\'équipe'],
            ['devenir-moderateur.html', 'Devenir modérateur'],
            ['contact.html', 'Nous contacter']
        ]},
        { titre: 'Aide & signalement', liens: [
            ['aide.html', 'Centre d\'aide'],
            ['mailto:contact@e-visiocam.com', 'contact@e-visiocam.com'],
            ['mailto:abuse@e-visiocam.com', 'Signaler un abus'],
            ['mailto:dpo@e-visiocam.com', 'Protection des données (DPO)'],
            ['https://www.internet-signalement.gouv.fr', 'PHAROS — contenu illégal', true]
        ]}
    ];

    function echapper(s) {
        return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
    }

    function construire() {
        if (document.querySelector('.ev-footer')) return;   // déjà présent

        var page = ((function (p) { return p && p.indexOf('.') === -1 ? p + '.html' : p; })(location.pathname.split('/').pop()) || 'index.html').toLowerCase();
        if (page.indexOf('.') === -1) page += '.html';      // URL sans extension (/contact)

        var colonnes = COLONNES.map(function (col) {
            var items = col.liens.map(function (l) {
                var courant = l[0].toLowerCase() === page ? ' aria-current="page"' : '';
                var externe = l[2] ? ' target="_blank" rel="noopener noreferrer"' : '';
                return '<li><a href="' + echapper(l[0]) + '"' + courant + externe + '>' + echapper(l[1]) + '</a></li>';
            }).join('');
            return '<nav aria-label="' + echapper(col.titre) + '"><h2>' + echapper(col.titre) + '</h2><ul>' + items + '</ul></nav>';
        }).join('');

        var footer = document.createElement('footer');
        footer.className = 'ev-footer';
        footer.innerHTML =
            '<div class="ev-footer-inner">' +
                '<div>' +
                    '<a href="index.html" class="ev-footer-brand">' +
                        '<span class="ev-footer-logo" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/></svg></span>' +
                        '<span class="ev-footer-name">E-<span>VISIOCAM</span></span>' +
                    '</a>' +
                    '<p>Chat cam en direct : discutez, faites des rencontres et partagez des moments uniques en toute sécurité.</p>' +
                    '<span class="ev-footer-age">Réservé aux personnes majeures (18+)</span>' +
                '</div>' +
                colonnes +
            '</div>' +
            '<div class="ev-footer-bottom"><div>' +
                '<span>© ' + new Date().getFullYear() + ' E-VISIOCAM. Tous droits réservés.</span>' +
                '<span><a href="contact.html">Une question ? Contactez-nous</a></span>' +
            '</div></div>';

        // Pages de connexion/inscription : le contenu est centré en ligne ; on passe en colonne
        // pour que le pied de page se place SOUS la carte et non à côté.
        var b = document.body, cs = getComputedStyle(b);
        if (cs.display === 'flex' && cs.flexDirection.indexOf('row') === 0) {
            b.style.flexDirection = 'column';
            // et on annule la marge intérieure du body pour que le pied de page prenne toute la largeur
            footer.style.marginLeft = '-' + cs.paddingLeft;
            footer.style.marginRight = '-' + cs.paddingRight;
            footer.style.marginBottom = '-' + cs.paddingBottom;
            footer.style.width = 'auto';
        }

        // Pages en hauteur fixe (h-full) : laisser la page grandir pour afficher le pied de page
        if (b.classList.contains('h-full')) { b.style.height = 'auto'; b.style.minHeight = '100%'; }

        b.appendChild(footer);

        // 💬 Assistant d'aide (bulle en bas à gauche), sauf là où il gênerait la saisie ou l'équipe
        var page = ((function (p) { return p && p.indexOf('.') === -1 ? p + '.html' : p; })(location.pathname.split('/').pop()) || 'index.html').toLowerCase();
        var sansAssistant = ['apercu.html', 'chat.html', 'live.html', 'messages.html', 'room.html', 'admin.html', 'moderation.html', 'moderation-salons.html', 'decor.html', 'dashboard.html', 'espace-equipe.html', 'guide-equipe.html'];
        if (sansAssistant.indexOf(page) === -1 && !document.querySelector('script[src*="assistant.js"]')) {
            var as = document.createElement('script');
            as.src = 'assistant.js?v=6';
            document.body.appendChild(as);
        }

        // 📷 Fiche membre + demandes de cam (notifications « X aimerait voir votre cam »)
        if (!window.EVC_DEPARTEMENTS && !document.querySelector('script[src*="departements-data.js"]')) {
            var dd = document.createElement('script'); dd.src = 'departements-data.js?v=2'; document.body.appendChild(dd);
        }
        if (!document.querySelector('script[src*="membres-social.js"]')) {
            var ms = document.createElement('script');
            ms.src = 'membres-social.js?v=9';
            document.body.appendChild(ms);
        }

        // Barre de navigation mobile (même dossier que ce fichier)
        if (!document.querySelector('script[src*="mobile-nav.js"]')) {
            var sc = document.createElement('script');
            sc.src = 'mobile-nav.js?v=2';
            document.body.appendChild(sc);
        }

        // 📲 Installer l'application (bandeau discret dès la 2e visite, aide iPhone)
        if (!document.querySelector('script[src*="install-app.js"]')) {
            var ia = document.createElement('script');
            ia.src = 'install-app.js?v=1';
            document.body.appendChild(ia);
        }
    }

    // L'événement d'installation peut arriver avant install-app.js : on le garde pour lui
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); window.__evcBip = e; });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', construire);
    else construire();
})();
