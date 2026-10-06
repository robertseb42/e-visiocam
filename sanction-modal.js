// ============================================================
// E-VISIOCAM — fenêtre de sanction (Kick / Ban / Mute) avec durée au choix
// Utilisée par la page Modération et le panneau Super Admin.
//   EvcSanction.ouvrir({ id, username, type: 'kick'|'ban'|'mute', onDone(resultat) })
//   EvcSanction.etiquette(user) → HTML de l'état (« Banni jusqu'au… », « Muet… »)
//   EvcSanction.lever(id, type, onDone)
// ============================================================
(function () {
    var CHOIX = {
        kick: { titre: 'Expulser', verbe: 'Expulser', couleur: '#e11d48',
            aide: 'Le membre est déconnecté tout de suite et ne peut pas revenir pendant la durée choisie.',
            durees: [[0, 'Expulser seulement (peut revenir)'], [60, '1 heure'], [1440, '24 heures'], [4320, '3 jours'], [10080, '7 jours']], autre: true, defaut: 60 },
        ban: { titre: 'Bannir', verbe: 'Bannir', couleur: '#b91c1c',
            aide: 'Le compte est bloqué : connexion impossible jusqu\'à la fin du bannissement. Un bannissement temporaire se lève tout seul.',
            durees: [[1440, '1 jour'], [4320, '3 jours'], [10080, '7 jours'], [43200, '30 jours'], [null, 'Définitif']], autre: true, defaut: 10080 },
        mute: { titre: 'Rendre muet', verbe: 'Rendre muet', couleur: '#ea580c',
            aide: 'Le membre reste connecté mais ne peut plus écrire, ni dans les salons ni en message privé.',
            durees: [[10, '10 minutes'], [60, '1 heure'], [1440, '24 heures'], [4320, '3 jours']], autre: true, defaut: 60 }
    };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var superAdmin = function () { try { return typeof isSuperAdmin === 'function' ? isSuperAdmin() : ((getCurrentUser() || {}).role === 'super_admin'); } catch (e) { return false; } };
    var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); else alert(m); };
    var fin = function (iso) {
        return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(' ', ' à ');
    };

    function fermer() { var m = document.getElementById('evcSanction'); if (m) m.remove(); }

    function ouvrir(opt) {
        fermer();
        var c = CHOIX[opt.type];
        if (!c) return;
        var sa = superAdmin();
        var lignes = c.durees.map(function (d, i) {
            var interdit = d[0] === null && !sa;
            return '<label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm cursor-pointer hover:bg-slate-50' + (interdit ? ' opacity-50 cursor-not-allowed' : '') + '">' +
                '<input type="radio" name="evcDuree" value="' + (d[0] === null ? 'def' : d[0]) + '"' + (d[0] === c.defaut ? ' checked' : '') + (interdit ? ' disabled' : '') + '> ' +
                esc(d[1]) + (interdit ? ' <span class="text-[10px] text-slate-400">(Super Admin)</span>' : '') + '</label>';
        }).join('');
        if (c.autre) {
            lignes += '<label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm cursor-pointer hover:bg-slate-50">' +
                '<input type="radio" name="evcDuree" value="autre"> Autre : ' +
                '<input id="evcAutreN" type="number" min="1" max="3650" value="2" class="w-16 px-2 py-1 rounded-lg border border-slate-200 text-sm bg-transparent">' +
                '<select id="evcAutreU" class="px-2 py-1 rounded-lg border border-slate-200 text-sm bg-transparent">' +
                (opt.type === 'ban' ? '' : '<option value="1">minutes</option><option value="60">heures</option>') +
                '<option value="1440" selected>jours</option></select></label>';
        }
        var m = document.createElement('div');
        m.id = 'evcSanction';
        m.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4';
        m.innerHTML = '<form class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto">' +
            '<h3 class="text-lg font-extrabold text-slate-900">' + esc(c.titre) + ' ' + esc(opt.username || '') + '</h3>' +
            '<p class="text-xs text-slate-500 mt-1 mb-4">' + esc(c.aide) + (sa ? '' : ' Un modérateur peut sanctionner 30 jours au plus.') + ' Le membre reçoit un e-mail détaillé (durée, motif, lien pour contester).</p>' +
            '<p class="text-xs font-bold text-slate-700 mb-2">Durée</p><div class="space-y-1.5 mb-4">' + lignes + '</div>' +
            '<label class="block text-xs font-bold text-slate-700 mb-1">Motif (visible par le membre)</label>' +
            '<input id="evcMotif" type="text" maxlength="300" placeholder="Ex. : insultes répétées" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-4 bg-transparent">' +
            '<div class="flex gap-2"><button type="button" data-annuler class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">Annuler</button>' +
            '<button type="submit" class="flex-1 py-2.5 rounded-xl text-white text-sm font-bold" style="background:' + c.couleur + '">' + esc(c.verbe) + '</button></div></form>';
        document.body.appendChild(m);
        m.querySelector('[data-annuler]').onclick = fermer;
        m.addEventListener('click', function (e) { if (e.target === m) fermer(); });
        var autreN = m.querySelector('#evcAutreN');
        if (autreN) autreN.addEventListener('focus', function () { m.querySelector('input[value="autre"]').checked = true; });
        m.querySelector('form').onsubmit = function (e) {
            e.preventDefault();
            var v = (m.querySelector('input[name="evcDuree"]:checked') || {}).value;
            var minutes;
            if (v === 'def') minutes = null;
            else if (v === 'autre') minutes = Math.round(Number(autreN.value) * Number(m.querySelector('#evcAutreU').value));
            else minutes = Number(v);
            if (v === undefined || (minutes !== null && !(minutes >= 0))) { toast('Choisissez une durée', 'error'); return; }
            if (minutes === null && !confirm('Bannir ' + (opt.username || 'ce membre') + ' définitivement ?')) return;
            var bouton = m.querySelector('button[type="submit"]'); bouton.disabled = true;
            apiCall('/mod/users/' + opt.id + '/sanction', { method: 'POST', body: JSON.stringify({ type: opt.type, minutes: minutes, reason: m.querySelector('#evcMotif').value.trim() }) })
                .then(function (r) { fermer(); toast(r.message || 'Sanction appliquée', 'warning'); if (opt.onDone) opt.onDone(r); })
                .catch(function (err) { bouton.disabled = false; toast(err.message, 'error'); });
        };
    }

    // État affiché dans les listes de membres
    function etiquette(u) {
        var maintenant = Date.now(), out = [];
        if (u.status === 'banned') out.push('<span class="text-rose-600 text-xs font-bold">🔨 ' + (u.banned_until ? 'Banni jusqu\'au ' + fin(u.banned_until) : 'Banni définitivement') + '</span>');
        if (u.kicked_until && Date.parse(u.kicked_until) > maintenant) out.push('<span class="text-rose-500 text-xs font-bold">🚪 Exclu jusqu\'au ' + fin(u.kicked_until) + '</span>');
        if (u.muted_until && Date.parse(u.muted_until) > maintenant) out.push('<span class="text-orange-500 text-xs font-bold">🔇 Muet jusqu\'au ' + fin(u.muted_until) + '</span>');
        return out.length ? out.join('<br>') : '<span class="text-emerald-600 text-xs font-bold">✅ Actif</span>';
    }

    function enCours(u) {
        var t = [], n = Date.now();
        if (u.status === 'banned') t.push('ban');
        if (u.kicked_until && Date.parse(u.kicked_until) > n) t.push('kick');
        if (u.muted_until && Date.parse(u.muted_until) > n) t.push('mute');
        return t;
    }

    function lever(id, type, onDone) {
        var noms = { ban: 'le bannissement', kick: 'l\'exclusion', mute: 'la sourdine' };
        if (!confirm('Lever ' + noms[type] + ' ?')) return;
        apiCall('/mod/users/' + id + '/lift', { method: 'POST', body: JSON.stringify({ type: type }) })
            .then(function () { toast('Sanction levée'); if (onDone) onDone(); })
            .catch(function (err) { toast(err.message, 'error'); });
    }

    window.EvcSanction = { ouvrir: ouvrir, etiquette: etiquette, enCours: enCours, lever: lever, fermer: fermer };
})();
