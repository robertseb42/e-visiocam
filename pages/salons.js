// Extrait de salons.html (CSP stricte : plus de script inline dans les pages)
// "slug" = identifiant du salon, utilisé dans l'adresse : chat.html?theme=<slug>
// La liste vient du serveur (/api/salons/list) ; ce repli sert uniquement si l'API
// n'est pas joignable. Aucun chiffre inventé : les compteurs viennent du serveur.
const REPLI_PUBLICS = [
    { slug: "general",       name: "Salon Général",       description: "Le salon principal, toutes discussions bienvenues", icon: "🌍" },
    { slug: "francais",      name: "Salon Français",      description: "Discussions en français uniquement", icon: "🇫🇷" },
    { slug: "international", name: "Salon International", description: "English, Español, Deutsch welcome!", icon: "🌐" },
    { slug: "couples",       name: "Salon Couples",       description: "Espace réservé aux couples", icon: "💕" },
    { slug: "amateurs",      name: "Salon Amateurs",      description: "Pour les amateurs et nouveaux venus", icon: "✨" },
    { slug: "musique",       name: "Salon Musique",       description: "Partagez vos playlists et coups de cœur", icon: "🎵" },
];
const REPLI_PRIVES = [
    { slug: "vip",     name: "VIP Lounge",    description: "Salon privé réservé aux membres VIP", icon: "👑", isPrivate: true },
    { slug: "premium", name: "Salon Premium", description: "Accès réservé aux abonnés Premium", icon: "💎", isPrivate: true },
];

const say = m => (window.showToast ? showToast(m) : alert(m));
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Salons favoris du membre connecté (cœur plein)
let FAV_SALONS = new Set();
async function chargerFavSalons() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) return;
    try {
        const d = await apiCall('/favorites');
        FAV_SALONS = new Set((d.salons || []).map(x => x.slug));
        document.querySelectorAll('[data-fav^="salon:"]').forEach(b => EvcFav.majBouton(b, FAV_SALONS.has(b.dataset.fav.slice(6))));
    } catch (e) {}
}
document.addEventListener('evc:favori', e => { if (e.detail.type === 'salon') e.detail.favorite ? FAV_SALONS.add(e.detail.key) : FAV_SALONS.delete(e.detail.key); });

function renderSalons(items, containerId, isPrivate = false) {
    document.getElementById(containerId).innerHTML = items.map(s => `
        <div class="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all">
            <div class="flex items-start justify-between mb-3">
                <div class="text-3xl">${typeof SalonAccess !== 'undefined' && SalonAccess.logoHtml ? SalonAccess.logoHtml(s, 40) : esc(s.icon || '💬')}</div>
                ${s.isHidden ? `<span class="text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-1 rounded-full" title="Salon masqué (visible par l'équipe uniquement)">🚫 Masqué</span>` : ''}
                <div class="flex items-center gap-2">
                ${typeof s.members === 'number'
                    ? `<span class="text-xs bg-pink-50 text-brand-primary font-bold px-2 py-1 rounded-full" title="Membres">
                           <i class="fa-solid fa-users text-[10px] mr-1"></i>${s.members}
                       </span>`
                    : ''}
                    <button type="button" class="ev-fav" data-fav="salon:${esc(s.slug)}" aria-pressed="${FAV_SALONS.has(s.slug) ? 'true' : 'false'}" title="Ajouter aux favoris"><i class="${FAV_SALONS.has(s.slug) ? 'fa-solid' : 'fa-regular'} fa-heart"></i></button>
                </div>
            </div>
            <h3 class="font-bold text-slate-900">${esc(s.name)}</h3>
            <p class="text-xs text-slate-500 mt-1 mb-4">${esc(s.description || '')}</p>
            ${isPrivate
                ? `<div data-access="${esc(s.slug)}"><span class="block text-center w-full py-2 bg-slate-800 text-white text-xs font-bold rounded-xl opacity-60"><i class="fa-solid fa-lock mr-1"></i>Vérification…</span></div>`
                : `<a href="chat.html?theme=${encodeURIComponent(s.slug)}" class="block text-center w-full py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl transition-colors">Rejoindre</a>`}
        </div>
    `).join('');
}

// ---- Liste des salons : serveur d'abord, repli local sinon ----
async function loadSalons() {
    let salons = null;
    try {
        if (typeof apiCall === 'function') {
            const data = await apiCall('/salons/list');
            if (data && Array.isArray(data.salons) && data.salons.length) salons = data.salons;
        }
    } catch (e) { salons = null; }

    const publics = salons ? salons.filter(s => !s.isPrivate) : REPLI_PUBLICS;
    const prives = salons ? salons.filter(s => s.isPrivate) : REPLI_PRIVES;
    renderSalons(publics, 'publicSalons', false);
    renderSalons(prives, 'privateSalons', true);
    refreshAccess();
}

// ---- Salons privés : accès accordé par un responsable ou un administrateur ----
async function refreshAccess() {
    const base = 'block text-center w-full py-2 text-white text-xs font-bold rounded-xl transition-colors ';
    for (const el of document.querySelectorAll('[data-access]')) {
        const slug = el.dataset.access, st = await SalonAccess.status(slug);
        if (st === 'approved') el.innerHTML = `<a href="chat.html?theme=${encodeURIComponent(slug)}" class="${base} bg-brand-primary hover:bg-brand-hover">Entrer</a>`;
        else if (st === 'pending') el.innerHTML = `<span class="${base} bg-amber-500 cursor-default"><i class="fa-solid fa-hourglass-half mr-1"></i>Demande en attente</span>`;
        else if (st === 'refused') el.innerHTML = `<span class="${base} bg-slate-400 cursor-default">Demande refusée</span>`;
        else {
            el.innerHTML = `<button class="${base} bg-slate-800 hover:bg-slate-700"><i class="fa-solid fa-lock mr-1"></i>Demander accès</button>`;
            el.querySelector('button').addEventListener('click', () => askAccess(slug));
        }
    }
}
async function askAccess(slug) {
    try { await SalonAccess.request(slug); say('Demande envoyée aux modérateurs'); }
    catch (e) { say("Impossible d'envoyer la demande"); }
    refreshAccess();
}

loadSalons();
if (new URLSearchParams(location.search).get('acces')) say('Salon privé : demandez l\'accès, un modérateur doit l\'accepter.');

// ---- Le bouton "Demandes d'accès" n'apparaît que pour les responsables / super admin ----
if (typeof SalonAccess !== 'undefined' && SalonAccess.canManage) {
    SalonAccess.canManage().then(ok => {
        if (ok) document.getElementById('manageLink').classList.remove('hidden');
    }).catch(() => {});
}
