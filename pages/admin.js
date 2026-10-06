// Extrait de admin.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// PANNEAU ADMIN
// ============================================================
let allUsers = [];
let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = getCurrentUser();
    if (currentUser) {
        document.getElementById('userBadge').innerText = '👑 ' + currentUser.username;
    }
    loadMaintenance();
    loadBackup();
    initStats();
    startContactInbox();
    await loadUsers();
    await loadLogs();
    await loadRadios();
});

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    var div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

// ---------- MODE MAINTENANCE ----------
let maintenanceOn = false;

function renderMaintenance(state) {
    maintenanceOn = !!state.enabled;
    const pill = document.getElementById('maintPill');
    const btn = document.getElementById('maintBtn');
    const icon = document.getElementById('maintIcon');
    const hint = document.getElementById('maintHint');
    const input = document.getElementById('maintMessage');
    if (!pill) return;
    if (maintenanceOn) {
        pill.textContent = 'ACTIF';
        pill.className = 'ml-1 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700';
        icon.className = 'w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center';
        hint.textContent = 'Les visiteurs voient la page d\'attente. Vous seul avez accès au site.';
        btn.textContent = 'Réouvrir le site';
        btn.className = 'px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 whitespace-nowrap';
    } else {
        pill.textContent = 'Site ouvert';
        pill.className = 'ml-1 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700';
        icon.className = 'w-10 h-10 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center';
        hint.textContent = 'Le site est accessible à tous les membres.';
        btn.textContent = 'Mettre en maintenance';
        btn.className = 'px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-red-600 hover:bg-red-700 whitespace-nowrap';
    }
    btn.disabled = false;
    if (state.message && document.activeElement !== input) input.value = state.message;
}

async function loadMaintenance() {
    try {
        renderMaintenance(await apiCall('/maintenance'));
    } catch (err) {
        const hint = document.getElementById('maintHint');
        if (hint) hint.textContent = 'Impossible de lire l\'état : ' + err.message;
    }
}

async function toggleMaintenance() {
    const enabling = !maintenanceOn;
    if (enabling && !confirm('Mettre le site en maintenance ?\n\nTous les membres seront déconnectés et leurs lives arrêtés. Seul votre compte gardera l\'accès.')) return;
    const btn = document.getElementById('maintBtn');
    btn.disabled = true;
    try {
        const body = { enabled: enabling };
        const msg = document.getElementById('maintMessage').value.trim();
        if (msg) body.message = msg;
        renderMaintenance(await apiCall('/admin/maintenance', { method: 'PUT', body: JSON.stringify(body) }));
        if (window.EvcMaintenance) window.EvcMaintenance.refresh();
    } catch (err) {
        alert('Échec : ' + err.message);
        btn.disabled = false;
    }
}

// ---------- SAUVEGARDES DE LA BASE ----------
function tailleLisible(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' Mo' : Math.max(1, Math.round(n / 1024)) + ' Ko'; }
function renderBackup(st) {
    const pill = document.getElementById('backupPill'), hint = document.getElementById('backupHint'), det = document.getElementById('backupDetail');
    const ok = st.emailConfigure && st.chiffrementPret;
    pill.textContent = st.lastError ? 'ERREUR' : (ok ? 'Automatique' : 'À configurer');
    pill.className = 'ml-1 align-middle text-[11px] font-bold px-2 py-0.5 rounded-full ' +
        (st.lastError ? 'bg-red-100 text-red-700' : ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700');
    const der = st.fichiers && st.fichiers[0];
    hint.textContent = der ? 'Dernière : ' + der.nom.replace(/^e-visiocam-|\.(evcbak|sqlite\.gz)$/g, '').replace('_', ' à ') + ' · ' + tailleLisible(der.taille)
                           : 'Aucune sauvegarde pour l\'instant';
    let t = 'Chaque nuit vers ' + st.heure + ' h · ' + (st.fichiers || []).length + ' / ' + st.garde + ' copies sur le serveur (la plus ancienne est remplacée).';
    if (!st.emailConfigure) t += ' Envoi par email désactivé : ajoutez BACKUP_EMAIL sur Render.';
    else if (!st.chiffrementPret) t += ' Envoi par email désactivé : ajoutez BACKUP_PASSWORD (12 caractères minimum) sur Render.';
    else if (st.lastEmail) t += ' Dernier envoi : ' + st.lastEmail + '.';
    if (st.lastError) t += ' Dernière erreur : ' + st.lastError;
    det.textContent = t;
}
async function loadBackup() {
    try { renderBackup(await apiCall('/admin/backup')); }
    catch (err) { document.getElementById('backupHint').textContent = 'Indisponible : ' + err.message; }
}
async function lancerSauvegarde() {
    const btn = document.getElementById('backupRunBtn');
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
        const r = await apiCall('/admin/backup/run', { method: 'POST' });
        renderBackup(r.statut);
        showToast('💾 Sauvegarde faite (' + tailleLisible(r.taille) + ') — email : ' + r.email);
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.style.opacity = '1'; }
}
async function telechargerSauvegarde() {
    const btn = document.getElementById('backupDlBtn');
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
        const r = await fetch(API_URL + '/admin/backup/download', { credentials: 'include' });
        if (!r.ok) { let m = 'Erreur ' + r.status; try { m = (await r.json()).error || m; } catch (e) {} throw new Error(m); }
        const nom = ((r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/) || [])[1] || 'e-visiocam-sauvegarde.evcbak';
        const url = URL.createObjectURL(await r.blob());
        const a = document.createElement('a'); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        showToast('⬇️ ' + nom + (r.headers.get('X-Backup-Encrypted') === '1' ? ' (chiffrée)' : ''));
    } catch (err) { showToast(err.message, 'error'); }
    finally { btn.disabled = false; btn.style.opacity = '1'; }
}

// ---------- CHARGER LES UTILISATEURS ----------
async function loadUsers() {
    const tbody = document.getElementById('usersTable');
    tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400"><i class="fa-solid fa-circle-notch fa-spin"></i> Chargement...</td></tr>';

    try {
        const data = await apiCall('/admin/users');
        allUsers = data.users;
        updateStats();
        renderUsers();
        renderMods();
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-rose-500">' + escapeHtml(err.message) + '</td></tr>';
    }
}

// ---------- CHARGER LES LOGS ----------
async function loadLogs() {
    const list = document.getElementById('logsList');
    try {
        const data = await apiCall('/admin/logs');
        const logs = data.logs;
        if (!logs || logs.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Aucun log pour le moment</p>';
            return;
        }
        list.innerHTML = logs.map(log => {
            const date = new Date(log.created_at).toLocaleString('fr-FR');
            return '<div class="flex items-start gap-3 p-3 rounded-xl bg-slate-50">' +
                '<span class="text-xs font-bold uppercase text-slate-600">' + escapeHtml(log.type) + '</span>' +
                '<div class="flex-1">' +
                '<p class="text-sm text-slate-700">' + escapeHtml(log.message) + '</p>' +
                '<p class="text-xs text-slate-400 mt-1">' + date + '</p>' +
                '</div></div>';
        }).join('');
    } catch (err) {
        list.innerHTML = '<p class="text-center text-rose-500 py-8 text-sm">' + escapeHtml(err.message) + '</p>';
    }
}

