// E-VISIOCAM — entrée automatique dans le shell radio persistant
(function () {
  if (window.top !== window) return;
  if (window.__EVC_PERSISTENT_RADIO__) return;
  // Moteurs de recherche et aperçus de liens : ils lisent la vraie page, pas le cadre radio
  if (/bot|crawl|spider|slurp|google|bing|yandex|baidu|duckduck|qwant|inspection|facebookexternalhit|embedly|preview|lighthouse|headless/i.test(navigator.userAgent || '')) return;

  var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var excluded = [
    'app-shell.html','login.html','register.html','forgot-password.html',
    'reset-password.html','verifier-email.html','404.html'
  ];
  if (excluded.indexOf(file) !== -1) return;

  var target = file + location.search + location.hash;
  location.replace('app-shell.html?page=' + encodeURIComponent(target));
})();
