// Extrait de modeles.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// Annuaire des modèles : vrais comptes « modèle » du site (API /models)
// ============================================================
let MODELS = [];
const escM = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DEGRADES = ['from-pink-600 to-purple-800', 'from-purple-600 to-indigo-800', 'from-rose-600 to-pink-900', 'from-amber-600 to-purple-900',
                  'from-fuchsia-600 to-slate-900', 'from-blue-600 to-purple-900', 'from-emerald-600 to-teal-900', 'from-indigo-600 to-purple-900'];
const degrade = m => DEGRADES[(m.id || 0) % DEGRADES.length];

// Photo de profil validée par la modération (sinon la grande initiale)
const photoM = m => (typeof urlAvatar === 'function') ? urlAvatar(m.avatar) : null;

function carte(m) {
    const lien = m.isLive ? 'live.html' : '#';
    return `
    <div class="relative group">
        <a href="${lien}" ${m.isLive ? '' : 'aria-disabled="true" tabindex="-1"'} class="block bg-gradient-to-br ${degrade(m)} rounded-2xl p-3 h-48 flex flex-col justify-between relative overflow-hidden shadow-md transition-all ${m.isLive ? 'hover:shadow-xl hover:-translate-y-1' : 'cursor-default'}" title="${escM(m.bio || m.username)}">
            ${m.isLive ? `<span class="absolute top-2 left-2 bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10 live-pulse">● EN DIRECT</span>` : ''}
            ${photoM(m) ? `<img src="${escM(photoM(m))}" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover"><div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 to-transparent"></div>`
                        : `<div class="absolute inset-0 flex items-center justify-center text-white/30 text-6xl font-black select-none">${escM(m.username.charAt(0).toUpperCase())}</div>`}
            <div class="z-10 mt-auto text-white drop-shadow">
                <p class="font-bold text-sm truncate">${escM(m.username)}</p>
                <p class="text-[11px] opacity-90 truncate">${m.isLive ? '<i class="fa-solid fa-eye text-[9px] mr-1"></i>' + m.viewers + ' · ' + escM(m.liveSalon) : (m.followers ? m.followers + ' abonné' + (m.followers > 1 ? 's' : '') : 'Hors ligne')}</p>
            </div>
        </a>
        <button type="button" class="ev-fav absolute top-2 right-2 z-20" data-fav="model:${m.id}" aria-pressed="${m.isFavorite ? 'true' : 'false'}"
                title="${m.isFavorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}"><i class="${m.isFavorite ? 'fa-solid' : 'fa-regular'} fa-heart"></i></button>
    </div>`;
}

function rendre() {
    const seulementLive = document.getElementById('onlyLive').checked;
    const liste = MODELS.filter(m => !seulementLive || m.isLive);
    const grille = document.getElementById('modelsGrid');
    const enDirect = MODELS.filter(m => m.isLive).length;
    document.getElementById('modelsSummary').textContent = MODELS.length
        ? MODELS.length + ' modèle' + (MODELS.length > 1 ? 's' : '') + (enDirect ? ' · ' + enDirect + ' en direct maintenant' : '') + ' · ❤️ pour être prévenu de leurs lives'
        : 'Les modèles du site apparaîtront ici.';
    grille.innerHTML = liste.length ? liste.map(carte).join('')
        : `<p class="col-span-full text-center text-slate-500 py-6">${MODELS.length ? 'Aucun modèle ne correspond' : (document.getElementById('searchModel').value ? 'Aucun modèle trouvé' : 'Aucun modèle pour le moment : découvrez les membres ci-dessous 👇')}</p>`;
    rendreMembres();
}

