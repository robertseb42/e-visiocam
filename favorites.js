// ============================================================
// E-VISIOCAM - Favoris (cœur sur les modèles et les salons)
// ------------------------------------------------------------
// Un bouton  <button data-fav="model:12" aria-pressed="false">…</button>
// (ou data-fav="salon:musique") devient un cœur cliquable :
// ajoute / retire le favori, redirige vers la connexion si besoin.
// Utilise auth-api.js (apiCall, isLoggedIn).
// ============================================================
(function () {
    'use strict';

    function majBouton(b, actif) {
        b.setAttribute('aria-pressed', actif ? 'true' : 'false');
        b.title = actif ? 'Retirer des favoris' : 'Ajouter aux favoris';
        b.setAttribute('aria-label', b.title);
        var i = b.querySelector('i');
        if (i) i.className = (actif ? 'fa-solid' : 'fa-regular') + ' fa-heart';
        b.classList.toggle('is-fav', actif);
    }

    async function basculer(b) {
        if (typeof isLoggedIn === 'function' && !isLoggedIn()) {
            window.location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
            return;
        }
        var parts = (b.getAttribute('data-fav') || '').split(':');
        if (parts.length !== 2) return;
        var actif = b.getAttribute('aria-pressed') === 'true';
        b.disabled = true;
        try {
            await apiCall('/favorites/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]), { method: actif ? 'DELETE' : 'PUT', body: actif ? undefined : '{}' });
            majBouton(b, !actif);
            var n = b.querySelector('[data-fav-count]');
            if (n) n.textContent = Math.max(0, (parseInt(n.textContent, 10) || 0) + (actif ? -1 : 1));
            if (typeof showToast === 'function') showToast(actif ? 'Retiré de vos favoris' : '❤️ Ajouté à vos favoris');
            document.dispatchEvent(new CustomEvent('evc:favori', { detail: { type: parts[0], key: parts[1], favorite: !actif } }));
        } catch (e) {
            if (typeof showToast === 'function') showToast(e.message || 'Erreur', 'error');
        } finally { b.disabled = false; }
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-fav]');
        if (!b) return;
        e.preventDefault(); e.stopPropagation();
        basculer(b);
    });

    window.EvcFav = { majBouton: majBouton };
})();
