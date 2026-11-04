// modeles.html → membres.html (membres et modèles ne font plus qu'un) ; la recherche ?q= est conservée
(function () { var q = new URLSearchParams(location.search).get('q'); location.replace('membres.html' + (q ? '?q=' + encodeURIComponent(q) : '')); })();
