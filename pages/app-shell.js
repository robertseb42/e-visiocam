// Extrait de app-shell.html (CSP stricte : plus de script inline dans les pages)
    (function () {
      var p = new URLSearchParams(location.search).get('page') || 'index.html';
      // Sécurité : uniquement une page locale du site, sous la forme « nom.html?…#… » (ou « nom » sans .html).
      // Liste blanche plutôt que liste noire : l'ancienne laissait passer data:… et \\autre-site.com
      // (le navigateur lit « \ » comme « / »), qui affichaient un contenu étranger dans le cadre.
      if (!/^[a-z0-9_-]+(?:\.html)?(?:[?#].*)?$/i.test(p)) p = 'index.html';
      var frame = document.getElementById('evcPage');
      var observeur = null;

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
      function placerRadio() {
        var w = document.getElementById('radioWidgetFloating');
        if (!w) return;
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
        w.style.cssText = 'position:fixed;z-index:9999;left:auto;top:auto;right:16px;bottom:16px;transform:' + (window.innerWidth < 640 ? 'scale(.85)' : 'none');
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
          var page = (win.location.pathname.split('/').pop() || 'index.html') + win.location.search + win.location.hash;
          history.replaceState(null, '', 'app-shell.html?page=' + encodeURIComponent(page));
        } catch (e) {}
        synchroniser();
        if (observeur) observeur.disconnect();
        observeur = new MutationObserver(synchroniser);
        observeur.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
        try { win.addEventListener('evc:colonne', placerRadio); win.addEventListener('resize', placerRadio); } catch (e) {}
        setTimeout(placerRadio, 50); setTimeout(placerRadio, 600); setTimeout(placerRadio, 1800);
      });
      window.addEventListener('resize', placerRadio);
      window.addEventListener('evc:radio-taille', placerRadio);
      window.__evcPlacerRadio = placerRadio;
      frame.src = p;
    })();
