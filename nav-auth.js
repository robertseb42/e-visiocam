// ============================================================
// NAVBAR DYNAMIQUE - Se connecter / Profil utilisateur
// ============================================================

function renderNavAuth() {
    var el = document.getElementById('navAuth');
    if (!el) return;

    var user = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;

    if (user) {
        var roleIcons = { super_admin: '👑', moderator: '🔵', model: '🟢', user: '⚪' };
        var roleNames = { super_admin: 'Super Admin', moderator: 'Modérateur', model: 'Modèle', user: 'Utilisateur' };
        var roleColors = {
            super_admin: 'from-purple-500 to-pink-500',
            moderator: 'from-blue-500 to-cyan-500',
            model: 'from-emerald-500 to-teal-500',
            user: 'from-slate-500 to-slate-700'
        };

        var icon = roleIcons[user.role] || '';
        var name = roleNames[user.role] || 'Utilisateur';
        var color = roleColors[user.role] || roleColors.user;
        var initial = user.username.charAt(0).toUpperCase();

        var html = '<div class="relative group">';
        html += '<button class="flex items-center gap-2 pl-2 pr-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-sm font-semibold text-slate-700 border border-slate-200/60">';
        html += '<div class="relative">';
        html += '<div class="w-7 h-7 rounded-full bg-gradient-to-r ' + color + ' text-white flex items-center justify-center text-xs font-bold">' + initial + '</div>';
        html += '<span class="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-white"></span>';
        html += '</div>';
        html += '<span class="hidden md:inline">' + icon + ' ' + user.username + '</span>';
        html += '<i class="fa-solid fa-chevron-down text-[10px] text-slate-400"></i>';
        html += '</button>';

        html += '<div class="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 hidden group-hover:block z-50 overflow-hidden">';
        html += '<div class="px-4 py-3 border-b border-slate-100">';
        html += '<p class="text-sm font-bold text-slate-900">' + icon + ' ' + user.username + '</p>';
        html += '<p class="text-[10px] text-slate-500 mt-0.5">' + name + '</p>';
        html += '</div>';

        html += '<a href="compte.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><i class="fa-solid fa-user w-4 text-center text-slate-400"></i><span>Mon profil</span></a>';

        if (user.role === 'super_admin') {
            html += '<a href="admin.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-purple-700 hover:bg-purple-50"><i class="fa-solid fa-crown w-4 text-center"></i><span>Panneau Admin</span></a>';
        }
        if (user.role === 'moderator' || user.role === 'super_admin') {
            html += '<a href="moderation.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-50"><i class="fa-solid fa-user-shield w-4 text-center"></i><span>Modération</span></a>';
        }
        if (user.role === 'model') {
            html += '<a href="dashboard.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50"><i class="fa-solid fa-chart-line w-4 text-center"></i><span>Dashboard</span></a>';
        }

        html += '<a href="credits.html" class="flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><i class="fa-solid fa-coins w-4 text-center text-amber-500"></i><span>Mes crédits</span></a>';

        html += '<div class="border-t border-slate-100 mt-1 pt-1">';
        html += '<button onclick="logout()" class="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"><i class="fa-solid fa-right-from-bracket w-4 text-center"></i><span>Déconnexion</span></button>';
        html += '</div>';
        html += '</div>';
        html += '</div>';

        el.innerHTML = html;
    } else {
        el.innerHTML =
            '<a href="login.html" class="hidden sm:inline-block px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-full transition-colors">Se connecter</a>' +
            '<a href="register.html" class="px-4 py-1.5 text-sm font-bold bg-gradient-to-r from-brand-primary to-rose-500 text-white rounded-full transition-all shadow-md shadow-pink-500/20">S\'inscrire</a>';
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderNavAuth);
} else {
    renderNavAuth();
}