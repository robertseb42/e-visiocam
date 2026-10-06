// Extrait de moderation-salons.html (CSP stricte : plus de script inline dans les pages)
// ------------------------------------------------------------------
// GESTION DES SALONS : liste réelle du serveur (noms, icônes, VIP, masqué)
// ------------------------------------------------------------------
let SALONS = [];
let names = {};
let PRIVATE = [];
let filtre = '';

const toast = m => (window.showToast ? showToast(m) : alert(m));
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const when = d => new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

function badges(s) {
    let b = '';
    if (s.isPrivate) b += '<span class="ml-1 align-middle text-[10px] bg-pink-50 text-brand-primary font-bold px-2 py-0.5 rounded-full">🔒 VIP</span>';
    if (s.isHidden) b += '<span class="ml-1 align-middle text-[10px] bg-slate-200 text-slate-600 font-bold px-2 py-0.5 rounded-full">🚫 MASQUÉ</span>';
    if (s.homeOrder) b += '<span class="ml-1 align-middle text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full" title="Carte « Trouvez votre ambiance » de l\'accueil">🏠 ACCUEIL n°' + s.homeOrder + '</span>';
    return b;
}

function ligneSalon(s) {
    const actions = `
        <button data-ms="ouvrirEdition" data-ms-args="${esc(JSON.stringify([s.slug]))}" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-pen mr-1"></i>Modifier</button>
        ${s.isPrivate
            ? `<button data-ms="setVip" data-ms-args="${esc(JSON.stringify([s.slug, false]))}" class="px-3 py-2 bg-amber-100 text-amber-700 hover:bg-amber-200 text-xs font-bold rounded-xl"><i class="fa-solid fa-lock-open mr-1"></i>Retirer le VIP</button>`
            : `<button data-ms="setVip" data-ms-args="${esc(JSON.stringify([s.slug, true]))}" class="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-lock mr-1"></i>Rendre VIP</button>`}
        ${s.isHidden
            ? `<button data-ms="setVisible" data-ms-args="${esc(JSON.stringify([s.slug, true]))}" class="px-3 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-xs font-bold rounded-xl"><i class="fa-solid fa-eye mr-1"></i>Réafficher</button>`
            : `<button data-ms="setVisible" data-ms-args="${esc(JSON.stringify([s.slug, false]))}" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl"><i class="fa-solid fa-eye-slash mr-1"></i>Masquer</button>`}
    `;
    return `
    <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm" id="bloc-${esc(s.slug)}">
        <div class="flex flex-wrap items-center gap-3">
            <div class="text-2xl w-9 text-center">${SalonAccess.logoHtml ? SalonAccess.logoHtml(s, 32) : (s.icon || '💬')}</div>
            <div class="flex-1 min-w-[180px]">
                <p class="font-bold text-slate-900">${esc(s.name)}${badges(s)}</p>
                <p class="text-xs text-slate-500">${esc(s.description || 'Sans description')} · ${s.members || 0} membre(s)</p>
            </div>
            <div class="flex flex-wrap gap-1 justify-end">${actions}</div>
        </div>

        <div id="edit-${esc(s.slug)}" class="hidden mt-3 pt-3 border-t border-slate-100">
            <div class="grid gap-2 md:grid-cols-[70px_1fr_1.4fr_auto]">
                <input id="e-ic-${esc(s.slug)}" maxlength="4" value="${esc(s.icon || '')}" placeholder="🙂" class="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none text-center">
                <input id="e-nm-${esc(s.slug)}" maxlength="40" value="${esc(s.name)}" placeholder="Nom du salon" class="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none">
                <input id="e-ds-${esc(s.slug)}" maxlength="200" value="${esc(s.description || '')}" placeholder="Description" class="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none">
                <div class="flex gap-2">
                    <button data-ms="enregistrerSalon" data-ms-args="${esc(JSON.stringify([s.slug]))}" class="px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-check mr-1"></i>Enregistrer</button>
                    <button data-ms="fermerEdition" data-ms-args="${esc(JSON.stringify([s.slug]))}" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl">Fermer</button>
                </div>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100" data-logo="${esc(s.slug)}">
                <p class="text-xs font-bold text-slate-800 mb-1"><i class="fa-solid fa-image mr-1"></i>Logo image du salon <span class="font-normal text-slate-500">(remplace l'emoji)</span></p>
                <ul class="text-[11px] text-slate-500 mb-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                    <li><b>Taille conseillée :</b> 256 × 256 px (carré)</li>
                    <li><b>Minimum :</b> 64 × 64 px (en dessous, flou)</li>
                    <li><b>Formats :</b> PNG (fond transparent conseillé), JPG ou WebP</li>
                    <li><b>Poids :</b> 2 Mo maximum (réduite automatiquement)</li>
                    <li><b>Image non carrée :</b> centrée en entier, sans déformation</li>
                    <li><b>Affichage :</b> 22 px dans le salon, 40 px sur la page Salons</li>
                </ul>
                <div class="flex flex-wrap items-center gap-2">
                    <div class="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-2xl overflow-hidden shrink-0" title="Logo actuel">${SalonAccess.logoHtml ? SalonAccess.logoHtml(s, 40) : esc(s.icon || '💬')}</div>
                    <input type="file" class="hidden" accept="image/png,image/jpeg,image/webp" data-file>
                    <button type="button" data-act="choisir" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-upload mr-1"></i>Choisir une image</button>
                    <button type="button" data-act="appliquer" disabled class="px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl opacity-50 cursor-not-allowed"><i class="fa-solid fa-check mr-1"></i>Appliquer</button>
                    ${s.logoUrl ? '<button type="button" data-act="retirer" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl"><i class="fa-solid fa-trash mr-1"></i>Retirer l\'image</button>' : ''}
                    <span class="text-[11px] text-slate-400">${s.logoUrl ? 'Logo actuel : image' : 'Logo actuel : emoji'}</span>
                </div>
                <div data-apercu class="hidden mt-3 rounded-xl bg-slate-50 border border-slate-200 p-3">
                    <p class="text-[11px] text-slate-500 mb-2" data-info></p>
                    <div class="flex items-end gap-5">
                        <figure class="text-center"><img data-p40 alt="" style="width:40px;height:40px;object-fit:contain;border-radius:8px" class="mx-auto"><figcaption class="text-[10px] text-slate-400 mt-1">Page Salons</figcaption></figure>
                        <figure class="text-center"><img data-p22 alt="" style="width:22px;height:22px;object-fit:contain;border-radius:4px" class="mx-auto"><figcaption class="text-[10px] text-slate-400 mt-1">Dans le salon</figcaption></figure>
                    </div>
                </div>
                <p data-msg class="hidden"></p>
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100" data-cover="${esc(s.slug)}">
                <p class="text-xs font-bold text-slate-800 mb-1"><i class="fa-solid fa-panorama mr-1"></i>Image d'en-tête <span class="font-normal text-slate-500">(carte « Trouvez votre ambiance » de l'accueil)</span></p>
                <ul class="text-[11px] text-slate-500 mb-3 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
                    <li><b>Taille conseillée :</b> 1600 × 605 px (format bannière)</li>
                    <li><b>Minimum :</b> 600 × 200 px</li>
                    <li><b>Formats :</b> JPG, PNG ou WebP · 10 Mo maximum</li>
                    <li><b>Autre format :</b> recadrée au centre automatiquement</li>
                </ul>
                <div class="flex flex-wrap items-start gap-3">
                    <div class="w-full sm:w-64 rounded-xl overflow-hidden bg-slate-900 shrink-0" style="aspect-ratio:557/211">
                        <img data-cover-img src="${esc(coverSrc(s))}" alt="" class="w-full h-full object-cover">
                    </div>
                    <div class="flex-1 min-w-[220px]">
                        <p class="text-[11px] text-slate-400 mb-2" data-cover-info>${s.coverUrl ? 'Image actuelle : la vôtre' : 'Image actuelle : image par défaut du site'}</p>
                        <div class="flex flex-wrap items-center gap-2">
                            <input type="file" class="hidden" accept="image/png,image/jpeg,image/webp" data-cover-file>
                            <button type="button" data-cact="choisir" class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-upload mr-1"></i>Choisir une image</button>
                            <button type="button" data-cact="appliquer" disabled class="px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl opacity-50 cursor-not-allowed"><i class="fa-solid fa-check mr-1"></i>Appliquer</button>
                            ${s.coverUrl ? '<button type="button" data-cact="retirer" class="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold rounded-xl"><i class="fa-solid fa-trash mr-1"></i>Retirer l\'image</button>' : ''}
                        </div>
                        <label class="flex flex-wrap items-center gap-2 mt-3 text-xs font-bold text-slate-700">
                            <i class="fa-solid fa-house"></i> Sur l'accueil :
                            <select data-home class="px-3 py-2 text-xs rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none">
                                <option value="">Non affiché</option>
                                ${[1,2,3,4,5,6].map(n => '<option value="' + n + '"' + (s.homeOrder === n ? ' selected' : '') + '>Position ' + n + '</option>').join('')}
                            </select>
                        </label>
                        <p data-cover-msg class="hidden"></p>
                    </div>
                </div>
            </div>
        </div>
    </div>`;
}

// Image d'en-tête affichée : celle du salon, sinon l'image par défaut (même règle que l'accueil)
const COVERS_DEFAUT = ['img/ambiance-lounge.jpg', 'img/ambiance-musique.jpg', 'img/ambiance-rencontres.jpg'];
const API_BASE = (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api').replace(/\/api\/?$/, '');
function coverSrc(s) {
    if (s && s.coverUrl) return API_BASE + s.coverUrl;
    if (s && s.slug === 'musique') return COVERS_DEFAUT[1];
    let h = 0; for (const c of String(s && s.slug || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return [COVERS_DEFAUT[0], COVERS_DEFAUT[2]][h % 2];
}

function rendreListe() {
    const zone = document.getElementById('salonsList');
    const f = filtre.trim().toLowerCase();
    const liste = f ? SALONS.filter(s => (s.name || '').toLowerCase().includes(f) || (s.slug || '').includes(f)) : SALONS;
    zone.innerHTML = liste.length
        ? liste.map(ligneSalon).join('')
        : '<p class="text-sm text-slate-500">Aucun salon ne correspond à la recherche.</p>';
}

async function chargerSalons() {
    SALONS = await SalonAccess.salons();
    names = {};
    SALONS.forEach(s => { names[s.slug] = s.name; });
    PRIVATE = SALONS.filter(s => s.isPrivate).map(s => s.slug);
}

function ouvrirEdition(slug) {
    const zone = document.getElementById('edit-' + slug);
    if (zone) { zone.classList.remove('hidden'); const champ = document.getElementById('e-nm-' + slug); if (champ) champ.focus(); }
}
function fermerEdition(slug) {
    const zone = document.getElementById('edit-' + slug);
    if (zone) zone.classList.add('hidden');
}

async function enregistrerSalon(slug) {
    const nom = (document.getElementById('e-nm-' + slug).value || '').trim();
    const icone = (document.getElementById('e-ic-' + slug).value || '').trim();
    const desc = (document.getElementById('e-ds-' + slug).value || '').trim();
    if (nom.length < 3) { toast('Nom trop court (3 caractères minimum)'); return; }
    try {
        const rep = await SalonAccess.renommer(slug, { name: nom, icon: icone, description: desc });
        const maj = (rep && rep.salon) || { slug, name: nom, icon: icone, description: desc };
        const i = SALONS.findIndex(s => s.slug === slug);
        if (i >= 0) SALONS[i] = Object.assign({}, SALONS[i], maj);
        names[slug] = maj.name || nom;
        rendreListe();
        toast('✅ Salon enregistré');
    } catch (e) {
        toast(e.message || 'Modification impossible');
    }
}

// ------------------------------------------------------------------
// ➕ Créer un salon (super administrateur)
// ------------------------------------------------------------------
const formCreation = document.getElementById('createSalonForm');
if (formCreation) formCreation.onsubmit = async e => {
    e.preventDefault();
    const name = document.getElementById('new-nm').value.trim();
    const icon = document.getElementById('new-ic').value.trim();
    const description = document.getElementById('new-ds').value.trim();
    if (name.length < 3) { toast('Nom trop court (3 caractères minimum)'); return; }
    const bouton = document.getElementById('new-btn');
    bouton.disabled = true;
    try {
        const body = { name, description };
        if (icon) body.icon = icon;
        const rep = await apiCall('/salons', { method: 'POST', body: JSON.stringify(body) });
        formCreation.reset();
        toast('✅ Salon créé : ' + rep.salon.name);
        await chargerSalons();
        rendreListe();
        ouvrirEdition(rep.salon.slug);   // on peut tout de suite lui mettre un logo
        const bloc = document.getElementById('bloc-' + rep.salon.slug);
        if (bloc && bloc.scrollIntoView) bloc.scrollIntoView({ block: 'center' });
    } catch (err) {
        toast(err.message || 'Création du salon impossible');
    } finally {
        bouton.disabled = false;
    }
};

// ------------------------------------------------------------------
// 🖼️ Logo image d'un salon : choisir → aperçu → Appliquer
// ------------------------------------------------------------------
const logoEnAttente = {};   // slug -> { data, w, h, cote, octets, nom }
const blocLogo = slug => [...document.querySelectorAll('[data-logo]')].find(b => b.dataset.logo === slug);

function messageLogo(slug, texte, ok) {
    const b = blocLogo(slug); if (!b) return;
    const m = b.querySelector('[data-msg]');
    m.textContent = texte || '';
    m.className = 'text-xs mt-2 ' + (texte ? (ok ? 'text-emerald-600' : 'text-rose-600') : 'hidden');
}
function activerAppliquer(slug, actif) {
    const b = blocLogo(slug); if (!b) return;
    const bt = b.querySelector('[data-act="appliquer"]');
    bt.disabled = !actif;
    bt.className = 'px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl ' + (actif ? 'hover:bg-brand-hover' : 'opacity-50 cursor-not-allowed');
}
// Remet la liste à jour avec la réponse du serveur, en gardant le panneau ouvert
function majSalonApresLogo(slug, rep) {
    const i = SALONS.findIndex(s => s.slug === slug);
    if (i >= 0 && rep && rep.salon) SALONS[i] = Object.assign({}, SALONS[i], rep.salon);
    rendreListe();
    ouvrirEdition(slug);
}

async function choisirLogoSalon(slug, file) {
    delete logoEnAttente[slug];
    activerAppliquer(slug, false);
    const b = blocLogo(slug); if (!b) return;
    b.querySelector('[data-apercu]').classList.add('hidden');
    messageLogo(slug, 'Préparation de l\'image...', true);
    try {
        const r = await SalonLogo.preparerImage(file);
        r.nom = file.name;
        logoEnAttente[slug] = r;
        b.querySelector('[data-p40]').src = r.data;
        b.querySelector('[data-p22]').src = r.data;
        b.querySelector('[data-info]').textContent = 'Aperçu : ' + file.name + ' · ' + r.w + ' × ' + r.h + ' px → logo '
            + r.cote + ' × ' + r.cote + ' px · ' + Math.max(1, Math.round(r.octets / 1024)) + ' Ko. Rien n\'est encore appliqué.';
        b.querySelector('[data-apercu]').classList.remove('hidden');
        messageLogo(slug, '');
        activerAppliquer(slug, true);
    } catch (err) {
        messageLogo(slug, err.message, false);
    }
}

async function appliquerLogoSalon(slug) {
    const p = logoEnAttente[slug]; if (!p) return;
    activerAppliquer(slug, false);
    messageLogo(slug, 'Envoi en cours...', true);
    try {
        const rep = await apiCall('/salons/' + encodeURIComponent(slug) + '/logo', { method: 'PUT', body: JSON.stringify({ image: p.data }) });
        delete logoEnAttente[slug];
        toast('✅ Logo appliqué : il apparaît sur le site');
        majSalonApresLogo(slug, rep);
    } catch (err) {
        messageLogo(slug, 'Échec : ' + err.message, false);
        activerAppliquer(slug, true);
    }
}

async function retirerLogoSalon(slug) {
    if (!confirm('Retirer l\'image du salon « ' + (names[slug] || slug) + ' » ?\n\nLe salon reprendra son emoji.')) return;
    try {
        const rep = await apiCall('/salons/' + encodeURIComponent(slug) + '/logo', { method: 'DELETE' });
        toast('Image retirée : le salon reprend son emoji');
        majSalonApresLogo(slug, rep);
    } catch (err) { messageLogo(slug, 'Échec : ' + err.message, false); }
}

document.getElementById('salonsList').addEventListener('click', e => {
    const bt = e.target.closest('[data-logo] [data-act]'); if (!bt || bt.disabled) return;
    const bloc = bt.closest('[data-logo]'), slug = bloc.dataset.logo;
    if (bt.dataset.act === 'choisir') bloc.querySelector('[data-file]').click();
    else if (bt.dataset.act === 'appliquer') appliquerLogoSalon(slug);
    else if (bt.dataset.act === 'retirer') retirerLogoSalon(slug);
});
document.getElementById('salonsList').addEventListener('change', e => {
    const inp = e.target.closest('[data-logo] [data-file]');
    if (!inp || !inp.files || !inp.files[0]) return;
    const slug = inp.closest('[data-logo]').dataset.logo, file = inp.files[0];
    choisirLogoSalon(slug, file).then(() => { inp.value = ''; });
});

// ------------------------------------------------------------------
// 🏞️ Image d'en-tête + place sur l'accueil
// ------------------------------------------------------------------
const coverEnAttente = {};
const blocCover = slug => [...document.querySelectorAll('[data-cover]')].find(b => b.dataset.cover === slug);
function messageCover(slug, texte, ok) {
    const b = blocCover(slug); if (!b) return;
    const m = b.querySelector('[data-cover-msg]');
    m.textContent = texte || '';
    m.className = 'text-xs mt-2 ' + (texte ? (ok ? 'text-emerald-600' : 'text-rose-600') : 'hidden');
}
function activerCover(slug, actif) {
    const b = blocCover(slug); if (!b) return;
    const bt = b.querySelector('[data-cact="appliquer"]');
    bt.disabled = !actif;
    bt.className = 'px-4 py-2 bg-brand-primary text-white text-xs font-bold rounded-xl ' + (actif ? 'hover:bg-brand-hover' : 'opacity-50 cursor-not-allowed');
}
async function choisirCover(slug, file) {
    delete coverEnAttente[slug];
    activerCover(slug, false);
    messageCover(slug, 'Préparation de l\'image...', true);
    try {
        const r = await SalonLogo.preparerCouverture(file);
        coverEnAttente[slug] = r;
        const b = blocCover(slug);
        b.querySelector('[data-cover-img]').src = r.data;
        b.querySelector('[data-cover-info]').textContent = 'Aperçu : ' + file.name + ' · ' + r.w + ' × ' + r.h + ' px → ' + r.largeur + ' × ' + r.hauteur
            + ' px · ' + Math.max(1, Math.round(r.octets / 1024)) + ' Ko. Rien n\'est encore appliqué.';
        messageCover(slug, '');
        activerCover(slug, true);
    } catch (err) { messageCover(slug, err.message, false); }
}
async function appliquerCover(slug) {
    const p = coverEnAttente[slug]; if (!p) return;
    activerCover(slug, false);
    messageCover(slug, 'Envoi en cours...', true);
    try {
        const rep = await apiCall('/salons/' + encodeURIComponent(slug) + '/cover', { method: 'PUT', body: JSON.stringify({ image: p.data }) });
        delete coverEnAttente[slug];
        toast('✅ Image d\'en-tête appliquée');
        majSalonApresLogo(slug, rep);
    } catch (err) { messageCover(slug, 'Échec : ' + err.message, false); activerCover(slug, true); }
}
async function retirerCover(slug) {
    if (!confirm('Retirer l\'image d\'en-tête de « ' + (names[slug] || slug) + ' » ?\n\nLa carte de l\'accueil reprendra l\'image par défaut.')) return;
    try {
        const rep = await apiCall('/salons/' + encodeURIComponent(slug) + '/cover', { method: 'DELETE' });
        toast('Image retirée : image par défaut');
        majSalonApresLogo(slug, rep);
    } catch (err) { messageCover(slug, 'Échec : ' + err.message, false); }
}
async function placerAccueil(slug, valeur) {
    try {
        const rep = await apiCall('/salons/' + encodeURIComponent(slug) + '/home', { method: 'PUT', body: JSON.stringify({ position: valeur ? Number(valeur) : null }) });
        // Les positions des autres salons ont pu bouger : on les met toutes à jour
        const pos = {}; (rep.home || []).forEach(h => { pos[h.slug] = h.homeOrder; });
        SALONS.forEach(s => { s.homeOrder = pos[s.slug] || null; });
        toast(valeur ? '🏠 Affiché sur l\'accueil, position ' + pos[slug] : 'Retiré de l\'accueil');
        majSalonApresLogo(slug, rep);
    } catch (err) { messageCover(slug, 'Échec : ' + err.message, false); majSalonApresLogo(slug, null); }
}
document.getElementById('salonsList').addEventListener('click', e => {
    const bt = e.target.closest('[data-cover] [data-cact]'); if (!bt || bt.disabled) return;
    const bloc = bt.closest('[data-cover]'), slug = bloc.dataset.cover;
    if (bt.dataset.cact === 'choisir') bloc.querySelector('[data-cover-file]').click();
    else if (bt.dataset.cact === 'appliquer') appliquerCover(slug);
    else if (bt.dataset.cact === 'retirer') retirerCover(slug);
});
document.getElementById('salonsList').addEventListener('change', e => {
    const sel = e.target.closest('[data-cover] [data-home]');
    if (sel) { placerAccueil(sel.closest('[data-cover]').dataset.cover, sel.value); return; }
    const inp = e.target.closest('[data-cover] [data-cover-file]');
    if (!inp || !inp.files || !inp.files[0]) return;
    const slug = inp.closest('[data-cover]').dataset.cover;
    choisirCover(slug, inp.files[0]).then(() => { inp.value = ''; });
});

// 🔒 Passer un salon en VIP, ou lui retirer le VIP
async function setVip(slug, isPrivate) {
    const nom = names[slug] || slug;
    const question = isPrivate
        ? 'Rendre « ' + nom + ' » VIP ?\n\nLe salon ne sera plus accessible sans demande d\'accès validée.'
        : 'Retirer le VIP de « ' + nom + ' » ?\n\nLe salon redeviendra ouvert à tous.';
    if (!confirm(question)) return;
    try {
        await SalonAccess.setPrivate(slug, isPrivate);
        const i = SALONS.findIndex(s => s.slug === slug);
        if (i >= 0) SALONS[i].isPrivate = !!isPrivate;
        PRIVATE = SALONS.filter(s => s.isPrivate).map(s => s.slug);
        rendreListe();
        toast(isPrivate ? '🔒 ' + nom + ' est désormais VIP' : '🔓 ' + nom + ' est redevenu public');
    } catch (e) {
        toast(e.message || 'Action réservée au super administrateur');
    }
    render();
}

// 🚫 Masquer un salon (il disparaît du site) ou le réafficher
async function setVisible(slug, visible) {
    const nom = names[slug] || slug;
    const question = visible
        ? 'Réafficher « ' + nom + ' » ?\n\nLe salon redeviendra visible et accessible.'
        : 'Masquer « ' + nom + ' » ?\n\nLe salon disparaîtra du site et ne sera plus accessible. Vous pourrez le réafficher ici.';
    if (!confirm(question)) return;
    try {
        await SalonAccess.setVisible(slug, visible);
        const i = SALONS.findIndex(s => s.slug === slug);
        if (i >= 0) SALONS[i].isHidden = !visible;
        rendreListe();
        toast(visible ? '👁️ ' + nom + ' est réaffiché' : '🚫 ' + nom + ' est masqué');
    } catch (e) {
        toast(e.message || 'Action réservée au super administrateur');
    }
}

// ------------------------------------------------------------------
async function render() {
    const u = await SalonAccess.me();
    const sup = SalonAccess.isSuper(u), modo = SalonAccess.isModerator(u), ok = await SalonAccess.canManage();
    document.getElementById('denied').classList.toggle('hidden', ok);
    document.getElementById('panel').classList.toggle('hidden', !ok);
    document.getElementById('who').textContent = sup
        ? 'Super administrateur : vous gérez les salons et toutes les demandes.'
        : modo
          ? 'Modérateur : vous voyez toutes les demandes et pouvez les valider.'
          : ok ? 'Responsable de : ' + u.manages.map(s => names[s] || s).join(', ') : 'Acceptez ou refusez les demandes des membres.';
    if (!ok) return;

    await chargerSalons();

    // Liste des salons + actions (super admin uniquement)
    document.getElementById('salonsSec').classList.toggle('hidden', !sup);
    if (sup) rendreListe();

    // Responsables des salons VIP (super admin)
    document.getElementById('mgrSec').classList.toggle('hidden', !(sup && PRIVATE.length));
    if (sup && PRIVATE.length) {
        const [mg, us] = await Promise.all([SalonAccess.managers(), SalonAccess.users()]);
        document.getElementById('usersList').innerHTML = us.map(n => `<option value="${esc(n)}">`).join('');
        document.getElementById('mgrs').innerHTML = PRIVATE.map(s => `
            <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3">
                <div class="flex-1 min-w-[160px]">
                    <p class="font-bold text-slate-900">${esc(names[s] || s)}</p>
                    <p class="text-xs text-slate-500">${mg[s] ? 'Responsable : <b>' + esc(mg[s]) + '</b>' : 'Aucun responsable : seules vos décisions comptent'}</p>
                </div>
                <input id="m-${s}" list="usersList" value="${esc(mg[s] || '')}" placeholder="Nom du membre" class="px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-brand-primary focus:outline-none">
                <button data-ms="saveMgr" data-ms-args="${esc(JSON.stringify([s]))}" class="px-4 py-2 bg-brand-primary hover:bg-brand-hover text-white text-xs font-bold rounded-xl">Désigner</button>
                ${mg[s] ? `<button data-ms="saveMgr" data-ms-args="${esc(JSON.stringify([s, true]))}" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl">Retirer</button>` : ''}
            </div>`).join('');
    }

    // Demandes
    let list = [];
    try { list = await SalonAccess.listRequests(); } catch (e) { toast('Impossible de charger les demandes'); }
    const pending = list.filter(r => r.status === 'pending');
    const done = list.filter(r => r.status !== 'pending').reverse();

    document.getElementById('pc').textContent = pending.length ? '(' + pending.length + ')' : '';
    document.getElementById('pending').innerHTML = pending.length ? pending.map(r => `
        <div class="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-sm flex flex-wrap items-center gap-3">
            <div class="flex-1 min-w-[200px]">
                <p class="font-bold text-slate-900">${esc(r.user)}</p>
                <p class="text-xs text-slate-500">demande l'accès à <b>${esc(names[r.slug] || r.slug)}</b> · ${when(r.date)}</p>
            </div>
            <button data-ms="decide" data-ms-args="${esc(JSON.stringify([r.id, 'approved']))}" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-xs font-bold rounded-xl"><i class="fa-solid fa-check mr-1"></i>Accepter</button>
            <button data-ms="decide" data-ms-args="${esc(JSON.stringify([r.id, 'refused']))}" class="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl"><i class="fa-solid fa-xmark mr-1"></i>Refuser</button>
        </div>`).join('') : '<p class="text-sm text-slate-500">Aucune demande en attente.</p>';

    document.getElementById('done').innerHTML = done.length ? done.map(r => `
        <div class="bg-white rounded-xl px-4 py-2 border border-slate-200/80 text-sm flex flex-wrap gap-2 items-center">
            <b>${esc(r.user)}</b><span class="text-slate-500">· ${esc(names[r.slug] || r.slug)}</span>
            <span class="ml-auto text-xs font-bold ${r.status === 'approved' ? 'text-green-600' : 'text-red-500'}">${r.status === 'approved' ? 'Accepté' : 'Refusé'}${r.by ? ' par ' + esc(r.by) : ''}</span>
        </div>`).join('') : '<p class="text-sm text-slate-500">Rien pour le moment.</p>';
}

async function decide(id, decision) {
    try { await SalonAccess.decide(id, decision); toast(decision === 'approved' ? 'Accès accordé' : 'Demande refusée'); }
    catch (e) { toast('Action impossible : vous n\'êtes pas responsable de ce salon'); }
    render();
}

async function saveMgr(slug, remove) {
    const name = remove ? '' : document.getElementById('m-' + slug).value.trim();
    if (!remove && !name) { toast('Indiquez le nom du responsable'); return; }
    try { await SalonAccess.setManager(slug, name); toast(remove ? 'Responsable retiré' : name + ' est responsable de ' + names[slug]); }
    catch (e) { toast('Action réservée au super administrateur'); }
    render();
}

const champRecherche = document.getElementById('q');
if (champRecherche) champRecherche.oninput = e => { filtre = e.target.value || ''; rendreListe(); };

if (SalonAccess.DEMO) {
    const d = document.getElementById('demo'), s = document.getElementById('userSel');
    s.innerHTML = SalonAccess.DEMO_USERS.map(n => `<option>${n}</option>`).join('');
    SalonAccess.me().then(u => { s.value = u.name; });
    d.classList.remove('hidden');
    s.onchange = () => { SalonAccess.setUser(s.value); render(); };
}
render();

// ---------- Boutons générés (Modifier, VIP, Masquer, Désigner, Accepter…) ----------
// Remplacent des attributs onclick, bloqués par la CSP stricte. Les arguments sont en JSON dans
// data-ms-args : un nom de salon avec une apostrophe ne peut plus casser (ni injecter) le code.
const ACTIONS_MS = new Set(['ouvrirEdition', 'fermerEdition', 'enregistrerSalon', 'setVip', 'setVisible', 'saveMgr', 'decide']);
document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ms]');
    if (!b || !ACTIONS_MS.has(b.dataset.ms)) return;
    window[b.dataset.ms](...JSON.parse(b.dataset.msArgs || '[]'));
});
