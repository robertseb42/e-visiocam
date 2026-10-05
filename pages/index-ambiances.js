// Extrait de index.html (CSP stricte : plus de script inline dans les pages)
// « Trouvez votre ambiance » : les salons choisis dans Gestion des salons (position + image d'en-tête).
// Sans salon choisi (ou si l'API ne répond pas), les 3 cartes ci-dessus restent affichées.
(async function () {
    const COVERS = ['img/ambiance-lounge.jpg', 'img/ambiance-musique.jpg', 'img/ambiance-rencontres.jpg'];
    const base = API_URL.replace(/\/api\/?$/, '');
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    function cover(s) {
        if (s.coverUrl) return base + s.coverUrl;
        if (s.slug === 'musique') return COVERS[1];
        let h = 0; for (const c of String(s.slug)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
        return [COVERS[0], COVERS[2]][h % 2];
    }
    try {
        const r = await fetch(API_URL + '/salons/home');
        if (!r.ok) return;
        const salons = ((await r.json()).salons || []);
        if (!salons.length) return;
        document.getElementById('ambiances').innerHTML = salons.map(s => {
            const lien = s.isPrivate ? 'salons.html' : 'chat.html?theme=' + encodeURIComponent(s.slug);
            return '<article class="ev-ambiance">' +
                '<img src="' + esc(cover(s)) + '" alt="" loading="lazy" width="557" height="211">' +
                '<div class="ev-ambiance-body">' +
                    '<h3>' + esc(s.name) + (s.isPrivate ? ' <span class="ev-vip">VIP</span>' : '') + '</h3>' +
                    '<p>' + esc(s.description || '') + '</p>' +
                    '<a href="' + esc(lien) + '" class="ev-btn"><i class="fa-solid ' + (s.isPrivate ? 'fa-lock' : 'fa-user-group') + '" aria-hidden="true"></i>' + (s.isPrivate ? 'Demander l\'accès' : 'Rejoindre') + '</a>' +
                '</div></article>';
        }).join('');
    } catch (e) { /* on garde les cartes par défaut */ }
})();
