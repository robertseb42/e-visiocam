// ============================================================
// E-VISIOCAM — fenêtre « Offrir des crédits » (Super Admin et modérateurs)
//   EvcOffrir.ouvrir({ username, membres: [pseudos], onDone(resultat) })
// Le Super Admin offre jusqu'à 5 000 crédits par envoi ; un modérateur suit
// les plafonds réglés par le Super Admin (par envoi et par jour).
// ============================================================
(function () {
    var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };

    function fermer() { var m = document.getElementById('evcOffrir'); if (m) m.remove(); }

    function ouvrir(opt) {
        opt = opt || {};
        fermer();
        var m = document.createElement('div');
        m.id = 'evcOffrir';
        m.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4';
        var liste = (opt.membres || []).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
        m.innerHTML = '<form class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">' +
            '<h3 class="text-lg font-extrabold text-slate-900">🎁 Offrir des crédits</h3>' +
            '<p class="text-xs text-slate-500 mt-1 mb-4">Pour remercier un membre qui le mérite. Il est prévenu tout de suite et voit votre petit mot dans son historique.</p>' +
            '<label class="block text-xs font-bold text-slate-700 mb-1">Membre</label>' +
            '<input data-nom type="text" list="evcOffrirListe" maxlength="30" required autocomplete="off" placeholder="Pseudo" value="' + esc(opt.username || '') + '" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-3 bg-transparent">' +
            '<datalist id="evcOffrirListe">' + liste + '</datalist>' +
            '<label class="block text-xs font-bold text-slate-700 mb-1">Crédits</label>' +
            '<div class="flex gap-1.5 mb-1 flex-wrap" data-rapides></div>' +
            '<input data-montant type="number" min="1" max="5000" step="1" required placeholder="Nombre de crédits" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-1 bg-transparent">' +
            '<p data-quota class="text-[11px] text-slate-500 mb-3">&nbsp;</p>' +
            '<label class="block text-xs font-bold text-slate-700 mb-1">Petit mot (visible par le membre)</label>' +
            '<input data-raison type="text" maxlength="120" required placeholder="Ex. : merci pour ta bonne humeur dans le salon" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-4 bg-transparent">' +
            '<div class="flex gap-2"><button type="button" data-annuler class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">Annuler</button>' +
            '<button type="submit" class="flex-1 py-2.5 rounded-xl text-sm font-bold" style="background:#ffe500;color:#111113">Offrir</button></div></form>';
        document.body.appendChild(m);
        var f = m.querySelector('form');
        var montant = m.querySelector('[data-montant]');
        m.querySelector('[data-annuler]').onclick = fermer;
        m.addEventListener('click', function (e) { if (e.target === m) fermer(); });
        document.addEventListener('keydown', function esc_(e) { if (e.key === 'Escape') { fermer(); document.removeEventListener('keydown', esc_); } });
        (opt.username ? montant : m.querySelector('[data-nom]')).focus();

        // Ce que je peux offrir (plafonds modérateur)
        apiCall('/mod/rewards/quota').then(function (q) {
            var max = q.illimite ? 5000 : Math.min(q.parEnvoi, q.reste);
            montant.max = Math.max(1, max);
            var p = m.querySelector('[data-quota]');
            if (q.illimite) p.textContent = 'Super Admin : jusqu’à 5 000 crédits par envoi.';
            else if (!q.parEnvoi || !q.parJour) p.innerHTML = '<span style="color:#e11d48">Le Super Admin n’autorise pas les modérateurs à offrir des crédits pour le moment.</span>';
            else p.textContent = q.parEnvoi + ' crédits au plus par envoi · il vous reste ' + q.reste + ' / ' + q.parJour + ' crédits à offrir aujourd’hui.';
            var rapides = [10, 25, 50, 100, 500].filter(function (v) { return v <= max; });
            m.querySelector('[data-rapides]').innerHTML = rapides.map(function (v) {
                return '<button type="button" data-v="' + v + '" class="px-2.5 py-1 rounded-lg border border-slate-200 text-xs font-bold hover:bg-slate-50">' + v + '</button>';
            }).join('');
            m.querySelectorAll('[data-v]').forEach(function (b) { b.onclick = function () { montant.value = b.dataset.v; }; });
        }).catch(function () {});

        f.onsubmit = function (e) {
            e.preventDefault();
            var btn = f.querySelector('[type=submit]');
            btn.disabled = true; btn.style.opacity = '.6';
            apiCall('/mod/rewards/offrir', { method: 'POST', body: JSON.stringify({
                username: m.querySelector('[data-nom]').value.trim(), montant: Number(montant.value), raison: m.querySelector('[data-raison]').value
            }) }).then(function (r) {
                toast('🎁 ' + r.offert + ' crédits offerts à ' + r.username + ' (nouveau solde : ' + r.solde + ')', 'success');
                fermer();
                if (typeof opt.onDone === 'function') opt.onDone(r);
            }).catch(function (err) {
                toast(err.message, 'error');
                btn.disabled = false; btn.style.opacity = '1';
            });
        };
    }

    window.EvcOffrir = { ouvrir: ouvrir, fermer: fermer };
})();
