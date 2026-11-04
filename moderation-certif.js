// ============================================================
// MODÉRATION — Certifications de profil (onglet « Photos de profil »)
// La photo envoyée (geste + code + pseudo) est comparée au profil ; Valider ou Refuser la supprime.
// ============================================================
(function () {
    'use strict';
    var boite = document.getElementById('certifListe');
    if (!boite || typeof apiCall !== 'function') return;
    var apercus = [];
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function base() { return String(API_URL).replace(/\/api$/, ''); }
    function badge(n) {
        var b = document.getElementById('certifBadge'); if (b) { b.textContent = n + ' ✔'; b.classList.toggle('hidden', !n); }
        var s = document.getElementById('certifSection'); if (s) s.hidden = !n;
    }
    async function image(id, el) {
        try {
            var r = await fetch(API_URL + '/certification/' + id + '/image', { credentials: 'include' });
            if (!r.ok) return;
            var u = URL.createObjectURL(await r.blob()); apercus.push(u); el.src = u;
        } catch (e) {}
    }
    async function charger() {
        apercus.forEach(function (u) { URL.revokeObjectURL(u); }); apercus = [];
        try {
            var d = await apiCall('/certification/attente');
            var liste = d.demandes || [];
            badge(liste.length);
            boite.innerHTML = liste.map(function (c) {
                return '<div class="rounded-2xl border border-slate-200 p-3 bg-slate-50" data-certif="' + Number(c.userId) + '">' +
                    '<p class="text-sm font-bold text-slate-900 mb-1">' + esc(c.username) + (c.gender === 'couple' ? ' <span class="text-xs font-semibold text-slate-500">(couple : les deux partenaires)</span>' : '') + '</p>' +
                    '<p class="text-xs text-slate-600 mb-2">Geste : <b>' + esc(c.geste) + '</b> · Code : <b class="text-base">' + esc(c.code) + '</b></p>' +
                    '<div class="grid grid-cols-3 gap-2 mb-2"><img alt="Photo de certification de ' + esc(c.username) + '" class="col-span-2 w-full rounded-xl object-contain bg-slate-200 max-h-72">' +
                    '<div class="text-center"><p class="text-[10px] text-slate-500 mb-1">Profil</p>' + (c.avatar ? '<img alt="" src="' + esc(base() + c.avatar) + '" class="w-full aspect-square rounded-xl object-cover">' : '<p class="text-[11px] text-slate-400">Pas de photo de profil</p>') + '</div></div>' +
                    '<div class="flex gap-2"><button type="button" data-cok class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600">✔ Certifier</button>' +
                    '<button type="button" data-cnon class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600">✕ Refuser</button></div>' +
                    '<div data-cmotif class="mt-2" style="display:none"><div class="grid gap-2"><input type="text" maxlength="200" class="w-full px-3 py-2 rounded-lg border border-slate-300 text-xs" placeholder="Motif (vu par le membre) : ex. code illisible, visage caché…">' +
                    '<button type="button" data-cnon-ok class="py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white">Confirmer le refus</button></div></div></div>';
            }).join('');
            boite.querySelectorAll('[data-certif]').forEach(function (c) { image(c.getAttribute('data-certif'), c.querySelector('img')); });
        } catch (e) { badge(0); }
    }
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('#certifListe [data-cok], #certifListe [data-cnon], #certifListe [data-cnon-ok]'); if (!b) return;
        var carte = b.closest('[data-certif]'), id = carte.getAttribute('data-certif');
        if (b.hasAttribute('data-cnon')) { var m = carte.querySelector('[data-cmotif]'), ouvrir = m.style.display === 'none'; m.style.display = ouvrir ? '' : 'none'; if (ouvrir) m.querySelector('input').focus(); return; }
        var refuser = b.hasAttribute('data-cnon-ok');
        b.disabled = true;
        try {
            await apiCall('/certification/' + id + (refuser ? '/refuser' : '/valider'), { method: 'POST', body: JSON.stringify({ motif: refuser ? carte.querySelector('[data-cmotif] input').value : '' }) });
            if (typeof showToast === 'function') showToast(refuser ? 'Certification refusée, photo supprimée' : 'Profil certifié, photo supprimée', 'success');
            carte.remove(); charger();
        } catch (err) { b.disabled = false; if (typeof showToast === 'function') showToast(err.message, 'error'); }
    });
    // Recharge avec l'onglet « Photos de profil » et son bouton « Rafraîchir »
    if (window.EvcPhotos) { var avant = window.EvcPhotos.charger; window.EvcPhotos.charger = function () { charger(); return avant.apply(this, arguments); }; }
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-recharger="photos"]')) charger(); });
    charger();
})();
