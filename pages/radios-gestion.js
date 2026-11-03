// E-VISIOCAM — Espace équipe › Communauté (communaute.html) : radios et programme du site.
// Ouvert au super-admin et au rôle « Animateur ». Le serveur vérifie les mêmes droits (routes /api/radios et /api/evenements).
(function () {
    'use strict';
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!u) { location.href = 'login.html?redirect=communaute.html'; return; }
    if (u.role !== 'super_admin' && u.role !== 'animateur') {
        document.getElementById('evxCommunaute').innerHTML = '<div class="evx-contenu"><h1>Accès réservé</h1><p class="gl-intro">Cette page est réservée aux animateurs et à l\'administration.</p></div>';
        return;
    }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    var radios = [];
    function $(id) { return document.getElementById(id); }

    async function charger() {
        var list = $('radiosAdminList');
        try {
            radios = (await apiCall('/radios/all')).radios || [];
            list.innerHTML = radios.length ? radios.map(function (r) {
                var type = (r.stream_url && r.stream_url.trim()) ? '🎵 Flux direct' : '📻 Iframe';
                return '<div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">' +
                    '<div class="flex items-center gap-3 flex-1 min-w-0"><div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-2xl shrink-0">📻</div>' +
                    '<div class="flex-1 min-w-0"><p class="font-bold text-slate-900 truncate">' + esc(r.name) + '</p><p class="text-xs text-slate-500 truncate">' + esc(r.description || 'Sans description') + '</p>' +
                    '<p class="text-[10px] text-slate-400 mt-1">' + (r.active ? '🟢 Actif' : '🔴 Inactif') + ' · ' + type + ' · Position ' + esc(r.position) + '</p></div></div>' +
                    '<div class="flex gap-2 shrink-0"><button type="button" data-radio-modif="' + Number(r.id) + '" aria-label="Modifier ' + esc(r.name) + '" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center"><i class="fa-solid fa-pen text-xs"></i></button>' +
                    '<button type="button" data-radio-suppr="' + Number(r.id) + '" aria-label="Supprimer ' + esc(r.name) + '" class="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button></div></div>';
            }).join('') : '<p class="text-center text-slate-400 py-8 text-sm">Aucune radio. Cliquez sur « Ajouter une radio » !</p>';
        } catch (err) { list.innerHTML = '<p class="text-rose-500 text-center py-8 text-sm">' + esc(err.message) + '</p>'; }
    }
    function ouvrir(r) {
        $('radioModal').classList.remove('hidden');
        $('radioModalTitle').textContent = r ? 'Modifier la radio' : 'Ajouter une radio';
        $('radioId').value = r ? r.id : ''; $('radioName').value = r ? r.name : ''; $('radioDescription').value = r ? (r.description || '') : '';
        $('radioEmbed').value = r ? (r.html_embed || '') : ''; $('radioStreamUrl').value = r ? (r.stream_url || '') : ''; $('radioCover').value = r ? (r.cover_url || '') : '';
        $('radioPosition').value = r ? r.position : 0; $('radioActive').value = r ? r.active : 1;
    }
    // Fonctions appelées par data-click dans la fenêtre (même balisage que l'admin)
    window.openRadioModal = function () { ouvrir(null); };
    window.closeRadioModal = function () { $('radioModal').classList.add('hidden'); };
    window.saveRadio = async function () {
        var id = $('radioId').value;
        var body = { name: $('radioName').value.trim(), description: $('radioDescription').value.trim(), html_embed: $('radioEmbed').value.trim(),
            stream_url: $('radioStreamUrl').value.trim(), cover_url: $('radioCover').value.trim(), position: parseInt($('radioPosition').value, 10) || 0, active: parseInt($('radioActive').value, 10) };
        if (!body.name || (!body.html_embed && !body.stream_url)) { showToast('Nom + (URL flux OU code HTML) requis', 'error'); return; }
        var btn = $('radioSaveBtn'); btn.disabled = true;
        try {
            await apiCall(id ? '/radios/' + id : '/radios', { method: id ? 'PUT' : 'POST', body: JSON.stringify(body) });
            showToast(id ? '✅ Radio modifiée' : '✅ Radio ajoutée'); window.closeRadioModal(); charger();
        } catch (err) { showToast(err.message, 'error'); } finally { btn.disabled = false; }
    };
    document.addEventListener('click', async function (e) {
        var m = e.target.closest('[data-radio-modif]'), s = e.target.closest('[data-radio-suppr]');
        if (m) { var r = radios.find(function (x) { return x.id === Number(m.getAttribute('data-radio-modif')); }); if (r) ouvrir(r); }
        if (s) {
            var r2 = radios.find(function (x) { return x.id === Number(s.getAttribute('data-radio-suppr')); }); if (!r2) return;
            if (!confirm('Supprimer la radio « ' + r2.name + ' » ?')) return;
            try { await apiCall('/radios/' + r2.id, { method: 'DELETE' }); showToast('🗑️ Radio supprimée'); charger(); } catch (err) { showToast(err.message, 'error'); }
        }
    });
    charger();
    window.addEventListener('load', function () { if (window.EvcProgramme && EvcProgramme.charger) EvcProgramme.charger(); });
})();
