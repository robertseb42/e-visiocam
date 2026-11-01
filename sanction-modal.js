// ============================================================
// E-VISIOCAM — fenêtre de sanction (Kick / Ban / Mute) avec durée au choix
// Utilisée par la page Modération et le panneau Super Admin.
//   EvcSanction.ouvrir({ id, username, type: 'kick'|'ban'|'mute', onDone(resultat) })
//   EvcSanction.ouvrir({ id, username, choisirType: true, onDone })   → le type se choisit dans la fenêtre
//   Le motif est obligatoire (5 caractères au moins), comme côté serveur.
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

    var MOTIF_MIN = 5;
    var retourFocus = null;
    function fermer() {
        var m = document.getElementById('evcSanction');
        if (m) { m.remove(); if (retourFocus && retourFocus.focus) { try { retourFocus.focus(); } catch (e) {} } retourFocus = null; }
    }

    function ouvrir(opt) {
        var prec = opt._retour || document.activeElement;
        retourFocus = null;
        fermer();
        retourFocus = prec;
        opt._retour = prec;
        if (opt.choisirType && !CHOIX[opt.type]) opt.type = 'mute';
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
        var types = '';
        if (opt.choisirType) {
            types = '<p class="text-xs font-bold text-slate-700 mb-2">Type de sanction</p><div class="flex gap-2 flex-wrap mb-4" role="radiogroup" aria-label="Type de sanction">' +
                ['mute', 'kick', 'ban'].map(function (t) {
                    return '<label class="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm cursor-pointer hover:bg-slate-50' + (t === opt.type ? ' font-bold' : '') + '">' +
                        '<input type="radio" name="evcType" value="' + t + '"' + (t === opt.type ? ' checked' : '') + '> ' + esc(CHOIX[t].titre) + '</label>';
                }).join('') + '</div>';
        }
        var m = document.createElement('div');
        m.id = 'evcSanction';
        m.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4';
        m.innerHTML = '<form novalidate class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="evcSanctionTitre">' +
            '<h3 id="evcSanctionTitre" class="text-lg font-extrabold text-slate-900">' + esc(c.titre) + ' ' + esc(opt.username || '') + '</h3>' + types +
            '<p class="text-xs text-slate-500 mt-1 mb-4">' + esc(c.aide) + (sa ? '' : ' Un modérateur peut sanctionner 30 jours au plus.') + ' Le membre reçoit un e-mail détaillé (durée, motif, lien pour contester).</p>' +
            '<p class="text-xs font-bold text-slate-700 mb-2">Durée</p><div class="space-y-1.5 mb-4">' + lignes + '</div>' +
            '<label for="evcMotif" class="block text-xs font-bold text-slate-700 mb-1">Motif <span class="text-rose-600">*</span> (visible par le membre, ' + MOTIF_MIN + ' caractères au moins)</label>' +
            '<input id="evcMotif" type="text" maxlength="300" required minlength="' + MOTIF_MIN + '" aria-describedby="evcMotifErr" placeholder="Ex. : insultes répétées" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-transparent">' +
            '<p id="evcMotifErr" class="text-xs text-rose-600 mt-1 mb-3" aria-live="polite"></p>' +
            '<div class="flex gap-2"><button type="button" data-annuler class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">Annuler</button>' +
            '<button type="submit" class="flex-1 py-2.5 rounded-xl text-white text-sm font-bold" style="background:' + c.couleur + '">' + esc(c.verbe) + '</button></div></form>';
        document.body.appendChild(m);
        m.querySelector('[data-annuler]').onclick = fermer;
        m.addEventListener('click', function (e) { if (e.target === m) fermer(); });
        // Clavier : Échap ferme, Tab reste dans la fenêtre
        m.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') { e.preventDefault(); fermer(); return; }
            if (e.key !== 'Tab') return;
            var f = Array.prototype.filter.call(m.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])'), function (x) { return !x.disabled && x.offsetParent !== null; });
            if (!f.length) return;
            if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
            else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        });
        // Changer de type : la fenêtre se redessine avec les durées de ce type (le motif déjà écrit est gardé)
        m.querySelectorAll('input[name="evcType"]').forEach(function (r) {
            r.addEventListener('change', function () {
                var motif = m.querySelector('#evcMotif').value;
                var o = Object.assign({}, opt, { type: r.value });
                ouvrir(o);
                var nm = document.getElementById('evcSanction');
                if (nm) { nm.querySelector('#evcMotif').value = motif; var nr = nm.querySelector('input[name="evcType"][value="' + r.value + '"]'); if (nr) nr.focus(); }
            });
        });
        setTimeout(function () { var premier = m.querySelector('input[name="evcType"]:checked') || m.querySelector('input[name="evcDuree"]:checked') || m.querySelector('#evcMotif'); if (premier) premier.focus(); }, 0);
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
            var motif = m.querySelector('#evcMotif').value.trim();
            if (motif.length < MOTIF_MIN) {
                m.querySelector('#evcMotifErr').textContent = 'Le motif est obligatoire (' + MOTIF_MIN + ' caractères au moins).';
                m.querySelector('#evcMotif').setAttribute('aria-invalid', 'true');
                m.querySelector('#evcMotif').focus();
                return;
            }
            if (minutes === null && !confirm('Bannir ' + (opt.username || 'ce membre') + ' définitivement ?')) return;
            var bouton = m.querySelector('button[type="submit"]'); bouton.disabled = true;
            apiCall('/mod/users/' + opt.id + '/sanction', { method: 'POST', body: JSON.stringify({ type: opt.type, minutes: minutes, motif: motif, reason: motif }) })
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
