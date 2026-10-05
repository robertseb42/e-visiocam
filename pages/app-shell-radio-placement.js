// Extrait de app-shell.html (CSP stricte : plus de script inline dans les pages)
    // La radio vient d'être créée : premier placement, puis à chaque ouverture / réduction
    (function () {
      var w = document.getElementById('radioWidgetFloating');
      if (!w) return;
      if (window.__evcPlacerRadio) window.__evcPlacerRadio();
      // Seulement quand la radio s'ouvre ou se réduit (pas à chaque tour du vinyle)
      new MutationObserver(function (liste) {
        if (liste.some(function (m) { return m.target.id === 'radioWidgetExpanded' || m.target.id === 'radioWidgetMinimized'; }) && window.__evcPlacerRadio) window.__evcPlacerRadio();
      }).observe(w, { subtree: true, attributes: true, attributeFilter: ['class'] });
    })();