// ---------- STATS ----------
function updateStats() {
    document.getElementById('statUsers').innerText = allUsers.length;
    document.getElementById('statMods').innerText = allUsers.filter(u => u.role === 'moderator').length;
    document.getElementById('statBans').innerText = allUsers.filter(u => u.status === 'banned').length;
    document.getElementById('statModels').innerText = allUsers.filter(u => u.role === 'model').length;
}

// ---------- TABLE USERS ----------
const roleBadges = {
    super_admin: '<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-bold">👑 Super Admin</span>',
    moderator:   '<span class="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-bold">🔵 Modérateur</span>',
    model:       '<span class="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">🟢 Modèle</span>',
    user:        '<span class="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-xs font-bold">⚪ Utilisateur</span>',
    bot:         '<span class="bg-yellow-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">🤖 Animateur (IA)</span>'
};

function renderUsers(filter = '') {
    filter = filter.toLowerCase();
    const filtered = allUsers.filter(u =>
        u.username.toLowerCase().includes(filter) ||
        (u.email && u.email.toLowerCase().includes(filter))
    );
    const tbody = document.getElementById('usersTable');

    if (filtered.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="py-8 text-center text-slate-400 text-sm">Aucun utilisateur</td></tr>';
        document.getElementById('userCount').innerText = '0 utilisateur';
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isBanned = u.status === 'banned';
        const isMe = currentUser && u.id === currentUser.id;
        const canAct = !isMe;

        let actions = '<div class="flex justify-end gap-1 flex-wrap">';
        // 🎁 Offrir des crédits (possible aussi pour soi-même et l'équipe : Super Admin)
        if (!isBanned) actions += '<button data-adm="offrirA" data-adm-args="' + argsAdm(u.username) + '" title="Offrir des crédits" class="w-7 h-7 rounded-lg bg-yellow-100 text-amber-700 hover:bg-yellow-200 text-xs"><i class="fa-solid fa-gift"></i></button>';
        // 🔑 Réinitialisation du mot de passe : possible sur n'importe quel compte
        actions += '<button data-adm="handleResetPassword" data-adm-args="' + argsAdm(u.id, u.username) + '" title="Réinitialiser le mot de passe" class="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs"><i class="fa-solid fa-key"></i></button>';
        if (canAct && u.role === 'user') {
            actions += '<button data-adm="handlePromoteMod" data-adm-args="' + argsAdm(u.id) + '" title="Nommer modérateur" class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs"><i class="fa-solid fa-user-shield"></i></button>';
        }
        if (canAct && u.role === 'moderator') {
            actions += '<button data-adm="handleRevokeMod" data-adm-args="' + argsAdm(u.id) + '" title="Révoquer modérateur" class="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 text-xs"><i class="fa-solid fa-user-minus"></i></button>';
        }
        // Sanctions avec durée au choix (mute / kick / ban), ou levée si elles sont en cours
        const enCours = canAct ? EvcSanction.enCours(u) : [];
        if (canAct) {
            actions += enCours.includes('mute')
                ? '<button data-adm="leverSanction" data-adm-args="' + argsAdm(u.id, 'mute') + '" title="Rendre la parole" class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs"><i class="fa-solid fa-microphone"></i></button>'
                : '<button data-adm="handleSanction" data-adm-args="' + argsAdm(u.id, 'mute') + '" title="Rendre muet (durée au choix)" class="w-7 h-7 rounded-lg bg-orange-50 text-orange-600 hover:bg-orange-100 text-xs"><i class="fa-solid fa-microphone-slash"></i></button>';
            actions += enCours.includes('kick')
                ? '<button data-adm="leverSanction" data-adm-args="' + argsAdm(u.id, 'kick') + '" title="Lever l\'exclusion" class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs"><i class="fa-solid fa-door-open"></i></button>'
                : '<button data-adm="handleSanction" data-adm-args="' + argsAdm(u.id, 'kick') + '" title="Expulser (durée au choix)" class="w-7 h-7 rounded-lg bg-rose-50 text-rose-500 hover:bg-rose-100 text-xs"><i class="fa-solid fa-right-from-bracket"></i></button>';
        }
        if (canAct && !isBanned) {
            actions += '<button data-adm="handleSanction" data-adm-args="' + argsAdm(u.id, 'ban') + '" title="Bannir (jours ou définitif)" class="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 text-xs"><i class="fa-solid fa-ban"></i></button>';
        }
        if (canAct && isBanned) {
            actions += '<button data-adm="leverSanction" data-adm-args="' + argsAdm(u.id, 'ban') + '" title="Débannir" class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 text-xs"><i class="fa-solid fa-check"></i></button>';
        }
        if (canAct) {
            actions += '<button data-adm="handleDelete" data-adm-args="' + argsAdm(u.id) + '" title="Supprimer" class="w-7 h-7 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 text-xs"><i class="fa-solid fa-trash"></i></button>';
        }
        actions += '</div>';

        return '<tr class="border-b border-slate-50 hover:bg-slate-50/50">' +
            '<td class="py-3 px-2 text-slate-500 font-mono text-xs">#' + u.id + '</td>' +
            '<td class="py-3 px-2 font-bold text-slate-900">' + escapeHtml(u.username) + (isMe ? ' <span class="text-[10px] text-brand-primary">(moi)</span>' : '') + '</td>' +
            '<td class="py-3 px-2 text-slate-500 text-xs">' + escapeHtml(u.email || '—') + '</td>' +
            '<td class="py-3 px-2">' + (roleBadges[u.role] || escapeHtml(u.role)) + '</td>' +
            '<td class="py-3 px-2">' + EvcSanction.etiquette(u) +
                (Number(u.must_change_password) === 1 ? ' <span class="text-amber-600 text-[10px] font-bold" title="Mot de passe réinitialisé : à changer à la prochaine connexion">🔑 à changer</span>' : '') + '</td>' +
            '<td class="py-3 px-2 text-right">' + actions + '</td>' +
            '</tr>';
    }).join('');

    document.getElementById('userCount').innerText = filtered.length + ' utilisateur(s)';
}

function renderMods() {
    const mods = allUsers.filter(u => u.role === 'moderator' || u.role === 'super_admin');
    document.getElementById('modsList').innerHTML = mods.length === 0
        ? '<p class="text-sm text-slate-400 py-4">Aucun modérateur</p>'
        : mods.map(u => {
            let html = '<div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl">';
            html += '<div class="flex items-center gap-3">';
            html += '<div class="w-9 h-9 rounded-full ' + (u.role === 'super_admin' ? 'bg-purple-500' : 'bg-blue-500') + ' text-white flex items-center justify-center font-bold text-sm">' + u.username[0].toUpperCase() + '</div>';
            html += '<div><p class="font-bold text-slate-900 text-sm">' + escapeHtml(u.username) + '</p>';
            html += '<p class="text-xs text-slate-500">' + (roleBadges[u.role] || u.role) + '</p></div></div>';
            if (u.role === 'moderator' && currentUser && u.id !== currentUser.id) {
                html += '<button data-adm="handleRevokeMod" data-adm-args="' + argsAdm(u.id) + '" class="text-xs text-rose-600 hover:text-rose-800 font-bold"><i class="fa-solid fa-user-minus mr-1"></i>Révoquer</button>';
            }
            html += '</div>';
            return html;
        }).join('');

    const promoteSelect = document.getElementById('promoteModSelect');
    const candidates = allUsers.filter(u => u.role === 'user' && u.status === 'active');
    promoteSelect.innerHTML = '<option value="">-- Choisir un utilisateur --</option>' +
        candidates.map(u => '<option value="' + u.id + '">' + escapeHtml(u.username) + '</option>').join('');
}

