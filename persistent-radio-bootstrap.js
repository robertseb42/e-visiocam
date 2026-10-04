// E-VISIOCAM — entrée automatique dans le shell radio persistant
(function () {
  if (window.top !== window) return;
  if (window.__EVC_PERSISTENT_RADIO__) return;

  var file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var excluded = [
    'app-shell.html','login.html','register.html','forgot-password.html',
    'reset-password.html','verifier-email.html','404.html'
  ];
  if (excluded.indexOf(file) !== -1) return;

  var target = file + location.search + location.hash;
  location.replace('app-shell.html?page=' + encodeURIComponent(target));
})();
