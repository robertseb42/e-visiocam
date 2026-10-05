// Extrait de favoris.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// Mes favoris : modèles suivis (alerte email réglable) et salons
// ============================================================
if (!isLoggedIn()) window.location.href = 'login.html?redirect=favoris.html';
const escF = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function ligneModele(m) {
    return `<div class="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div class="w-11 h-11 rounded-full bg-gradient-to-tr from-brand-primary to-purple-600 text-white flex items-center justify-center font-black">${escF(m.username.charAt(0).toUpperCase())}</div>
        <div class="flex-1 min-w-[160px]">
            <p class="font-bold text-slate-900">${escF(m.username)} ${m.isLive ? '<span class="ml-1 text-[10px] bg-rose-500 text-white font-bold px-2 py-0.5 rounded-full live-pulse">● EN DIRECT</span>' : ''}</p>
            <p class="text-xs text-slate-500 truncate">${m.isLive ? escF(m.liveSalon) + ' · ' + m.viewers + ' spectateur' + (m.viewers > 1 ? 's' : '') : escF(m.bio || 'Hors ligne')}</p>
        </div>
        <label class="flex items-center gap-2 text-xs font-semibold text-slate-600 cursor-pointer" title="Recevoir un email quand ce modèle lance un live">
            <input type="checkbox" data-notify="${m.id}" ${m.notify ? 'checked' : ''} class="rounded"> Alerte email
        </label>
        ${m.isLive ? '<a href="live.html" class="px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl">Regarder</a>' : ''}
        <button type="button" class="ev-fav" data-fav="model:${m.id}" aria-pressed="true" title="Retirer des favoris"><i class="fa-solid fa-heart"></i></button>
    </div>`;
}
function ligneSalon(s) {
    return `<div class="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div class="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center text-2xl">${escF(s.icon)}</div>
        <div class="flex-1 min-w-[160px]">
            <p class="font-bold text-slate-900">${escF(s.name)} ${s.isPrivate ? '<span class="ml-1 text-[10px] bg-pink-50 text-brand-primary font-bold px-2 py-0.5 rounded-full">VIP</span>' : ''}</p>
            <p class="text-xs text-slate-500 truncate">${escF(s.description)}</p>
        </div>
        <a href="${s.isPrivate ? 'salons.html' : 'chat.html?theme=' + encodeURIComponent(s.slug)}" class="px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl">Entrer</a>
        <button type="button" class="ev-fav" data-fav="salon:${escF(s.slug)}" aria-pressed="true" title="Retirer des favoris"><i class="fa-solid fa-heart"></i></button>
    </div>`;
}
async function chargerFavoris() {
    try {
        const d = await apiCall('/favorites');
        document.getElementById('favModels').innerHTML = (d.models || []).length ? d.models.map(ligneModele).join('')
            : '<p class="text-sm text-slate-500 py-6 text-center">Aucun modèle suivi. Touchez le ❤️ sur la page <a href="modeles.html" class="text-brand-primary font-bold underline">Modèles</a>.</p>';
        document.getElementById('favSalons').innerHTML = (d.salons || []).length ? d.salons.map(ligneSalon).join('')
            : '<p class="text-sm text-slate-500 py-6 text-center">Aucun salon favori. Touchez le ❤️ sur la page <a href="salons.html" class="text-brand-primary font-bold underline">Salons</a>.</p>';
    } catch (e) {
        document.getElementById('favModels').innerHTML = '<p class="text-sm text-rose-500 py-6 text-center">' + escF(e.message) + '</p>';
    }
}
document.addEventListener('change', async e => {
    const c = e.target.closest('[data-notify]'); if (!c) return;
    try {
        await apiCall('/favorites/model/' + encodeURIComponent(c.dataset.notify), { method: 'PUT', body: JSON.stringify({ notify: c.checked }) });
        showToast(c.checked ? '📧 Alerte email activée' : 'Alerte email coupée');
    } catch (err) { c.checked = !c.checked; showToast(err.message, 'error'); }
});
document.addEventListener('evc:favori', e => { if (!e.detail.favorite) setTimeout(chargerFavoris, 300); });
chargerFavoris();
setInterval(chargerFavoris, 60000);