// ---------- ACTIONS ----------
async function handlePromoteMod(userId) {
    const id = userId || parseInt(document.getElementById('promoteModSelect').value);
    if (!id) return showToast('Choisissez un utilisateur', 'error');
    try {
        await apiCall('/admin/users/' + id + '/role', { method: 'POST', body: JSON.stringify({ role: 'moderator' }) });
        showToast('🔵 Utilisateur promu modérateur !');
        await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
}

async function handleRevokeMod(userId) {
    if (!confirm('Révoquer ce modérateur ?')) return;
    try {
        await apiCall('/admin/users/' + userId + '/role', { method: 'POST', body: JSON.stringify({ role: 'user' }) });
        showToast('Modérateur révoqué', 'warning');
        await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
}

function handleSanction(userId, type) {
    const u = allUsers.find(x => x.id === userId) || {};
    EvcSanction.ouvrir({ id: userId, username: u.username, type, onDone: loadUsers });
}
function handleBan(userId) { handleSanction(userId, 'ban'); }

async function handleUnban(userId) {
    if (!confirm('Débannir cet utilisateur ?')) return;
    try {
        await apiCall('/admin/users/' + userId + '/unban', { method: 'POST' });
        showToast('✅ Utilisateur débanni');
        await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
}

async function handleDelete(userId) {
    if (!confirm('⚠️ Supprimer définitivement ce compte ?')) return;
    try {
        await apiCall('/admin/users/' + userId, { method: 'DELETE' });
        showToast('🗑️ Compte supprimé', 'warning');
        await loadUsers();
    } catch (err) { showToast(err.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════
// 🔑 RÉINITIALISER LE MOT DE PASSE D'UN COMPTE
// ═══════════════════════════════════════════════════════════
// Ouverture / fermeture des fenêtres (admin.html ne charge pas app.js, où elles étaient définies)
function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

let tempPassword = '';

async function handleResetPassword(userId, username) {
    if (!confirm('Réinitialiser le mot de passe de « ' + username + ' » ?\n\n'
        + 'Un mot de passe temporaire va être créé. Le membre devra en choisir un nouveau '
        + 'à sa prochaine connexion, et ses sessions ouvertes seront déconnectées.')) return;

    let data;
    try {
        data = await apiCall('/admin/users/' + userId + '/reset-password', { method: 'POST' });
    } catch (err) {
        showToast(err.message || 'Réinitialisation impossible', 'error');
        return;
    }

    // Le mot de passe est déjà changé côté serveur et n'est affiché qu'une seule fois :
    // quoi qu'il arrive ensuite, il ne doit jamais être perdu.
    tempPassword = data.tempPassword || '';
    try {
        document.getElementById('pwdUser').textContent = data.username || username;
        document.getElementById('pwdValue').textContent = tempPassword;
        openModal('pwdModal');
    } catch (e) {
        window.prompt('Mot de passe temporaire de « ' + (data.username || username) + ' » (Ctrl + C pour copier) :', tempPassword);
    }
    showToast('🔑 Mot de passe réinitialisé');
    try { await loadUsers(); } catch (e) { /* la liste se mettra à jour au prochain chargement */ }
}

function copyTempPassword() {
    if (!tempPassword) return;
    const done = () => showToast('📋 Mot de passe copié');
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tempPassword).then(done).catch(() => selectionner());
    } else { selectionner(); }

    function selectionner() {
        const el = document.getElementById('pwdValue');
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        showToast('Sélectionnez puis copiez (Ctrl + C)', 'info');
    }
}

// ═══════════════════════════════════════════════════════════
// RADIOS
// ═══════════════════════════════════════════════════════════
async function loadRadios() {
    try {
        const data = await apiCall('/radios/all');
        const radios = data.radios || [];
        const list = document.getElementById('radiosAdminList');
        const stat = document.getElementById('statRadios');
        if (stat) stat.textContent = radios.length;

        if (radios.length === 0) {
            list.innerHTML = '<p class="text-center text-slate-400 py-8 text-sm">Aucune radio. Clique sur "Ajouter une radio" !</p>';
            return;
        }

        let html = '';
        radios.forEach(r => {
            var type = (r.stream_url && r.stream_url.trim()) ? '🎵 Flux direct' : '📻 Iframe';
            html += '<div class="bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between gap-4">';
            html += '<div class="flex items-center gap-3 flex-1 min-w-0">';
            html += '<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center text-2xl shrink-0">📻</div>';
            html += '<div class="flex-1 min-w-0">';
            html += '<p class="font-bold text-slate-900 truncate">' + escapeHtml(r.name) + '</p>';
            html += '<p class="text-xs text-slate-500 truncate">' + escapeHtml(r.description || 'Sans description') + '</p>';
            html += '<p class="text-[10px] text-slate-400 mt-1">' + (r.active ? '🟢 Actif' : '🔴 Inactif') + ' · ' + type + ' · Position ' + r.position + '</p>';
            html += '</div></div>';
            html += '<div class="flex gap-2 shrink-0">';
            html += '<button data-adm="editRadio" data-adm-args="' + argsAdm(r.id) + '" class="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 flex items-center justify-center"><i class="fa-solid fa-pen text-xs"></i></button>';
            html += '<button data-adm="deleteRadio" data-adm-args="' + argsAdm(r.id, r.name) + '" class="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 flex items-center justify-center"><i class="fa-solid fa-trash text-xs"></i></button>';
            html += '</div></div>';
        });
        list.innerHTML = html;
    } catch (err) {
        document.getElementById('radiosAdminList').innerHTML = '<p class="text-rose-500 text-center py-8 text-sm">' + escapeHtml(err.message) + '</p>';
    }
}

function openRadioModal(radio) {
    document.getElementById('radioModal').classList.remove('hidden');
    document.getElementById('radioModalTitle').textContent = radio ? 'Modifier la radio' : 'Ajouter une radio';
    document.getElementById('radioId').value = radio ? radio.id : '';
    document.getElementById('radioName').value = radio ? radio.name : '';
    document.getElementById('radioDescription').value = radio ? (radio.description || '') : '';
    document.getElementById('radioEmbed').value = radio ? (radio.html_embed || '') : '';
    document.getElementById('radioStreamUrl').value = radio ? (radio.stream_url || '') : '';
    document.getElementById('radioCover').value = radio ? (radio.cover_url || '') : '';
    document.getElementById('radioPosition').value = radio ? radio.position : 0;
    document.getElementById('radioActive').value = radio ? radio.active : 1;
}

function closeRadioModal() {
    document.getElementById('radioModal').classList.add('hidden');
}

async function editRadio(id) {
    try {
        const data = await apiCall('/radios/all');
        const radio = (data.radios || []).find(r => r.id === id);
        if (radio) openRadioModal(radio);
    } catch (err) { showToast(err.message, 'error'); }
}

async function saveRadio() {
    const id = document.getElementById('radioId').value;
    const body = {
        name: document.getElementById('radioName').value.trim(),
        description: document.getElementById('radioDescription').value.trim(),
        html_embed: document.getElementById('radioEmbed').value.trim(),
        stream_url: document.getElementById('radioStreamUrl').value.trim(),
        cover_url: document.getElementById('radioCover').value.trim(),
        position: parseInt(document.getElementById('radioPosition').value) || 0,
        active: parseInt(document.getElementById('radioActive').value)
    };

    if (!body.name || (!body.html_embed && !body.stream_url)) {
        showToast('Nom + (URL flux OU code HTML) requis', 'error');
        return;
    }

    const btn = document.getElementById('radioSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Enregistrement...';

    try {
        if (id) {
            await apiCall('/radios/' + id, { method: 'PUT', body: JSON.stringify(body) });
            showToast('✅ Radio modifiée');
        } else {
            await apiCall('/radios', { method: 'POST', body: JSON.stringify(body) });
            showToast('✅ Radio ajoutée');
        }
        closeRadioModal();
        loadRadios();
        loadLogs();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Enregistrer';
    }
}

async function deleteRadio(id, name) {
    if (!confirm('Supprimer la radio "' + name + '" ?')) return;
    try {
        await apiCall('/radios/' + id, { method: 'DELETE' });
        showToast('🗑️ Radio supprimée');
        loadRadios();
        loadLogs();
    } catch (err) { showToast(err.message, 'error'); }
}


// ═══════════════════════════════════════════════════════════
// STATISTIQUES : inscriptions, connectés, crédits gagnés et offerts (site gratuit)
// ═══════════════════════════════════════════════════════════
let statsJours = 30;
let statsData = null;
const nf = new Intl.NumberFormat('fr-FR');
const nfEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtJour = (j, long) => {
    const d = new Date(j + 'T12:00:00Z');
    return d.toLocaleDateString('fr-FR', long ? { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
};

function initStats() {
    try { const j = parseInt(localStorage.getItem('evc-stats-jours'), 10); if ([7, 30, 90].includes(j)) statsJours = j; } catch (e) {}
    document.querySelectorAll('.stats-periode').forEach(b => {
        b.addEventListener('click', () => {
            statsJours = Number(b.dataset.jours);
            try { localStorage.setItem('evc-stats-jours', String(statsJours)); } catch (e) {}
            chargerStats();
        });
    });
    chargerStats();
    // « Connectés maintenant » se met à jour tout seul tant que l'onglet est ouvert
    setInterval(() => { if (!document.hidden && !document.getElementById('tab-stats').classList.contains('hidden')) chargerStats(true); }, 30000);
    let attente;
    window.addEventListener('resize', () => { clearTimeout(attente); attente = setTimeout(dessinerGraphiques, 150); });
}

async function chargerStats(silencieux) {
    document.querySelectorAll('.stats-periode').forEach(b => b.classList.toggle('actif', Number(b.dataset.jours) === statsJours));
    try {
        statsData = await apiCall('/admin/stats?days=' + statsJours);
        afficherStats();
    } catch (err) {
        if (!silencieux) document.getElementById('statsMaj').textContent = 'Statistiques indisponibles : ' + err.message;
    }
}

function afficherStats() {
    const d = statsData; if (!d) return;
    const t = d.aujourdhui, p = d.periode, m = d.maintenant;
    const per = d.nbJours + ' derniers jours';
    document.getElementById('statsMaj').textContent = 'Mis à jour à ' + new Date(d.genereLe).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + nf.format(d.total.membres) + ' membres inscrits au total';
    document.getElementById('stMaintenant').textContent = nf.format(m.membres);
    document.getElementById('stMaintenantDetail').textContent = (m.lives + m.livesPrives) + ' live' + (m.lives + m.livesPrives > 1 ? 's' : '') + ' en cours' + (m.livesPrives ? ' (dont ' + m.livesPrives + ' privé' + (m.livesPrives > 1 ? 's' : '') + ')' : '') + ' · pic du jour ' + nf.format(t.pic);
    document.getElementById('stInscr').textContent = nf.format(t.inscriptions);
    document.getElementById('stInscrDetail').textContent = nf.format(p.inscriptions) + ' sur les ' + per;
    document.getElementById('stActifs').textContent = nf.format(t.actifs);
    document.getElementById('stActifsDetail').textContent = nf.format(p.actifsUniques) + ' membres différents sur les ' + per;
    document.getElementById('stCredits').textContent = nf.format(t.depenses);
    document.getElementById('stCreditsDetail').textContent = nf.format(t.creditsDepenses) + ' crédits aujourd\'hui · ' + nf.format(d.total.creditsEnCirculation) + ' en circulation';


    document.getElementById('cap-inscriptions').textContent = nf.format(p.inscriptions) + ' sur les ' + per;
    document.getElementById('cap-actifs').textContent = 'Pic simultané sur la période : ' + nf.format(p.picMax);
    document.getElementById('cap-credits').textContent = nf.format(p.creditsDepenses) + ' crédits offerts · ' + nf.format(p.creditsDistribues) + ' gagnés sur les ' + per;

    document.getElementById('statsTable').innerHTML = d.jours.slice().reverse().map(j =>
        '<tr class="border-b border-slate-100">' +
        '<td class="py-1.5 pr-3 text-slate-700">' + escapeHtml(fmtJour(j.jour, true)) + '</td>' +
        '<td class="py-1.5 pr-3 text-right">' + nf.format(j.inscriptions) + '</td>' +
        '<td class="py-1.5 pr-3 text-right">' + nf.format(j.actifs) + '</td>' +
        '<td class="py-1.5 pr-3 text-right">' + nf.format(j.pic) + '</td>' +
        '<td class="py-1.5 pr-3 text-right">' + nf.format(j.creditsDistribues) + '</td>' +
        '<td class="py-1.5 pr-3 text-right">' + nf.format(j.depenses) + '</td>' +
        '<td class="py-1.5 text-right">' + nf.format(j.creditsDepenses) + '</td></tr>').join('');
    dessinerGraphiques();
}

function dessinerGraphiques() {
    if (!statsData) return;
    const j = statsData.jours;
    graphiqueColonnes('chart-inscriptions', j, 'inscriptions', x => '<b>' + nf.format(x.inscriptions) + '</b> inscription' + (x.inscriptions > 1 ? 's' : ''));
    graphiqueColonnes('chart-actifs', j, 'actifs', x => '<b>' + nf.format(x.actifs) + '</b> membre' + (x.actifs > 1 ? 's' : '') + ' connecté' + (x.actifs > 1 ? 's' : '') + '<br>Pic simultané : ' + nf.format(x.pic));
    graphiqueColonnes('chart-credits', j, 'creditsDepenses', x => '<b>' + nf.format(x.creditsDepenses) + '</b> crédits offerts<br>' + nf.format(x.depenses) + ' cadeau' + (x.depenses > 1 ? 'x' : '') + ' · ' + nf.format(x.creditsDistribues) + ' crédits gagnés');
}

// Échelle « ronde » : 0, 5, 10… / 0, 50, 100…
function maxRond(v) {
    if (v <= 4) return 4;
    const pas = Math.pow(10, Math.floor(Math.log10(v)));
    for (const k of [1, 2, 3, 4, 5, 6, 8, 10]) if (k * pas >= v) return k * pas;
    return 10 * pas;
}

// Histogramme en colonnes, une série : colonnes fines arrondies en haut, survol = info-bulle
function graphiqueColonnes(id, jours, cle, texte) {
    const box = document.getElementById(id);
    if (!box || !box.offsetWidth) return;
    const W = box.clientWidth, H = box.clientHeight || 190;
    const g = 34, d = 4, h = 4, b = 22;        // marges : gauche (axe), droite, haut, bas (dates)
    const iw = W - g - d, ih = H - h - b;
    const max = maxRond(Math.max(0, ...jours.map(x => x[cle])));
    const n = jours.length, band = iw / n;
    const bw = Math.max(2, Math.min(24, band - 2));   // ≤ 24 px, 2 px d'air entre colonnes
    const y = v => h + ih - (v / max) * ih;
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + escapeHtml(box.closest('figure').querySelector('figcaption p').textContent) + '">';
    (max % 2 === 0 ? [0, 0.5, 1] : [0, 1]).forEach(f => {
        const v = max * f, yy = Math.round(y(v)) + 0.5;
        s += '<line x1="' + g + '" x2="' + (W - d) + '" y1="' + yy + '" y2="' + yy + '" stroke="var(--grid)" stroke-width="1"/>';
        s += '<text x="' + (g - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="10" fill="var(--axis)">' + nf.format(Math.round(v)) + '</text>';
    });
    const tous = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 48))));   // une date toutes les ~48 px
    jours.forEach((x, i) => {
        const cx = g + band * i + band / 2, v = x[cle];
        const top = y(v), base = h + ih, hb = base - top;
        if (v > 0) {
            const r = Math.min(4, bw / 2, hb);
            const x0 = cx - bw / 2, x1 = cx + bw / 2;
            s += '<path class="bar text-brand-primary" data-i="' + i + '" fill="currentColor" d="M' + x0 + ',' + base + 'V' + (top + r) + 'Q' + x0 + ',' + top + ' ' + (x0 + r) + ',' + top +
                'H' + (x1 - r) + 'Q' + x1 + ',' + top + ' ' + x1 + ',' + (top + r) + 'V' + base + 'Z"/>';
        }
        if ((n - 1 - i) % tous === 0) s += '<text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10" fill="var(--axis)">' + fmtJour(x.jour) + '</text>';
    });
    s += '<line x1="' + g + '" x2="' + (W - d) + '" y1="' + (h + ih + 0.5) + '" y2="' + (h + ih + 0.5) + '" stroke="var(--axis)" stroke-opacity=".5" stroke-width="1"/>';
    // Zones de survol par-dessus tout : toute la hauteur de la colonne, plus large que la barre
    jours.forEach((x, i) => { s += '<rect class="hit" data-i="' + i + '" x="' + (g + band * i) + '" y="' + h + '" width="' + band + '" height="' + ih + '"/>'; });
    s += '</svg>';
    box.innerHTML = s + '<div class="evc-tip" hidden></div>';
    const tip = box.querySelector('.evc-tip');
    box.querySelectorAll('.hit').forEach(r => {
        r.addEventListener('mouseenter', () => {
            const i = Number(r.dataset.i), x = jours[i];
            tip.innerHTML = '<span style="opacity:.75">' + escapeHtml(fmtJour(x.jour, true)) + '</span><br>' + texte(x);
            tip.hidden = false;
            const cx = g + band * i + band / 2;
            tip.style.left = Math.min(W - 70, Math.max(70, cx)) + 'px';
            tip.style.top = Math.max(0, y(x[cle]) - 8) + 'px';
            box.querySelectorAll('.bar').forEach(p => p.classList.toggle('survol', p.dataset.i === r.dataset.i));
        });
        r.addEventListener('mouseleave', () => { tip.hidden = true; box.querySelectorAll('.bar.survol').forEach(p => p.classList.remove('survol')); });
    });
}

function exporterStats() {
    if (!statsData) return;
    const lignes = [['jour', 'inscriptions', 'membres_connectes', 'pic_simultane', 'credits_gagnes', 'cadeaux', 'credits_offerts']]
        .concat(statsData.jours.map(j => [j.jour, j.inscriptions, j.actifs, j.pic, j.creditsDistribues, j.depenses, j.creditsDepenses]));
    const csv = '﻿' + lignes.map(l => l.join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'statistiques-e-visiocam-' + statsData.jours[statsData.jours.length - 1].jour + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ═══════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════
function showTab(name, btn) {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById('tab-' + name).classList.remove('hidden');
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('text-brand-primary', 'border-b-2', 'border-brand-primary', 'font-bold');
        t.classList.add('text-slate-500', 'font-semibold');
    });
    btn.classList.add('text-brand-primary', 'border-b-2', 'border-brand-primary', 'font-bold');
    btn.classList.remove('text-slate-500', 'font-semibold');
    if (name === 'radios') loadRadios();
    if (name === 'rewards') chargerRecompenses();
    if (name === 'stats') chargerStats();
    if (name === 'logs') loadLogs();
    if (name === 'contact') loadContactMessages();
    if (location.hash !== '#' + name && name === 'contact') history.replaceState(null, '', '#contact');
}


// ═══════════════════════════════════════════════════════════
// RÉCOMPENSES (programme de crédits gratuits)
// ═══════════════════════════════════════════════════════════
const RWA_CHAMPS = [
    ['bienvenue', 'Bonus de bienvenue (crédits)'],
    ['quotidien', 'Connexion du jour'], ['quotidienSerie', 'Connexion du jour en série'], ['serieJours', 'Jours de suite pour la série'],
    ['actif15', 'Participation : crédits par 15 min'], ['actifMaxJour', 'Participation : plafond par jour'],
    ['liveHeure', 'Live (modèles) : crédits par heure'], ['liveMaxJour', 'Live : plafond par jour'],
    ['parrainage', 'Parrainage : crédits'], ['parrainageJoursActifs', 'Parrainage : jours actifs du filleul'], ['parrainageMaxMois', 'Parrainage : maximum par mois'],
    ['signalement', 'Signalement confirmé : crédits'], ['signalementMaxSemaine', 'Signalements payés par semaine'],
    ['modoOffreMax', 'Modérateurs : crédits offerts par envoi (0 = interdit)'], ['modoOffreJour', 'Modérateurs : crédits offerts par jour']
];
let rwaData = null;

async function chargerRecompenses() {
    const j = document.getElementById('rwaJours').value;
    try { rwaData = await apiCall('/admin/rewards?days=' + j); }
    catch (err) { document.getElementById('rwaResume').textContent = 'Indisponible : ' + err.message; return; }
    const d = rwaData, nf = new Intl.NumberFormat('fr-FR');
    document.getElementById('rwaResume').textContent = (d.config.actif ? '🟢 Actif' : '⏸️ En pause') + ' · ' + nf.format(d.total) + ' crédits distribués sur ' + d.nbJours + ' jours (depuis le ' + d.depuis.split('-').reverse().join('/') + ')';
    document.getElementById('rwaTuiles').innerHTML = d.parAction.length ? d.parAction.map(a =>
        '<div><span>' + escapeHtml(a.libelle) + '</span><b>' + nf.format(a.credits) + '</b><span>' + nf.format(a.membres) + ' membre(s) · ' + nf.format(a.fois) + ' fois</span></div>').join('')
        : '<p class="text-xs text-slate-400">Aucun crédit distribué sur la période.</p>';
    const al = (d.memeIp || []).map(m => '<div class="rwa-alerte">⚠️ <b>' + m.n + ' comptes</b> inscrits depuis la même connexion : ' + escapeHtml(m.comptes) + '</div>');
    document.getElementById('rwaAlertes').innerHTML = al.join('') || '<p class="text-xs text-slate-400">Aucune alerte.</p>';
    const ico = { super_admin: '👑', moderator: '🔵', model: '🟢', user: '⚪' };
    document.getElementById('rwaTop').innerHTML = d.top.length ? d.top.map(u =>
        '<tr><td>' + (ico[u.role] || '') + ' <b>' + escapeHtml(u.username) + '</b>' +
        '<div class="rwa-retrait hidden" id="rwaR' + Number(u.id) + '"><input type="number" min="1" max="' + Number(u.solde || 0) + '" placeholder="Crédits" style="width:90px"><input type="text" maxlength="200" placeholder="Raison (envoyée par e-mail)" style="flex:1;min-width:160px">' +
        '<button type="button" class="rwa-btn danger" data-adm="retirerCredits" data-adm-args="' + argsAdm(Number(u.id)) + '">Confirmer</button></div></td>' +
        '<td>' + nf.format(u.credits) + '</td><td>' + nf.format(u.solde || 0) + '</td>' +
        '<td style="text-align:right;white-space:nowrap"><button type="button" class="rwa-btn ok" data-offrir="' + escapeHtml(u.username) + '">Offrir</button><button type="button" class="rwa-btn danger" data-adm="basculerRetrait" data-adm-args="' + argsAdm(Number(u.id)) + '">Retirer</button></td></tr>').join('')
        : '<tr><td colspan="4" class="text-slate-400">Personne pour le moment</td></tr>';
    const etat = { pending: '⏳ En attente', rewarded: '✅ Validé', refused: '⛔ Refusé' };
    document.getElementById('rwaParr').innerHTML = d.parrainages.length ? d.parrainages.map(p =>
        '<tr><td>' + escapeHtml(p.filleul) + '</td><td>' + escapeHtml(p.parrain) + '</td><td>' + (etat[p.status] || escapeHtml(p.status)) + (p.reason ? ' <span class="text-slate-400">(' + escapeHtml(p.reason) + ')</span>' : '') + '</td><td>' + escapeHtml(String(p.created_at).slice(0, 10).split('-').reverse().join('/')) + '</td></tr>').join('')
        : '<tr><td colspan="4" class="text-slate-400">Aucun parrainage</td></tr>';
    document.querySelectorAll('[data-offrir]').forEach(b => b.addEventListener('click', () => {
        document.getElementById('rwaOffreNom').value = b.dataset.offrir;
        document.getElementById('rwaOffreMontant').focus();
        document.getElementById('rwaOffre').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
    const quandM = t => new Date(String(t).replace(' ', 'T') + (/[TZ]/.test(t) ? '' : 'Z')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    document.getElementById('rwaManuels').innerHTML = (d.manuels || []).length ? d.manuels.map(m =>
        '<tr><td><b>' + escapeHtml(m.username) + '</b></td><td style="font-weight:800;color:' + (m.amount > 0 ? '#059669' : '#e11d48') + '">' + (m.amount > 0 ? '+' : '') + m.amount + '</td><td>' +
        (m.type === 'retrait' ? '⛔ ' : '🎁 ') + escapeHtml(m.description || '') + '</td><td>' + (m.parRole === 'moderator' ? '🔵 ' : m.par ? '👑 ' : '') + escapeHtml(m.par || '—') + '</td><td>' + escapeHtml(quandM(m.created_at)) + '</td></tr>').join('')
        : '<tr><td colspan="5" class="text-slate-400">Aucun crédit offert ou retiré à la main pour le moment</td></tr>';
    remplirReglages(d.config);
    remplirMembresOffre();
    chargerAnimateur();
}

async function remplirMembresOffre() {
    const dl = document.getElementById('rwaMembres');
    if (dl.childElementCount) return;
    try {
        if (!allUsers.length) { const data = await apiCall('/admin/users'); allUsers = data.users || []; }
        dl.innerHTML = allUsers.filter(u => u.status !== 'banned').map(u => '<option value="' + escapeHtml(u.username) + '"></option>').join('');
    } catch (e) {}
}

// Fenêtre « Offrir des crédits » (onglet Utilisateurs)
function offrirA(nom) {
    EvcOffrir.ouvrir({ username: nom, membres: allUsers.filter(u => u.status !== 'banned').map(u => u.username),
        onDone: () => { if (!document.getElementById('tab-rewards').classList.contains('hidden')) chargerRecompenses(); } });
}

async function offrirCredits(e) {
    e.preventDefault();
    const nom = document.getElementById('rwaOffreNom'), mt = document.getElementById('rwaOffreMontant'), rs = document.getElementById('rwaOffreRaison');
    try {
        const r = await apiCall('/admin/rewards/offrir', { method: 'POST', body: JSON.stringify({ username: nom.value.trim(), montant: Number(mt.value), raison: rs.value }) });
        showToast('🎁 ' + r.offert + ' crédits offerts à ' + r.username + ' (nouveau solde : ' + r.solde + ')', 'success');
        nom.value = ''; mt.value = ''; rs.value = '';
        chargerRecompenses();
    } catch (err) { showToast(err.message, 'error'); }
}

function remplirReglages(c) {
    document.getElementById('rwa_actif').checked = !!c.actif;
    document.getElementById('rwaChamps').innerHTML = RWA_CHAMPS.map(([k, l]) =>
        '<label>' + escapeHtml(l) + '<input type="number" min="0" max="100000" step="1" id="rwa_' + k + '" value="' + Number(c[k]) + '"></label>').join('');
}

function remettreDefautRecompenses() {
    if (rwaData) { remplirReglages(Object.assign({}, rwaData.defaut, { actif: document.getElementById('rwa_actif').checked })); showToast('Valeurs par défaut chargées : pensez à enregistrer', 'info'); }
}

async function chargerAnimateur() {
    try {
        const d = await apiCall('/admin/animateur');
        const c = d.config;
        ['actif', 'accueil', 'quiz'].forEach(k => { document.getElementById('anm_' + k).checked = !!c[k]; });
        ['relanceMinutes', 'quizCredits', 'quizMaxJour'].forEach(k => { document.getElementById('anm_' + k).value = c[k]; });
        document.getElementById('anmNom').textContent = d.compte && d.compte.username ? '· pseudo : ' + d.compte.username : '';
    } catch (e) { document.getElementById('anmNom').textContent = '· indisponible'; }
}
async function enregistrerAnimateur(e) {
    e.preventDefault();
    const corps = {};
    ['actif', 'accueil', 'quiz'].forEach(k => { corps[k] = document.getElementById('anm_' + k).checked; });
    ['relanceMinutes', 'quizCredits', 'quizMaxJour'].forEach(k => { corps[k] = Number(document.getElementById('anm_' + k).value); });
    try { await apiCall('/admin/animateur', { method: 'PUT', body: JSON.stringify(corps) }); showToast('Animateur virtuel enregistré', 'success'); chargerAnimateur(); }
    catch (err) { showToast(err.message, 'error'); }
}

async function enregistrerRecompenses(e) {
    e.preventDefault();
    const corps = { actif: document.getElementById('rwa_actif').checked };
    RWA_CHAMPS.forEach(([k]) => { corps[k] = Number(document.getElementById('rwa_' + k).value); });
    try {
        await apiCall('/admin/rewards/config', { method: 'PUT', body: JSON.stringify(corps) });
        showToast('Réglages des récompenses enregistrés', 'success');
        chargerRecompenses();
    } catch (err) { showToast(err.message, 'error'); }
}

async function retirerCredits(id) {
    const boite = document.getElementById('rwaR' + id);
    const [m, r] = boite.querySelectorAll('input');
    try {
        const res = await apiCall('/admin/rewards/users/' + id + '/retirer', { method: 'POST', body: JSON.stringify({ montant: Number(m.value), raison: r.value }) });
        showToast(res.retire + ' crédits retirés (le membre est prévenu par e-mail)', 'success');
        chargerRecompenses();
    } catch (err) { showToast(err.message, 'error'); }
}

document.addEventListener('DOMContentLoaded', () => {
    const sel = document.getElementById('rwaJours');
    if (sel) sel.addEventListener('change', chargerRecompenses);
});

// ═══════════════════════════════════════════════════════════
// MESSAGES CONTACT (formulaire contact.html)
// ═══════════════════════════════════════════════════════════
let contactBox = 'inbox';
let contactMessages = [];
let contactOpenId = null;
let contactUnread = null;
let contactArchived = 0;
const CONTACT_STATUS = {
    new: ['Nouveau', 'bg-rose-100 text-rose-700'],
    read: ['Lu', 'bg-slate-100 text-slate-600'],
    replied: ['Répondu', 'bg-emerald-100 text-emerald-700'],
    archived: ['Archivé', 'bg-slate-100 text-slate-500']
};

function setContactUnread(n) {
    const arrive = contactUnread !== null && n > contactUnread;
    contactUnread = n;
    const badge = document.getElementById('contactTabBadge');
    if (badge) { badge.textContent = n; badge.classList.toggle('hidden', n === 0); }
    const resume = document.getElementById('contactSummary');
    if (resume) resume.textContent = n + ' non lu' + (n > 1 ? 's' : '') + ' · ' + contactArchived + ' archivé' + (contactArchived > 1 ? 's' : '');
    document.title = (n > 0 ? '(' + n + ') ' : '') + document.title.replace(/^\(\d+\)\s*/, '');
    return arrive;
}

function startContactInbox() {
    apiCall('/contact/admin/unread-count').then(d => setContactUnread(d.count || 0)).catch(() => {});
    // Temps réel : le serveur prévient le Super Admin à chaque nouveau message
    const brancher = () => {
        if (typeof io === 'undefined' || window._contactSocket) return;
        window._contactSocket = io('https://api.e-visiocam.com', { withCredentials: true, transports: ['websocket', 'polling'] });
        window._contactSocket.on('contact:unread-count', data => {
            if (!data || typeof data.count !== 'number') return;
            const arrive = setContactUnread(data.count);
            if (data.newMessage) {
                showToast('📩 Nouveau message de ' + data.newMessage.name + ' — ' + data.newMessage.subject);
                if (!document.getElementById('tab-contact').classList.contains('hidden')) loadContactMessages();
            } else if (arrive) loadContactMessages();
        });
    };
    if (document.readyState === 'complete') brancher(); else window.addEventListener('load', brancher);
    // Filet de sécurité si le temps réel est coupé
    setInterval(() => apiCall('/contact/admin/unread-count').then(d => setContactUnread(d.count || 0)).catch(() => {}), 60000);
    if (location.hash === '#contact') showTab('contact', document.getElementById('contactTabBtn'));
    // Ouvre la section contact même si on est déjà sur la page admin (clic « Messages contact » du menu)
    window.addEventListener('hashchange', function () {
        if (location.hash === '#contact') showTab('contact', document.getElementById('contactTabBtn'));
    });
}

function setContactBox(box) {
    contactBox = box;
    const on = 'px-3 py-1.5 rounded-lg bg-white text-slate-900', off = 'px-3 py-1.5 rounded-lg text-slate-500';
    document.getElementById('contactBoxInbox').className = box === 'inbox' ? on : off;
    document.getElementById('contactBoxArchived').className = box === 'archived' ? on : off;
    contactOpenId = null;
    loadContactMessages();
}

async function loadContactMessages() {
    const list = document.getElementById('contactList');
    try {
        const data = await apiCall('/contact/admin' + (contactBox === 'archived' ? '?box=archived' : ''));
        contactMessages = data.messages || [];
        contactArchived = data.archived || 0;
        setContactUnread(data.unread || 0);
        renderContactMessages();
    } catch (err) {
        list.innerHTML = '<p class="text-center text-rose-500 py-8 text-sm">' + escapeHtml(err.message) + '</p>';
    }
}

function contactDate(s) {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');   // SQLite : UTC sans fuseau
    return isNaN(d) ? s : d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

function renderContactMessages() {
    const list = document.getElementById('contactList');
    if (!contactMessages.length) {
        list.innerHTML = '<p class="text-center text-slate-400 py-10 text-sm">' +
            (contactBox === 'archived' ? 'Aucun message archivé' : '📭 Aucun message pour le moment') + '</p>';
        return;
    }
    list.innerHTML = contactMessages.map(m => {
        const st = CONTACT_STATUS[m.status] || CONTACT_STATUS.read;
        const ouvert = m.id === contactOpenId;
        const nouveau = m.status === 'new';
        let html = '<div class="rounded-xl border ' + (nouveau ? 'border-brand-primary' : 'border-slate-200') + ' bg-slate-50 overflow-hidden">' +
            '<button data-adm="toggleContactMessage" data-adm-args="' + argsAdm(m.id) + '" class="w-full text-left p-4 flex items-start gap-3 hover:bg-slate-100">' +
                '<span class="mt-1.5 w-2.5 h-2.5 rounded-full flex-none ' + (nouveau ? 'bg-rose-500' : 'bg-transparent') + '"></span>' +
                '<div class="flex-1 min-w-0">' +
                    '<div class="flex flex-wrap items-center gap-2">' +
                        '<span class="text-sm ' + (nouveau ? 'font-extrabold' : 'font-semibold') + ' text-slate-900">' + escapeHtml(m.name) + '</span>' +
                        '<span class="text-xs text-slate-500 break-all">' + escapeHtml(m.email) + '</span>' +
                        '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full ' + st[1] + '">' + st[0] + '</span>' +
                    '</div>' +
                    '<p class="text-xs font-bold text-slate-700 mt-1">' + escapeHtml(m.subject_label) + '</p>' +
                    (ouvert ? '' : '<p class="text-xs text-slate-500 mt-1 truncate">' + escapeHtml(m.message) + '</p>') +
                '</div>' +
                '<span class="text-[11px] text-slate-400 whitespace-nowrap">' + escapeHtml(contactDate(m.created_at)) + '</span>' +
            '</button>';
        if (ouvert) {
            const mailto = 'mailto:' + encodeURIComponent(m.email) + '?subject=' + encodeURIComponent('Re: ' + m.subject_label + ' — E-VISIOCAM');
            html += '<div class="px-4 pb-4 pl-10">' +
                '<p class="text-sm text-slate-700 whitespace-pre-wrap break-words bg-white rounded-xl p-4 border border-slate-200">' + escapeHtml(m.message) + '</p>' +
                (m.reply_text ? '<div class="mt-3 text-xs text-slate-500"><strong class="text-emerald-700">Votre réponse du ' + escapeHtml(contactDate(m.replied_at)) + ' :</strong>' +
                    '<p class="whitespace-pre-wrap mt-1 text-slate-600">' + escapeHtml(m.reply_text) + '</p></div>' : '') +
                '<textarea id="contactReply" rows="4" maxlength="5000" placeholder="Votre réponse (envoyée par email à ' + escapeHtml(m.email) + ')..." ' +
                    'class="mt-3 w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary resize-y"></textarea>' +
                '<div class="flex flex-wrap gap-2 mt-2">' +
                    '<button data-adm="replyContact" data-adm-args="' + argsAdm(m.id, '$this') + '" class="px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-paper-plane mr-1"></i> Envoyer la réponse</button>' +
                    '<a href="' + mailto + '" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-at mr-1"></i> Répondre avec ma messagerie</a>' +
                    '<button data-adm="setContactStatus" data-adm-args="' + argsAdm(m.id, 'new') + '" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-envelope mr-1"></i> Marquer non lu</button>' +
                    (m.status === 'archived'
                        ? '<button data-adm="setContactStatus" data-adm-args="' + argsAdm(m.id, 'read') + '" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-box-open mr-1"></i> Désarchiver</button>'
                        : '<button data-adm="setContactStatus" data-adm-args="' + argsAdm(m.id, 'archived') + '" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-box-archive mr-1"></i> Archiver</button>') +
                    '<button data-adm="deleteContact" data-adm-args="' + argsAdm(m.id) + '" class="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl"><i class="fa-solid fa-trash mr-1"></i> Supprimer</button>' +
                '</div>' +
            '</div>';
        }
        return html + '</div>';
    }).join('');
}

async function toggleContactMessage(id) {
    contactOpenId = contactOpenId === id ? null : id;
    const m = contactMessages.find(x => x.id === id);
    renderContactMessages();
    if (contactOpenId && m && m.status === 'new') {   // ouvrir = lu
        try {
            const r = await apiCall('/contact/admin/' + id, { method: 'PATCH', body: JSON.stringify({ status: 'read' }) });
            Object.assign(m, r.message); setContactUnread(r.unread); renderContactMessages();
        } catch (e) {}
    }
}

async function setContactStatus(id, status) {
    try {
        const r = await apiCall('/contact/admin/' + id, { method: 'PATCH', body: JSON.stringify({ status }) });
        setContactUnread(r.unread);
        if (status !== 'new') contactOpenId = null;
        loadContactMessages();
    } catch (err) { showToast(err.message, 'error'); }
}

async function replyContact(id, btn) {
    const text = document.getElementById('contactReply').value.trim();
    if (text.length < 2) { showToast('Écrivez une réponse', 'error'); return; }
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
        const r = await apiCall('/contact/admin/' + id + '/reply', { method: 'POST', body: JSON.stringify({ message: text }) });
        showToast(r.simulated ? '⚠️ Réponse enregistrée, mais SendGrid est en mode simulation : aucun email réellement envoyé' : '✅ Réponse envoyée par email');
        setContactUnread(r.unread);
        loadContactMessages();
    } catch (err) {
        showToast(err.message, 'error');
        btn.disabled = false; btn.style.opacity = '1';
    }
}

async function deleteContact(id) {
    if (!confirm('Supprimer définitivement ce message ?')) return;
    try {
        const r = await apiCall('/contact/admin/' + id, { method: 'DELETE' });
        setContactUnread(r.unread);
        contactOpenId = null;
        loadContactMessages();
    } catch (err) { showToast(err.message, 'error'); }
}

// ---------- RECHERCHE ----------
document.getElementById('searchUser').addEventListener('input', e => renderUsers(e.target.value));

// ---------- Boutons générés (membres, radios, récompenses, messages de contact) ----------
// Remplacent des attributs onclick, bloqués par la CSP stricte. Les arguments sont en JSON dans
// data-adm-args (argsAdm) : un pseudo ou un nom de radio avec une apostrophe ne casse plus le code.
// "$this" désigne le bouton lui-même.
function argsAdm() {
    return JSON.stringify(Array.prototype.slice.call(arguments)).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
}
var ACTIONS_ADM = {
    leverSanction: function(id, type) { EvcSanction.lever(id, type, loadUsers); },
    basculerRetrait: function(id) { document.getElementById('rwaR' + id).classList.toggle('hidden'); }
};
['offrirA', 'handleResetPassword', 'handlePromoteMod', 'handleRevokeMod', 'handleSanction', 'handleDelete', 'editRadio',
 'deleteRadio', 'retirerCredits', 'toggleContactMessage', 'replyContact', 'setContactStatus', 'deleteContact'].forEach(function(nom) {
    ACTIONS_ADM[nom] = function() { return window[nom].apply(null, arguments); };
});
document.addEventListener('click', function(e) {
    var b = e.target.closest && e.target.closest('[data-adm]');
    if (!b || !Object.prototype.hasOwnProperty.call(ACTIONS_ADM, b.dataset.adm)) return;
    var args = JSON.parse(b.dataset.admArgs || '[]').map(function(a) { return a === '$this' ? b : a; });
    ACTIONS_ADM[b.dataset.adm].apply(null, args);
});
