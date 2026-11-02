/* Bandeau d'accueil : pastille « en ligne » avec de VRAIS chiffres.
   Elle reste cachée tant que le serveur ne fournit pas GET /stats/public
   au format { "enLigne": 123, "salonsActifs": 8 } — jamais de faux chiffres. */
// En dessous de ce nombre, on n'affiche rien (un « 2 personnes en ligne » refroidit plus qu'il n'attire).
const MIN_AFFICHE = 5;
(async function () {
    const boite = document.getElementById('evhDirect');
    const texte = document.getElementById('evhDirectTexte');
    if (!boite || !texte || typeof API_URL === 'undefined') return;
    try {
        const r = await fetch(API_URL + '/stats/public', { cache: 'no-store' });
        if (!r.ok) return;
        const d = await r.json();
        const n = Number(d && d.enLigne), s = Number(d && d.salonsActifs);
        if (!Number.isFinite(n) || n < MIN_AFFICHE) return;
        const fmt = new Intl.NumberFormat('fr-FR');
        texte.textContent = fmt.format(n) + (n > 1 ? ' personnes en ligne' : ' personne en ligne') +
            (Number.isFinite(s) && s > 0 ? ' · ' + fmt.format(s) + (s > 1 ? ' salons actifs' : ' salon actif') : '');
        boite.hidden = false;
    } catch (e) { /* serveur indisponible : la pastille reste cachée */ }
})();
