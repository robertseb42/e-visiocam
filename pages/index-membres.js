// Extrait de index.html (CSP stricte : plus de script inline dans les pages)
// 👥 « Qui est là ? » : membres connectés en ce moment (rafraîchi chaque minute)
(function () {
    const zone = document.getElementById('quiEstLa'), liste = document.getElementById('quiListe');
    const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    async function charger() {
        try {
            const r = await fetch(API_URL + '/models/online', { credentials: 'include' });
            if (!r.ok) return;
            const d = await r.json();
            if (!d.total) { zone.hidden = true; return; }
            zone.hidden = false;
            document.getElementById('quiNombre').textContent = d.total + ' connecté' + (d.total > 1 ? 's' : '');
            if (!d.connecte) {
                // Visiteur : on montre que c'est vivant, sans dévoiler les membres
                const ombres = Array.from({ length: Math.min(d.total, 6) }, () => '<span class="ev-qui-ombre" aria-hidden="true"></span>').join('');
                liste.innerHTML = '<div class="ev-qui-invite">' + ombres + '<p>' + d.total + ' membre' + (d.total > 1 ? 's sont' : ' est') + ' en ligne en ce moment.</p><a href="register.html" class="ev-btn">Rejoindre gratuitement</a></div>';
                document.getElementById('quiLien').hidden = true;
                return;
            }
            const photo = m => (typeof urlAvatar === 'function') ? urlAvatar(m.avatar) : null;
            let html = d.membres.map(m => '<button type="button" class="ev-qui-m' + (m.isLive ? ' live' : '') + '" data-fiche="' + Number(m.id) + '" title="' + esc(m.username + (m.isLive ? ' — en direct' : ' — connecté')) + '">' +
                '<span class="ev-qui-photo"><img src="' + esc(photo(m) || '') + '" alt="" loading="lazy">' + (m.isLive ? '<span class="ev-qui-live">LIVE</span>' : '') + '</span>' +
                '<span class="ev-qui-nom">' + esc(m.moi ? 'Vous' : m.username) + '</span></button>').join('');
            const autres = d.total - d.membres.length;
            if (autres > 0) html += '<a href="modeles.html" class="ev-qui-m" style="text-decoration:none"><span class="ev-qui-photo" style="display:flex;align-items:center;justify-content:center;font-weight:900;background:var(--h-border)">+' + autres + '</span><span class="ev-qui-nom">autre' + (autres > 1 ? 's' : '') + '</span></a>';
            liste.innerHTML = html;
        } catch (e) { /* le bandeau reste caché */ }
    }
    charger();
    setInterval(charger, 60000);
})();
