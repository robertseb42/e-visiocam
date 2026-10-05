// Extrait de dashboard.html (CSP stricte : plus de script inline dans les pages)
let currentUser = null;
let isLive = false;

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = getCurrentUser();
    if (currentUser) document.getElementById('welcomeName').innerText = currentUser.username;
    await loadStats();
    await loadSessions();
});

async function loadStats() {
    try {
        const data = await apiCall('/model/stats');
        const s = data.stats;
        document.getElementById('statViewers').innerText = s.viewers;
        document.getElementById('statFollowers').innerText = s.followers;
        document.getElementById('statLikes').innerText = s.likes;
        document.getElementById('statRating').innerText = s.avgRating + ' ⭐';
        document.getElementById('statEarnings').innerText = s.totalEarnings.toFixed(2);
        document.getElementById('statCredits').innerText = s.creditsBalance;
        isLive = s.liveStatus === 'live';
        updateLiveUI();
        renderChart(s.weeklyEarnings);
    } catch (err) { showToast(err.message, 'error'); }
}

function renderChart(values) {
    const max = Math.max(...values, 1);
    const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
    document.getElementById('chart').innerHTML = values.map((v, i) => {
        const height = (v / max) * 100;
        return '<div class="flex-1 flex flex-col items-center gap-2"><div class="w-full bg-slate-100 rounded-lg relative overflow-hidden" style="height:100%;"><div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-lg" style="height:' + height + '%;" title="' + v + '€"></div></div><span class="text-[10px] text-slate-500 font-bold">' + days[i] + '</span></div>';
    }).join('');
}

function updateLiveUI() {
    const status = document.getElementById('liveStatus');
    const btn = document.getElementById('liveBtn');
    const btnText = document.getElementById('liveBtnText');
    if (isLive) {
        status.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-emerald-100 text-emerald-700';
        status.innerHTML = '🔴 EN DIRECT';
        btn.className = 'px-6 py-3 bg-gradient-to-r from-rose-500 to-red-600 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2';
        btnText.innerText = 'Arrêter le live';
    } else {
        status.className = 'px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-500';
        status.innerHTML = '⚫ Hors ligne';
        btn.className = 'px-6 py-3 bg-gradient-to-r from-brand-primary to-rose-500 text-white font-bold rounded-xl shadow-lg text-sm flex items-center gap-2';
        btnText.innerText = 'Démarrer le live';
    }
}

async function toggleLive() {
    try {
        const action = isLive ? 'stop' : 'start';
        const data = await apiCall('/model/toggle-live', { method: 'POST', body: JSON.stringify({ action }) });
        isLive = data.liveStatus === 'live';
        updateLiveUI();
        showToast(isLive ? '🔴 Live démarré !' : '⚫ Live arrêté');
    } catch (err) { showToast(err.message, 'error'); }
}

async function loadSessions() {
    const tbody = document.getElementById('sessionsTable');
    try {
        const data = await apiCall('/model/sessions');
        tbody.innerHTML = data.sessions.map(s => '<tr class="border-b border-slate-50"><td class="py-3 px-2">' + new Date(s.date).toLocaleDateString('fr-FR') + '</td><td class="py-3 px-2 text-slate-500">' + s.duration + ' min</td><td class="py-3 px-2 text-slate-500">' + s.viewers + '</td><td class="py-3 px-2 text-right font-bold text-emerald-600">' + s.earnings.toFixed(2) + ' €</td></tr>').join('');
    } catch (err) { tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-rose-500">' + err.message + '</td></tr>'; }
}
