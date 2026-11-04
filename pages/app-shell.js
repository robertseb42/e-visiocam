// Extrait de app-shell.html (CSP stricte : plus de script inline dans les pages)
    (function () {
      var p = new URLSearchParams(location.search).get('page') || 'index.html';
      // Sécurité : uniquement une page locale du site, sous la forme « nom.html?…#… » (ou « nom » sans .html).
      // Liste blanche plutôt que liste noire : l'ancienne laissait passer data:… et \\autre-site.com
      // (le navigateur lit « \ » comme « / »), qui affichaient un contenu étranger dans le cadre.
      // Pages rangées dans un dossier (guide par ville : « club-libertin/lyon/ ») : segments de lettres, chiffres, - et _ seulement
      if (!/^(?:[a-z0-9_-]+\/)*[a-z0-9_-]+(?:\.html)?(?:[?#].*)?$/i.test(p) && !/^(?:[a-z0-9_-]+\/)+(?:[?#].*)?$/i.test(p)) p = 'index.html';
      var frame = document.getElementById('evcPage');
      var observeur = null;
      var observeurPage = null;

      // ---------- Placement de la radio ----------
      // Sur l'accueil, la page publie « __evcColonne » : centre et haut de la colonne libre de droite
      // (sous la boule à facettes et le danseur). Ailleurs, la radio se range en bas à droite.
      // La page affichée range la bulle « Besoin d'aide ? » juste sous la radio
      function annoncer(r) {
        window.__evcRadioPlace = r;
        try { frame.contentWindow.dispatchEvent(new Event('evc:radio-placee')); } catch (e) {}
      }
      // Toutes les autres pages : la colonne libre à droite du contenu principal (<main>), sous l'en-tête
      function colonneGenerique() {
        try {
          var doc = frame.contentDocument, win = frame.contentWindow;
          if (!doc || !doc.body) return null;
          var main = doc.querySelector('main');
          var droite = 0;
          if (main) {
            var r = main.getBoundingClientRect(), cs = win.getComputedStyle(main);
            droite = r.right - parseFloat(cs.paddingRight || 0);
            // contenu plus étroit que <main> (ex. page centrée) : on prend le bord droit réel des blocs
            var maxEnfant = 0;
            for (var i = 0; i < main.children.length; i++) {
              var e = main.children[i], re = e.getBoundingClientRect();
              if (re.width && win.getComputedStyle(e).position !== 'fixed') maxEnfant = Math.max(maxEnfant, re.right);
            }
            if (maxEnfant) droite = Math.min(droite, maxEnfant) || droite;
          } else return null;
          var marge = win.innerWidth - droite;
          var tete = doc.querySelector('header');
          var haut = (tete ? tete.getBoundingClientRect().bottom : 64) + 16;
          return { centre: Math.round(droite + marge / 2), haut: Math.round(haut), largeur: Math.round(marge) };
        } catch (e) { return null; }
      }
      // Accueil (grand écran) : la radio se range dans la colonne de gauche, juste sous « Besoin d'aide ? »,
      // à la même largeur ; un emplacement vide de sa hauteur lui est réservé dans la page et elle suit le défilement
      function emplacementGauche() {
        try {
          var doc = frame.contentDocument, win = frame.contentWindow;
          if (!doc || !win || win.innerWidth < 1024) return null;
          var col = doc.getElementById('sidebar');
          if (!col || !col.getBoundingClientRect().width) return null;
          var aide = col.querySelector('.evc-as');
          var slot = doc.getElementById('evcRadioPlace');
          if (!slot) { slot = doc.createElement('div'); slot.id = 'evcRadioPlace'; slot.setAttribute('aria-hidden', 'true'); slot.style.flex = 'none'; }
          if (aide ? slot.previousElementSibling !== aide : slot.parentNode !== col) { if (aide) aide.insertAdjacentElement('afterend', slot); else col.appendChild(slot); }
          return slot;
        } catch (e) { return null; }
      }
      function placerRadio() {
        var w = document.getElementById('radioWidgetFloating');
        if (!w) return;
        var slot = emplacementGauche();
        if (slot) {
          w.classList.remove('evc-coin'); w.classList.add('evc-gauche');
          var r = slot.getBoundingClientRect(), largeur = Math.round(r.width);
          w.style.cssText = 'position:fixed;z-index:9999;right:auto;bottom:auto;transform:none;left:' + Math.round(r.left) + 'px;top:' + Math.round(r.top) + 'px;width:' + largeur + 'px';
          var h = w.offsetHeight;
          if (Math.abs(slot.offsetHeight - h) > 1) { slot.style.height = h + 'px'; r = slot.getBoundingClientRect(); w.style.top = Math.round(r.top) + 'px'; }
          // Sous l'en-tête collant (page défilée) : on la masque plutôt que de la superposer au menu
          var tete = 64; try { var t = frame.contentDocument.querySelector('header'); if (t) tete = t.getBoundingClientRect().bottom; } catch (e) {}
          if (r.top < tete || fenetreModaleOuverte()) w.style.visibility = 'hidden';
          annoncer({ colonne: false, gauche: true });
          return;
        }
        w.classList.remove('evc-gauche'); w.style.width = '';
        // Colonne de droite UNIQUEMENT sur l'accueil (qui publie __evcColonne : la radio y est placée
        // bas, sous la boule à facettes). PARTOUT AILLEURS : coin bas-droit, pour ne jamais recouvrir
        // le menu du compte qui s'ouvre en haut à droite. (La bulle « Besoin d'aide ? » va alors en bas à gauche.)
        var info = null;
        try { info = frame.contentWindow && frame.contentWindow.__evcColonne; } catch (e) {}
        // offsetWidth / offsetHeight : taille réelle sans l'effet du zoom (transform)
        var largeur = w.offsetWidth || 252, hauteur = w.offsetHeight || 360;
        if (info && info.largeur >= 150 && window.innerWidth >= 1024) {
          var echelle = Math.min(1, (info.largeur - 16) / largeur, (window.innerHeight - info.haut - 12) / hauteur);
          if (echelle >= 0.55) {
            w.classList.remove('evc-coin');
            var gauche = Math.round(info.centre - largeur * echelle / 2);
            w.style.cssText = 'position:fixed;z-index:9999;right:auto;bottom:auto;left:' + gauche + 'px;top:' + Math.round(info.haut) + 'px;transform:scale(' + echelle.toFixed(3) + ')';
            annoncer({ colonne: true, left: gauche, top: Math.round(info.haut), width: Math.round(largeur * echelle), height: Math.round(hauteur * echelle) });
            return;
          }
        }
        annoncer({ colonne: false });
        w.classList.add('evc-coin');
        // Mobile : la barre de navigation du bas (dans la page affichée) ne doit jamais être recouverte
        var bas = 16;
        try {
          var nav = frame.contentDocument && frame.contentDocument.querySelector('.ev-mnav');
          if (nav && frame.contentWindow.getComputedStyle(nav).display !== 'none') {
            bas = Math.round(nav.getBoundingClientRect().height) + 12;
          }
        } catch (e) {}
        // Zone de saisie en bas de page (chat, messages privés…) : la radio se range AU-DESSUS,
        // pour ne plus cacher le bouton « Envoyer » ni la fin du champ de texte
        var saisie = zoneSaisie();
        if (saisie) bas = Math.max(bas, Math.round(window.innerHeight - saisie.top) + 8);
        // Fenêtre modale ouverte dans la page (contrôle 18+, signalement…) : la radio s'efface
        var cache = fenetreModaleOuverte();
        w.style.cssText = 'position:fixed;z-index:9999;left:auto;top:auto;right:' + (window.innerWidth < 480 ? 12 : 16) + 'px;bottom:' + bas + 'px;transform:' + (window.innerWidth < 640 ? 'scale(.85)' : 'none') + (cache ? ';visibility:hidden' : '');
      }

      // Champ de saisie visible dans le bas de l'écran (le plus haut s'il y en a plusieurs)
      function zoneSaisie() {
        try {
          var doc = frame.contentDocument, win = frame.contentWindow;
          if (!doc) return null;
          var champs = doc.querySelectorAll('form textarea, form input[type="text"], form input:not([type])');
          var haut = null;
          for (var i = 0; i < champs.length; i++) {
            var f = champs[i].closest('form') || champs[i];
            var r = f.getBoundingClientRect();
            if (!r.width || !r.height || win.getComputedStyle(f).visibility === 'hidden') continue;
            if (r.bottom > window.innerHeight - 220 && r.top < window.innerHeight) haut = haut === null ? r.top : Math.min(haut, r.top);
          }
          return haut === null ? null : { top: haut };
        } catch (e) { return null; }
      }
      function fenetreModaleOuverte() {
        try {
          var doc = frame.contentDocument;
          if (!doc) return false;
          if (doc.getElementById('legalOverlay')) return true;
          var m = doc.querySelectorAll('[aria-modal="true"], [role="dialog"]');
          for (var i = 0; i < m.length; i++) { var r = m[i].getBoundingClientRect(); if (r.width && r.height) return true; }
          return false;
        } catch (e) { return false; }
      }

      // ---------- Le cadre suit le thème et la boule ; l'adresse suit la page ----------
      function synchroniser() {
        var d;
        try { d = frame.contentDocument && frame.contentDocument.documentElement; } catch (e) { return; }
        if (!d) return;
        var t = d.getAttribute('data-theme');
        if (t && t !== document.documentElement.getAttribute('data-theme')) document.documentElement.setAttribute('data-theme', t);
      }

      frame.addEventListener('load', function () {
        document.documentElement.classList.remove('evc-menu-compte');   // nouvelle page : menu du compte fermé
        var doc, win;
        try { doc = frame.contentDocument; win = frame.contentWindow; } catch (e) { return; }
        if (!doc) return;
        // Ancienne radio intégrée à la page : masquée, seule la radio persistante joue
        var ancienne = doc.getElementById('radioWidget');
        if (ancienne) { ancienne.style.setProperty('display', 'none', 'important'); ancienne.setAttribute('aria-hidden', 'true'); }
        // Titre et adresse : un rechargement ou un favori ramène sur la bonne page
        try {
          document.title = doc.title || 'E-VISIOCAM';
          var dossier = win.location.pathname.replace(/^\/+/, '');
          var page = (dossier.indexOf('/') !== -1 ? dossier : ((function (p) { return p && p.indexOf('.') === -1 ? p + '.html' : p; })(win.location.pathname.split('/').pop()) || 'index.html')) + win.location.search + win.location.hash;
          // Adresse propre (/salons.html, /chat.html?theme=…) au lieu de app-shell.html?page=… :
          // les liens copiés et partagés pointent vers la vraie page, que Google peut indexer.
          // Un rechargement repasse par la page, qui renvoie aussitôt dans ce cadre.
          var propre = page.replace(/^index\.html(?=$|[?#])/, '');
          history.replaceState(null, '', '/' + propre);
        } catch (e) {}
        synchroniser();
        if (observeur) observeur.disconnect();
        observeur = new MutationObserver(synchroniser);
        observeur.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        try { win.addEventListener('evc:colonne', placerRadio); win.addEventListener('resize', placerRadio); } catch (e) {}
        // La radio rangée dans la colonne de gauche suit le défilement de la page
        try { var tic = false; win.addEventListener('scroll', function () { if (tic) return; tic = true; requestAnimationFrame(function () { tic = false; placerRadio(); }); }, { passive: true }); } catch (e) {}
        // Pages avec une zone de saisie (chat, messages) : radio réduite d'office, sans changer le choix mémorisé
        setTimeout(function () { if (zoneSaisie() && window.minimizeRadioWidget) window.minimizeRadioWidget(true); placerRadio(); }, 700);
        // Une fenêtre qui s'ouvre ou se ferme dans la page (18+, signalement…) : la radio se replace
        if (observeurPage) observeurPage.disconnect();
        var enAttente = false;
        observeurPage = new MutationObserver(function () {
          if (enAttente) return; enAttente = true;
          requestAnimationFrame(function () { enAttente = false; placerRadio(); });
        });
        try { observeurPage.observe(doc.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'hidden', 'open'] }); } catch (e) {}
        setTimeout(placerRadio, 50); setTimeout(placerRadio, 600); setTimeout(placerRadio, 1800);
      });
      window.addEventListener('resize', placerRadio);
      window.addEventListener('evc:radio-taille', placerRadio);
      window.__evcPlacerRadio = placerRadio;
      frame.src = p;
    })();
