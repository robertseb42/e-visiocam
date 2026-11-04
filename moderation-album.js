// ============================================================
// MODÉRATION — Albums privés (onglet « Photos de profil »)
// Publication immédiate pour les membres autorisés ; l'équipe contrôle ici (photos signalées en tête, déjà masquées).
// 🚨 Contenu illégal : quarantaine de tout l'album (preuve), bannissement, puis signalement PHAROS par l'équipe.
// ============================================================
(function () {
    'use strict';
    var boite = document.getElementById('albumListe');
    if (!boite || typeof apiCall !== 'function') return;
    var apercus = [];
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function base() { return String(API_URL).replace(/\/api\/?$/, ''); }
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
    function badge(n) {
        var b = document.getElementById('albumBadge'); if (b) { b.textContent = n + ' 🔒'; b.classList.toggle('hidden', !n); }
        var s = document.getElementById('albumSection'); if (s) s.hidden = !n;
    }
    function image(url, el) {
        fetch(base() + url, { credentials: 'include' }).then(function (r) { return r.ok ? r.blob() : null; })
            .then(function (b) { if (b) { var u = URL.createObjectURL(b); apercus.push(u); el.src = u; } }).catch(function () {});
    }
    async function charger() {
        apercus.forEach(function (u) { URL.revokeObjectURL(u); }); apercus = [];
        try {
            var d = await apiCall('/albums/equipe/a-revoir');
            var liste = d.photos || [];
            badge(liste.length);
            boite.innerHTML = liste.map(function (p) {
                return '<div class="rounded-2xl border ' + (p.signalements.length ? 'border-rose-400' : 'border-slate-200') + ' p-3 bg-slate-50" data-alb="' + Number(p.id) + '">' +
                    '<img alt="Photo d’album de ' + esc(p.username) + '" class="w-full aspect-square rounded-xl object-cover bg-slate-200 mb-2">' +
                    '<p class="text-sm font-bold text-slate-900 truncate">' + esc(p.username) + '</p>' +
                    (p.signalements.length ? '<p class="text-[11px] font-bold text-rose-500 mb-1">🚩 Signalée : ' + esc(p.signalements.join(', ')) + '</p>' : '<p class="text-[11px] text-slate-400 mb-1">Nouvelle photo (déjà visible)</p>') +
                    '<div class="grid grid-cols-2 gap-2"><button type="button" data-aok class="py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white hover:bg-emerald-600">✔ Valider</button>' +
                    '<button type="button" data-anon class="py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white hover:bg-rose-600">✕ Retirer</button></div>' +
                    '<button type="button" data-ailleg class="mt-2 w-full py-1.5 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-black">🚨 Illégal (mineur, escorting…)</button></div>';
            }).join('');
            boite.querySelectorAll('[data-alb]').forEach(function (c) { var p = liste.find(function (x) { return String(x.id) === c.getAttribute('data-alb'); }); image(p.url, c.querySelector('img')); });
        } catch (e) { badge(0); }
    }
    var confirmer = {};
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('#albumListe [data-aok], #albumListe [data-anon], #albumListe [data-ailleg]'); if (!b) return;
        var carte = b.closest('[data-alb]'), id = carte.getAttribute('data-alb');
        if (b.hasAttribute('data-ailleg') && !confirmer[id]) { confirmer[id] = 1; b.textContent = 'Confirmer : quarantaine + bannissement'; return; }
        b.disabled = true;
        try {
            if (b.hasAttribute('data-aok')) { await apiCall('/albums/equipe/' + id + '/ok', { method: 'POST', body: '{}' }); toast('Photo validée', 'success'); }
            if (b.hasAttribute('data-anon')) { await apiCall('/albums/equipe/' + id, { method: 'DELETE', body: JSON.stringify({ raison: 'Photo non conforme aux règles du site' }) }); toast('Photo retirée et supprimée', 'success'); }
            if (b.hasAttribute('data-ailleg')) {
                var r = await apiCall('/albums/equipe/' + id + '/illegal', { method: 'POST', body: JSON.stringify({ raison: 'Contenu illégal dans l’album privé' }) });
                toast('Album en quarantaine' + (r.sanction ? ' · ' + r.sanction : '') + '. Signalez-le maintenant sur PHAROS.', 'success');
                window.open(r.pharos || 'https://www.internet-signalement.gouv.fr', '_blank', 'noopener');
            }
            charger();
        } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });
    if (window.EvcPhotos) { var avant = window.EvcPhotos.charger; window.EvcPhotos.charger = function () { charger(); return avant.apply(this, arguments); }; }
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-recharger="photos"]')) charger(); });
    charger();
})();
