// Extrait de profile.html (CSP stricte : plus de script inline dans les pages)
document.addEventListener('DOMContentLoaded', async function() {
    const user = getCurrentUser();
    if (!user) return;

    const roleLabels = {
        super_admin: '👑 Super Admin',
        moderator: '🔵 Modérateur',
        model: '🟢 Modèle',
        user: '⚪ Utilisateur'
    };

    let joinedText = '';
    if (user.created_at) {
        const date = new Date(user.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
        joinedText = 'Membre depuis ' + date;
    }

    document.getElementById('profileContent').innerHTML = `
        <div class="flex items-center gap-5 mb-6">
            <div class="w-24 h-24 rounded-full overflow-hidden bg-gradient-to-r from-pink-500 to-purple-600 text-white flex items-center justify-center font-bold text-4xl shrink-0">
                ${(user.avatar && urlAvatar(user.avatar.url)) ? `<img src="${urlAvatar(user.avatar.url)}" alt="" style="width:100%;height:100%;object-fit:cover">` : user.username.charAt(0).toUpperCase()}
            </div>
            <div class="flex-1 min-w-0">
                <h2 class="text-2xl font-bold text-slate-900 truncate">${user.username}</h2>
                <p class="text-sm text-slate-500 mt-1">${roleLabels[user.role] || user.role}</p>
                <p class="text-xs text-slate-400 mt-1">${joinedText}</p>
                ${user.departement && window.evcDepartement ? `<p class="text-xs text-slate-500 mt-1">📍 ${evcDepartement(user.departement)}</p>` : ''}
            </div>
        </div>

        ${user.bio ? `
            <div class="p-4 bg-slate-50 rounded-xl mb-4">
                <p class="text-xs font-bold text-slate-500 uppercase mb-2">Bio</p>
                <p class="text-sm text-slate-700 whitespace-pre-line">${user.bio}</p>
            </div>
        ` : ''}

        <div class="grid grid-cols-2 gap-3 mt-4">
            <a href="messages.html" class="p-4 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-xl text-center transition-all">
                <i class="fa-solid fa-comments text-2xl text-brand-primary mb-2"></i>
                <p class="text-sm font-bold text-slate-900">Mes messages</p>
            </a>
            <a href="credits.html" class="p-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-center transition-all">
                <i class="fa-solid fa-coins text-2xl text-amber-500 mb-2"></i>
                <p class="text-sm font-bold text-slate-900">Mes récompenses</p>
            </a>
        </div>

        <div class="mt-6 pt-6 border-t border-slate-100 flex gap-3">
            <a href="compte.html" class="flex-1 py-3 text-center bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition-all">
                <i class="fa-solid fa-pen mr-2"></i> Modifier mon profil
            </a>
            <button data-logout class="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded-xl transition-all">
                <i class="fa-solid fa-arrow-right-from-bracket"></i>
            </button>
        </div>
    `;
    document.querySelector('#profileContent [data-logout]').addEventListener('click', () => logout());
});
