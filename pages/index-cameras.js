// Extrait de index.html (CSP stricte : plus de script inline dans les pages)
// Caméras en direct : le message d'accueil laisse la place au nombre de lives
(async function () {
    try {
        const r = await fetch(API_URL + '/streams', { credentials: 'include' });
        if (!r.ok) return;
        const streams = ((await r.json()).streams || []);
        if (!streams.length) return;
        const noms = streams.slice(0, 3).map(s => s.broadcasterUsername).filter(Boolean);
        document.getElementById('liveTitle').textContent = streams.length + (streams.length > 1 ? ' caméras en direct' : ' caméra en direct');
        document.getElementById('liveText').textContent = 'En ce moment : ' + noms.join(', ') + (streams.length > noms.length ? ' et ' + (streams.length - noms.length) + ' autre(s)' : '') + '.';
        const btn = document.getElementById('liveAction');
        btn.style.display = "";
        btn.onclick = () => { window.location.href = 'live.html'; };
        document.getElementById('liveNow').classList.add('is-live');
    } catch (e) { /* le message d'accueil reste affiché */ }
})();
