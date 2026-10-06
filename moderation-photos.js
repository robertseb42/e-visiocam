// ============================================================
// MODÉRATION — Photos de profil à valider
// Chaque photo envoyée par un membre reste privée jusqu'à sa validation ici.
// ============================================================
(function () {
    var apercus = [];
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function badge(n) {
        var b = document.getElementById('photosBadge');
        if (!b) return;
        b.textContent = n; b.classList.toggle('hidden', !n);
    }
    async function compter() {
        try { var d = await apiCall('/avatars/pending'); badge(d.total || 0); } catch (e) {}
    }
    async function image(id, el) {
        try {
            var r = await fetch(API_URL + '/avatars/pending/' + id + '/image', { credentials: 'include' });
            if (!r.ok) return;
            var u = URL.createObjectURL(await r.blob());
            apercus.push(u);
            el.src = u;
        } catch (e) {}
    }
    async function charger() {
        var boite = document.getElementById('photosListe');
        if (!boite) return;
        apercus.forEach(function (u) { URL.revokeObjectURL(u); }); apercus = [];
        try {
            var d = await apiCall('/avatars/pending');
            var liste = d.avatars || [];
            badge(liste.length);
            if (!liste.length) { boite.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm col-span-full">Aucune photo à valider 🎉</p>'; return; }
            boite.innerHTML = liste.map(function (a) {
                return '<div class="rounded-2xl border border-slate-200 p-3 text-center bg-slate-50" data-photo="' + Number(a.userId) + '">' +
                    '<img alt="Photo de ' + esc(a.username) + '" class="w-full aspect-square rounded-xl object-cover bg-slate-200 mb-2">' +
                    '<p class="text-sm font-bold text-slate-900 truncate">' + esc(a.username) + '</p>' +
                    '<p class="text-[10px] text-slate-400 mb-2">' + esc(String(a.updatedAt || '').slice(0, 16)) + '</p>' +
                    '<div class="flex gap-2">' +
                        '<button type="button" data-ok class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600"><i class="fa-solid fa-check"></i> Valider</button>' +
                        '<button type="button" data-non class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600"><i class="fa-solid fa-xmark"></i> Refuser</button>' +
                    '</div></div>';
            }).join('');
            boite.querySelectorAll('[data-photo]').forEach(function (carte) { image(carte.getAttribute('data-photo'), carte.querySelector('img')); });
        } catch (e) {
            boite.innerHTML = '<p class="text-center text-rose-500 py-8 text-sm col-span-full">' + esc(e.message) + '</p>';
        }
    }
    document.addEventListener('click', async function (e) {
        var bouton = e.target.closest('#photosListe [data-ok], #photosListe [data-non]');
        if (!bouton) return;
        var carte = bouton.closest('[data-photo]');
        var id = carte.getAttribute('data-photo');
        var refuser = bouton.hasAttribute('data-non');
        var raison = '';
        if (refuser) {
            raison = prompt('Motif du refus (visible dans l’historique) :', 'Photo non conforme aux règles du site');
            if (raison === null) return;
        }
        bouton.disabled = true;
        try {
            await apiCall('/avatars/' + id + (refuser ? '/refuse' : '/approve'), { method: 'POST', body: JSON.stringify({ raison: raison }) });
            if (typeof showToast === 'function') showToast(refuser ? 'Photo refusée et supprimée' : 'Photo validée', 'success');
            carte.remove();
            compter();
            var boite = document.getElementById('photosListe');
            if (boite && !boite.querySelector('[data-photo]')) charger();
        } catch (err) {
            bouton.disabled = false;
            if (typeof showToast === 'function') showToast(err.message, 'error'); else alert(err.message);
        }
    });
    window.EvcPhotos = { charger: charger };
    // Bouton « Rafraichir » (data-recharger plutôt qu'un attribut onclick, bloqué par la CSP stricte)
    document.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('[data-recharger="photos"]')) charger();
    });
    compter();
})();