// ---------- Galerie des membres ----------
let MEMBRES = null;   // null = non connecté
function carteMembre(m) {
    const photo = urlAvatar(m.avatar);
    const enLigne = m.online || m.moi;   // si vous voyez la page, vous êtes connecté
    // 🔴 en direct : voir sa caméra · 🟡 connecté : lui écrire ou lui demander sa cam · hors ligne : simple vignette
    const point = m.isLive ? '<span class="ev-point ev-point-live" title="En direct"></span>'
                : (enLigne ? '<span class="ev-point ev-point-on" title="Connecté"></span>' : '');
    const ecrire = 'messages.html?ecrire=' + Number(m.id);
    let actions = '';
    if (!m.moi && m.isLive) {
        actions = `<a href="live.html" class="ev-action ev-action-cam"><i class="fa-solid fa-video"></i> Voir sa caméra</a>
                   <a href="${ecrire}" class="ev-action"><i class="fa-regular fa-comment"></i> Message</a>`;
    } else if (!m.moi && m.online) {
        actions = `<a href="${ecrire}" class="ev-action"><i class="fa-regular fa-comment"></i> Message</a>
                   <button type="button" class="ev-action ev-action-cam" data-cam="${Number(m.id)}" data-nom="${escM(m.username)}"><i class="fa-solid fa-video"></i> Demander la cam</button>`;
    }
    return `
        <div data-fiche="${Number(m.id)}" class="ev-membre ${m.isLive ? 'est-live' : (enLigne ? '' : 'est-absent')} ${actions ? 'a-actions' : ''}"
             title="${escM(m.username + (m.moi ? ' (vous)' : (m.isLive ? ' — en direct' : (enLigne ? ' — connecté' : ' — hors ligne'))))}" ${actions ? 'tabindex="0"' : ''}>
            ${photo ? `<img src="${escM(photo)}" alt="" loading="lazy">` : ''}
            ${actions ? `<div class="ev-membre-actions">${actions}</div>` : ''}
            <div class="ev-membre-bas"><p class="ev-membre-nom">${point}<span class="ev-membre-pseudo">${escM(m.username)}</span>${m.departement ? `<span class="ev-membre-dep">(${escM(m.departement)})</span>` : ''}</p></div>
        </div>`;
}
function rendreMembres() {
    const grille = document.getElementById('membresGrid'), resume = document.getElementById('membresResume');
    if (MEMBRES === null) {
        resume.innerHTML = '<a href="login.html" class="underline font-semibold">Connectez-vous</a> pour découvrir les membres de la communauté.';
        grille.innerHTML = ''; return;
    }
    const q = document.getElementById('searchModel').value.trim().toLowerCase();
    const live = document.getElementById('onlyLive').checked;
    const liste = MEMBRES.filter(m => (!q || m.username.toLowerCase().includes(q)) && (!live || m.isLive));
    const enDirect = MEMBRES.filter(m => m.isLive).length, enLigne = MEMBRES.filter(m => m.online || m.moi).length;
    resume.textContent = MEMBRES.length
        ? MEMBRES.length + ' membre' + (MEMBRES.length > 1 ? 's' : '') + ' · 🟡 ' + enLigne + ' connecté' + (enLigne > 1 ? 's' : '') + ' · 🔴 ' + enDirect + ' en direct. Cliquez sur une photo pour voir la fiche du membre.'
        : 'Aucun membre avec une photo pour le moment. Ajoutez la vôtre dans Mon compte !';
    grille.innerHTML = liste.length ? liste.map(carteMembre).join('')
        : (MEMBRES.length ? '<p class="col-span-full text-center text-slate-500 py-6">Aucun membre ne correspond</p>' : '');
}
async function chargerMembres() {
    if (typeof getCurrentUser !== 'function' || !getCurrentUser()) { MEMBRES = null; rendreMembres(); return; }
    try { const d = await apiCall('/models/members'); MEMBRES = d.members || []; }
    catch (e) { MEMBRES = []; }
    rendreMembres();
}

let attente = null;
async function charger() {
    const q = document.getElementById('searchModel').value.trim();
    const sort = document.getElementById('sortModels').value;
    try {
        const d = await apiCall('/models?sort=' + encodeURIComponent(sort) + (q ? '&q=' + encodeURIComponent(q) : ''));
        MODELS = d.models || [];
    } catch (e) {
        MODELS = [];
        document.getElementById('modelsGrid').innerHTML = '<p class="col-span-full text-center text-rose-500 py-12">Impossible de charger les modèles : ' + escM(e.message) + '</p>';
        return;
    }
    rendre();
    const url = new URL(location.href);
    if (q) url.searchParams.set('q', q); else url.searchParams.delete('q');
    history.replaceState(null, '', url);
}

const q0 = new URLSearchParams(location.search).get('q');
if (q0) document.getElementById('searchModel').value = q0;
charger();
chargerMembres();
setInterval(() => { charger(); chargerMembres(); }, 60000);   // statut « en direct » à jour
document.getElementById('searchModel').addEventListener('input', () => { clearTimeout(attente); attente = setTimeout(charger, 250); });
document.getElementById('sortModels').addEventListener('change', charger);
document.getElementById('onlyLive').addEventListener('change', rendre);
// 📷 « Demander la cam » : vraie demande (l'autre accepte ou refuse) ; un clic sur la photo ouvre la fiche
document.getElementById('membresGrid').addEventListener('click', async e => {
    const b = e.target.closest('[data-cam]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    if (typeof EvcCam === 'undefined') { location.href = 'messages.html?ecrire=' + b.dataset.cam + '&demande=cam'; return; }
    b.disabled = true;
    const ok = await EvcCam.demander(b.dataset.cam, b.dataset.nom);
    if (ok) b.innerHTML = '✅ Demande envoyée'; else b.disabled = false;
});
document.addEventListener('evc:favori', e => { const m = MODELS.find(x => 'model:' + x.id === e.detail.type + ':' + e.detail.key); if (m) m.isFavorite = e.detail.favorite; });
