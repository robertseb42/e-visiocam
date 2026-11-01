// Page bienvenue.html : étape d'accueil juste après l'inscription
// bienvenue.html?redirect=<page du site> : la page demandée avant l'inscription (ex. chat.html?theme=couples)
(function () {
    'use strict';
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=bienvenue.html';
        return;
    }

    // Seulement une page du site (même règle que pages/login.js et google-login.js)
    const demande = new URLSearchParams(window.location.search).get('redirect');
    const redirect = demande && /^[a-z0-9_-]+\.html([?#].*)?$/i.test(demande) && !/^bienvenue\.html/i.test(demande) ? demande : '';

    const user = getCurrentUser();
    if (user && user.username) document.getElementById('bvPseudo').textContent = ' ' + user.username;

    document.getElementById('bvPasser').href = redirect || 'index.html';

    // 1. Salon : si le visiteur venait d'un salon, c'est le bouton principal
    const btn = document.getElementById('bvSalonBtn');
    let slug = '';
    if (redirect) {
        const m = redirect.match(/^chat\.html\?(.*)$/i);
        if (m) {
            const q = new URLSearchParams(m[1]);
            slug = (q.get('theme') || q.get('salon') || '').trim();
        }
        btn.href = redirect;
        if (!slug) btn.textContent = 'Continuer';
    }
    if (slug) {
        btn.textContent = 'Continuer vers le salon';
        apiCall('/salons/list').then(function (d) {
            const s = (d.salons || []).find(function (x) { return x.slug === slug || x.name === slug; });
            if (!s) return;
            btn.textContent = 'Continuer vers ' + s.name;
            if (s.icon) document.getElementById('bvSalonIcone').textContent = s.icon;
            document.getElementById('bvSalonTexte').textContent = 'Vous alliez rejoindre ' + s.name + ' : il vous attend. Webcam et micro restent facultatifs.';
        }).catch(function () {});
    }

    // 3. Solde réel de crédits. Le bonus de bienvenue est versé par le serveur à la première
    //    connexion temps réel (socket ouvert par nav-auth.js) : on relit le solde quand il arrive.
    const solde = document.getElementById('bvSolde');
    let essais = 0;
    function lireSolde() {
        apiCall('/credits/balance').then(function (b) {
            if (typeof b.balance !== 'number') { solde.textContent = '—'; return; }
            solde.textContent = b.balance;
            if (b.balance === 0 && ++essais <= 3) setTimeout(lireSolde, 2000);
        }).catch(function () { solde.textContent = '—'; });
    }
    lireSolde();
    window.addEventListener('evc:recompense', lireSolde);
})();
