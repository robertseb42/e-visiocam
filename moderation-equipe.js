// ============================================================
// MODÉRATION — Candidatures « Devenir modérateur » et suivi des stagiaires
// ============================================================
(function () {
    var NOMS = { 'matin': 'Matin', 'midi': 'Midi', 'apres-midi': 'Après-midi', 'soir': 'Soir', 'nuit': 'Nuit', 'week-end': 'Week-end' };
    var superAdmin = false;
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function date(d) {
        if (!d) return '';
        var x = new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(String(d)) ? '' : 'Z'));
        return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    }
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'success'); else alert(m); }
    function badge(n) {
        var b = document.getElementById('candidaturesBadge');
        if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    }
    function photo(m) {
        var u = m && typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        return u ? '<img src="' + esc(u) + '" alt="" class="w-12 h-12 rounded-full object-cover bg-slate-200" style="flex:none">'
                 : '<div class="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-500" style="flex:none">' + esc(((m && m.username) || '?').charAt(0).toUpperCase()) + '</div>';
    }

    async function compter() {
        try { var d = await apiCall('/equipe/candidatures/count'); badge(d.pending || 0); } catch (e) {}
    }

    // Bandeau « vous êtes stagiaire » en haut de l'espace modérateur
    async function bandeau() {
        try {
            var d = await apiCall('/equipe/candidature');
            if (!d.stage) return;
            var b = document.getElementById('bandeauStagiaire');
            if (!b) return;
            b.innerHTML = '<strong>🎓 Vous êtes modérateur stagiaire</strong> jusqu’au ' + esc(date(d.stage.fin)) +
                '. Vous pouvez avertir, rendre muet ou expulser pour <strong>60 minutes au plus</strong>. Pour un bannissement, une contestation ou la liste des mots interdits, faites appel à un modérateur confirmé.';
            b.classList.remove('hidden');
        } catch (e) {}
    }

    function carte(c) {
        var m = c.membre || {};
        var alerte = m.sanctions ? '<span class="text-rose-600 font-bold">' + m.sanctions + ' sanction(s) au total</span>' : '<span class="text-emerald-600 font-bold">Aucune sanction</span>';
        var actions = '';
        if (c.status === 'pending') {
            actions = '<div class="flex flex-wrap gap-2 mt-3">' +
                (m.id ? '<a href="messages.html?ecrire=' + Number(m.id) + '" target="_blank" class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-800"><i class="fa-regular fa-envelope"></i> Écrire au candidat</a>' : '') +
                '<button type="button" data-avis class="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-200 text-slate-800"><i class="fa-regular fa-comment"></i> Ajouter un avis</button>' +
                (superAdmin ? '<button type="button" data-accepter class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white"><i class="fa-solid fa-check"></i> Accepter (stage 3 semaines)</button>' +
                              '<button type="button" data-refuser class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white"><i class="fa-solid fa-xmark"></i> Refuser</button>' : '') +
                '</div>';
        }
        var decision = c.status !== 'pending' ? '<p class="text-xs text-slate-500 mt-2">' +
            ({ accepted: '✅ Acceptée', refused: '❌ Refusée', withdrawn: '↩️ Retirée par le candidat' }[c.status] || c.status) +
            (c.decidedAt ? ' le ' + esc(date(c.decidedAt)) : '') + (c.decidePar ? ' par ' + esc(c.decidePar) : '') + (c.note ? ' — « ' + esc(c.note) + ' »' : '') + '</p>' : '';
        return '<div class="rounded-2xl border border-slate-200 p-4 bg-slate-50" data-candidature="' + Number(c.id) + '">' +
            '<div class="flex gap-3 items-start">' + photo(m) +
            '<div style="min-width:0;flex:1">' +
                '<p class="font-bold text-slate-900">' + esc(m.username || 'Compte supprimé') + (m.departement ? ' <span class="text-slate-500 font-normal">(' + esc(m.departement) + ')</span>' : '') +
                ' <span class="text-xs text-slate-400 font-normal">· candidature du ' + esc(date(c.createdAt)) + '</span></p>' +
                '<p class="text-xs text-slate-500 mt-1">Compte depuis ' + Number(m.ancienneteJours || 0) + ' jours · ' + alerte +
                    (m.candidaturesAvant ? ' · ' + m.candidaturesAvant + ' candidature(s) avant' : '') +
                    ' · ' + Number(c.heures || 0) + ' h/semaine · ' + esc((c.creneaux || []).map(function (k) { return NOMS[k] || k; }).join(', ')) + '</p>' +
            '</div></div>' +
            '<p class="text-xs font-bold text-slate-500 mt-3">Motivation</p><p class="text-sm text-slate-800 whitespace-pre-line">' + esc(c.motivation) + '</p>' +
            (c.experience ? '<p class="text-xs font-bold text-slate-500 mt-3">Expérience</p><p class="text-sm text-slate-800 whitespace-pre-line">' + esc(c.experience) + '</p>' : '') +
            (c.avis ? '<p class="text-xs font-bold text-slate-500 mt-3">Avis de l’équipe</p><p class="text-xs text-slate-700 whitespace-pre-line font-mono">' + esc(c.avis) + '</p>' : '') +
            decision + actions + '</div>';
    }

    async function stagiaires() {
        var bloc = document.getElementById('stagiairesBloc');
        if (!bloc) return;
        try {
            var d = await apiCall('/equipe/stagiaires');
            var l = d.stagiaires || [];
            if (!l.length) { bloc.classList.add('hidden'); return; }
            bloc.innerHTML = '<p class="text-sm font-bold text-slate-900 mb-2">🎓 Stagiaires en cours</p><div class="space-y-3">' + l.map(function (s) {
                return '<div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 flex flex-wrap gap-3 items-center" data-stagiaire="' + Number(s.id) + '">' + photo(s) +
                    '<div style="flex:1;min-width:160px"><p class="font-bold text-slate-900">' + esc(s.username) + '</p>' +
                    '<p class="text-xs text-slate-600">Depuis le ' + esc(date(s.debut)) + ' · fin prévue le ' + esc(date(s.fin)) + (s.termine ? ' <strong class="text-amber-700">(stage terminé)</strong>' : '') + ' · ' + Number(s.actions) + ' action(s) de modération</p></div>' +
                    (d.superAdmin ? '<div class="flex gap-2"><button type="button" data-confirmer class="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500 text-white">Confirmer modérateur</button>' +
                                    '<button type="button" data-retirer class="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white">Mettre fin au stage</button></div>' : '') +
                    '</div>';
            }).join('') + '</div>';
            bloc.classList.remove('hidden');
        } catch (e) { bloc.classList.add('hidden'); }
    }

    async function charger() {
        var boite = document.getElementById('candidaturesListe');
        if (!boite) return;
        var filtre = document.getElementById('candidaturesFiltre');
        var st = filtre ? filtre.value : 'pending';
        stagiaires();
        try {
            var d = await apiCall('/equipe/candidatures?status=' + encodeURIComponent(st));
            superAdmin = !!d.superAdmin;
            var l = d.candidatures || [];
            if (st === 'pending') badge(l.length);
            boite.innerHTML = l.length ? l.map(carte).join('') : '<p class="text-center text-slate-400 py-8 text-sm">' + (st === 'pending' ? 'Aucune candidature en attente' : 'Rien ici pour le moment') + '</p>';
        } catch (e) {
            boite.innerHTML = '<p class="text-center text-rose-600 py-8 text-sm">' + esc(e.message) + '</p>';
        }
    }

    document.addEventListener('change', function (e) { if (e.target && e.target.id === 'candidaturesFiltre') charger(); });
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('#tab-candidatures [data-avis], #tab-candidatures [data-accepter], #tab-candidatures [data-refuser], #tab-candidatures [data-confirmer], #tab-candidatures [data-retirer]');
        if (!b) return;
        var c = b.closest('[data-candidature]'), s = b.closest('[data-stagiaire]');
        var url, corps = {}, msg;
        if (b.hasAttribute('data-avis')) {
            var avis = prompt('Votre avis sur ce candidat (visible de l’équipe uniquement) :');
            if (!avis) return;
            url = '/equipe/candidatures/' + c.dataset.candidature + '/avis'; corps.avis = avis; msg = 'Avis ajouté';
        } else if (b.hasAttribute('data-accepter')) {
            if (!confirm('Accepter ce candidat ? Il devient modérateur stagiaire pour 3 semaines et reçoit un e-mail.')) return;
            url = '/equipe/candidatures/' + c.dataset.candidature + '/accepter'; msg = 'Candidat accepté : stage de 3 semaines';
        } else if (b.hasAttribute('data-refuser')) {
            var note = prompt('Un mot pour le candidat (facultatif, envoyé par e-mail) :', '');
            if (note === null) return;
            url = '/equipe/candidatures/' + c.dataset.candidature + '/refuser'; corps.note = note; msg = 'Candidature refusée';
        } else if (b.hasAttribute('data-confirmer')) {
            if (!confirm('Confirmer ce stagiaire comme modérateur ?')) return;
            url = '/equipe/stagiaires/' + s.dataset.stagiaire + '/confirmer'; msg = 'Modérateur confirmé';
        } else {
            if (!confirm('Mettre fin au stage ? La personne redevient simple membre.')) return;
            url = '/equipe/stagiaires/' + s.dataset.stagiaire + '/retirer'; msg = 'Stage terminé';
        }
        b.disabled = true;
        try {
            await apiCall(url, { method: 'POST', body: JSON.stringify(corps) });
            toast(msg);
            charger();
        } catch (err) { b.disabled = false; toast(err.message, 'error'); }
    });

    // Charger l'onglet à l'ouverture
    var origine = window.showTab;
    if (typeof origine === 'function') {
        window.showTab = function (nom, bouton) { origine(nom, bouton); if (nom === 'candidatures') charger(); };
    }
    window.EvcCandidatures = { charger: charger };
    compter();
    bandeau();
})();
