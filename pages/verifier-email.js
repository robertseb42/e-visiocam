// Extrait de verifier-email.html (CSP stricte : plus de script inline dans les pages)
(function () {
    var API = (typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api');
    var jeton = new URLSearchParams(location.search).get('t') || '';
    // On retire le jeton de l'adresse affichée (historique, captures d'écran)
    try { history.replaceState(null, '', 'verifier-email.html'); } catch (e) {}
    var $ = function (id) { return document.getElementById(id); };
    function montrer(id) { $('enCours').classList.add('hidden'); $(id).classList.remove('hidden'); }
    function echec(msg) { $('koTexte').textContent = msg; montrer('ko'); }

    if (!/^[a-f0-9]{64}$/.test(jeton)) { echec('Ce lien est incomplet. Copiez-le en entier depuis l’e-mail reçu, ou demandez-en un nouveau ci-dessous.'); }
    else {
        fetch(API + '/auth/verify-email', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: jeton }) })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                if (!x.ok) return echec(x.d.error || 'Ce lien n’est pas valide.');
                var connecte = false;
                try { connecte = typeof isLoggedIn === 'function' && isLoggedIn(); } catch (e) {}
                if (x.d.purpose === 'change') {
                    $('okTitre').textContent = 'Nouvelle adresse confirmée';
                    $('okTexte').textContent = 'L’adresse e-mail de votre compte a bien été modifiée.';
                    if (connecte) { $('okBouton').textContent = 'Retour à mon compte'; $('okBouton').href = 'compte.html'; }
                } else {
                    $('okTexte').textContent = x.d.deja
                        ? 'Votre adresse était déjà confirmée. Vous pouvez vous connecter.'
                        : 'Merci ' + (x.d.username || '') + ' ! Votre compte est activé : vous pouvez maintenant vous connecter.';
                }
                montrer('ok');
            })
            .catch(function () { echec('Impossible de joindre le serveur. Vérifiez votre connexion et rechargez la page.'); });
    }

    $('renvoi').addEventListener('submit', function (e) {
        e.preventDefault();
        var b = $('renvoiBtn'), msg = $('renvoiMsg'), login = $('login').value.trim();
        if (!login) return;
        b.disabled = true; msg.className = 'text-xs text-center text-slate-500 min-h-[1rem]'; msg.textContent = 'Envoi…';
        fetch(API + '/auth/resend-verification', { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ login: login }) })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                msg.textContent = x.ok ? x.d.message : (x.d.error || 'Envoi impossible');
                msg.className = 'text-xs text-center font-semibold min-h-[1rem] ' + (x.ok ? 'text-emerald-600' : 'text-rose-600');
            })
            .catch(function () { msg.textContent = 'Impossible de joindre le serveur.'; msg.className = 'text-xs text-center text-rose-600 min-h-[1rem]'; })
            .then(function () { setTimeout(function () { b.disabled = false; }, 5000); });
    });
})();
