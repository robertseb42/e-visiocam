// Extrait de credits.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// MES RÉCOMPENSES — niveau, gains du jour, badges, parrainage, classement
// ============================================================
let currentUser = null;
let resume = null;

const TOUS_BADGES = [
    { id: 'fidele', icone: '🔥', nom: 'Fidèle', aide: '7 jours de suite' },
    { id: 'pilier', icone: '🏛️', nom: 'Pilier', aide: '30 jours de suite' },
    { id: 'parrain', icone: '🤝', nom: 'Parrain', aide: '1 filleul validé' },
    { id: 'animateur', icone: '🎙️', nom: 'Animateur', aide: '10 h de live (modèles)' },
    { id: 'ancien', icone: '⭐', nom: 'Ancien', aide: 'Membre depuis 1 an' }
];

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = getCurrentUser();
    if (!currentUser) { window.location.href = 'login.html'; return; }
    if (location.search) window.history.replaceState({}, '', 'credits.html');
    document.getElementById('parrainCopier').addEventListener('click', copierLien);
    await Promise.all([loadRecompenses(), loadClassement(), loadTransactions()]);
    // Un gain arrive en direct : on met la page à jour
    let attente = null;
    window.addEventListener('evc:recompense', () => { clearTimeout(attente); attente = setTimeout(() => { loadRecompenses(); loadTransactions(); }, 800); });
});

async function loadRecompenses() {
    try {
        resume = await apiCall('/rewards/me');
        afficher(resume);
    } catch (err) {
        // Ancien serveur sans le programme : on retombe sur le simple solde
        try { const b = await apiCall('/credits/balance'); document.getElementById('balance').textContent = b.balance; } catch (e) {}
        document.getElementById('jourListe').innerHTML = '<p class="rw-muted text-sm">' + escapeHtml(err.message) + '</p>';
    }
}

function afficher(r) {
    const c = r.config || {};
    document.getElementById('balance').textContent = r.solde;

    // Niveau
    const n = r.niveau || {};
    document.getElementById('niveauPill').textContent = (n.icone || '') + ' ' + (n.nom || '');
    const bar = document.getElementById('niveauBar');
    if (n.suivant) {
        const pct = Math.max(2, Math.min(100, Math.round((r.gagnes - n.min) / (n.suivant.min - n.min) * 100)));
        requestAnimationFrame(() => { bar.style.width = pct + '%'; });
        document.getElementById('niveauTxt').textContent = r.gagnes + ' crédits gagnés au total · encore ' + (n.suivant.min - r.gagnes) + ' pour ' + n.suivant.icone + ' ' + n.suivant.nom;
    } else {
        bar.style.width = '100%';
        document.getElementById('niveauTxt').textContent = r.gagnes + ' crédits gagnés au total · niveau maximum atteint';
    }
    document.getElementById('serieTxt').textContent = r.serie ? '🔥 ' + r.serie + ' jour' + (r.serie > 1 ? 's' : '') + ' de suite' : '';

    // Alertes
    const al = [];
    if (!r.programmeActif) al.push('Le programme de récompenses est en pause pour le moment. Vos crédits et votre niveau sont conservés.');
    else if (!r.confirme) al.push('Confirmez votre adresse e-mail pour commencer à gagner des crédits (lien reçu à l’inscription).');
    else if (!r.eligible) al.push('Vous ne gagnez pas de crédits pendant une sanction en cours (sourdine, expulsion).');
    document.getElementById('alertes').innerHTML = al.map(t => '<div class="rw-alert">⚠️ ' + escapeHtml(t) + '</div>').join('');

    // Aujourd'hui
    const a = r.aujourdhui || {};
    const lignes = [];
    const bonusSerie = (r.serie || 0) >= c.serieJours;
    const prevuJour = bonusSerie ? c.quotidienSerie : c.quotidien;
    lignes.push(ligne('Connexion du jour', a.quotidien > 0 ? '<span class="rw-ok">✓ +' + a.quotidien + '</span>' : '<span class="rw-muted">+' + prevuJour + ' à venir</span>',
        bonusSerie ? 'Bonus de série actif (' + c.serieJours + ' jours et plus)' : 'Encore ' + Math.max(0, c.serieJours - (r.serie || 0)) + ' jour(s) de suite pour passer à +' + c.quotidienSerie + '/jour'));
    lignes.push(ligne('Participation (salons, messages, lives)', '<b>' + a.actif + ' / ' + c.actifMaxJour + '</b>',
        '+' + c.actif15 + ' crédits par tranche de 15 minutes actives', a.actif / (c.actifMaxJour || 1)));
    if (r.estModele) lignes.push(ligne('Lives animés', '<b>' + a.live + ' / ' + c.liveMaxJour + '</b>',
        '+' + c.liveHeure + ' crédits par heure de live public', a.live / (c.liveMaxJour || 1)));
    if (!r.bienvenueRecue && r.confirme) lignes.push(ligne('Bonus de bienvenue', '<span class="rw-muted">+' + c.bienvenue + '</span>', 'Offert à votre prochaine connexion'));
    document.getElementById('jourListe').innerHTML = lignes.join('');
    document.querySelectorAll('#jourListe .rw-bar>i').forEach(i => requestAnimationFrame(() => { i.style.width = i.dataset.w; }));

    // Badges : gagnés d'abord, puis ceux à débloquer
    const gagnes = r.badges || [];
    const ids = new Set(gagnes.map(b => b.id));
    const html = gagnes.map(b => badge(b, true)).concat(TOUS_BADGES.filter(b => !ids.has(b.id)).map(b => badge(b, false)));
    document.getElementById('badgesListe').innerHTML = html.join('');

    // Parrainage
    const p = r.parrainage || {};
    document.getElementById('parrainLien').value = location.origin + location.pathname.replace(/[^/]*$/, '') + 'register.html?parrain=' + encodeURIComponent(p.code || '');
    preparerPartage(document.getElementById('parrainLien').value);
    document.getElementById('parrValides').textContent = p.valides || 0;
    document.getElementById('parrAttente').textContent = p.enAttente || 0;
    document.getElementById('parrRefuses').textContent = p.refuses || 0;
    document.getElementById('parrainRegle').textContent = '+' + c.parrainage + ' crédits pour chaque ami qui s’inscrit avec votre lien, confirme son adresse et participe ' + c.parrainageJoursActifs + ' jours différents (' + c.parrainageMaxMois + ' parrainages par mois au plus).';

    // Comment gagner (montants réels)
    const g = [
        ['🎉', 'Bonus de bienvenue', '+' + c.bienvenue, 'Une seule fois, une fois votre adresse e-mail confirmée.'],
        ['📅', 'Passer chaque jour', '+' + c.quotidien + ' / jour', 'Puis +' + c.quotidienSerie + ' par jour à partir de ' + c.serieJours + ' jours de suite.'],
        ['💬', 'Participer', '+' + c.actif15 + ' / 15 min', 'Écrire dans les salons, réagir, envoyer des messages ou des cadeaux. ' + c.actifMaxJour + ' crédits par jour au plus.'],
        ['🤝', 'Parrainer un ami', '+' + c.parrainage, 'Quand votre filleul a confirmé son compte et participé ' + c.parrainageJoursActifs + ' jours.'],
        ['🛡️', 'Signaler un abus', '+' + c.signalement, 'Si la modération confirme le signalement. ' + c.signalementMaxSemaine + ' par semaine au plus.'],
        ['🎙️', 'Animer des lives (modèles)', '+' + c.liveHeure + ' / heure', 'Live public uniquement. ' + c.liveMaxJour + ' crédits par jour au plus.']
    ];
    document.getElementById('gagnerListe').innerHTML = g.map(x => '<div><span class="amt">' + escapeHtml(x[2]) + '</span><p>' + x[0] + ' ' + escapeHtml(x[1]) + '</p><small>' + escapeHtml(x[3]) + '</small></div>').join('');
}

function ligne(titre, valeur, aide, ratio) {
    return '<div class="rw-row" style="display:block"><div style="display:flex;justify-content:space-between;gap:10px"><span>' + escapeHtml(titre) + '</span>' + valeur + '</div>' +
        (aide ? '<div class="text-xs rw-muted" style="margin-top:2px">' + escapeHtml(aide) + '</div>' : '') +
        (ratio !== undefined ? '<div class="rw-bar"><i data-w="' + Math.round(Math.min(1, ratio) * 100) + '%"></i></div>' : '') + '</div>';
}

function badge(b, ok) {
    return '<div class="rw-badge' + (ok ? '' : ' off') + '" title="' + escapeHtml(ok ? b.aide : 'À débloquer : ' + b.aide) + '"><div class="ic">' + b.icone + '</div><p>' + escapeHtml(b.nom) + '</p><small>' + escapeHtml(ok ? b.aide : '🔒 ' + b.aide) + '</small></div>';
}

async function loadClassement() {
    try {
        const d = await apiCall('/rewards/classement');
        const [y, m] = (d.mois || '').split('-');
        document.getElementById('classementMois').textContent = y ? '· ' + new Date(Date.UTC(+y, +m - 1, 15)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
        const moi = currentUser && currentUser.username;
        const liste = (arr, unite) => arr.length ? arr.map((x, i) => '<li><span class="pos">' + (['🥇', '🥈', '🥉'][i] || (i + 1)) + '</span><span class="nm' + (x.username === moi ? ' me' : '') + '">' + escapeHtml(x.username) + '</span><b>' + x.credits + '</b></li>').join('')
            : '<li class="rw-muted text-xs">Personne pour le moment ce mois-ci</li>';
        document.getElementById('rangMembres').innerHTML = liste(d.membres || []);
        document.getElementById('rangModeles').innerHTML = liste(d.modeles || []);
    } catch (e) {
        document.getElementById('rangMembres').innerHTML = '<li class="rw-muted text-xs">Indisponible</li>';
    }
}

// Partage du lien d'invitation : WhatsApp, Telegram, X, e-mail, ou le menu de partage du téléphone
function preparerPartage(lien) {
    const texte = 'Rejoins-moi sur E-VISIOCAM : salons, radio, quiz musicaux et chat webcam entre adultes. Inscription gratuite :';
    const t = encodeURIComponent(texte), l = encodeURIComponent(lien);
    document.getElementById('partageWhatsapp').href = 'https://wa.me/?text=' + t + '%20' + l;
    document.getElementById('partageTelegram').href = 'https://t.me/share/url?url=' + l + '&text=' + t;
    document.getElementById('partageX').href = 'https://x.com/intent/post?text=' + t + '&url=' + l;
    document.getElementById('partageMail').href = 'mailto:?subject=' + encodeURIComponent('Rejoins-moi sur E-VISIOCAM') + '&body=' + t + '%0A%0A' + l;
    const natif = document.getElementById('partageNatif');
    if (navigator.share) {
        natif.hidden = false;
        natif.onclick = () => navigator.share({ title: 'E-VISIOCAM', text: texte, url: lien }).catch(() => {});
    }
}

async function copierLien() {
    const inp = document.getElementById('parrainLien');
    try { await navigator.clipboard.writeText(inp.value); }
    catch (e) { inp.select(); try { document.execCommand('copy'); } catch (e2) {} }
    showToast('Lien d’invitation copié', 'success');
}

async function loadTransactions() {
    const tbody = document.getElementById('transactionsTable');
    try {
        const data = await apiCall('/credits/transactions');
        const liste = data.transactions || [];
        if (!liste.length) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-slate-400 text-sm">Aucun mouvement pour le moment</td></tr>';
            return;
        }
        const typeLabels = { reward: '🎁 Récompense', bonus: '🎁 Bonus', spend: '💝 Cadeau offert', refund: '↩️ Remboursement', retrait: '⛔ Retrait', reset: '🔄 Remise à zéro', purchase: '🛒 Ancien achat' };
        const quand = t => new Date(String(t).replace(' ', 'T') + (/[TZ]/.test(t) ? '' : 'Z')).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        tbody.innerHTML = liste.map(t => {
            const plus = t.amount > 0;
            return '<tr class="border-b border-slate-50 hover:bg-slate-50/50">' +
                '<td class="py-3 px-4 text-xs text-slate-500 whitespace-nowrap">' + escapeHtml(quand(t.created_at)) + '</td>' +
                '<td class="py-3 px-4 text-sm font-medium whitespace-nowrap">' + escapeHtml(typeLabels[t.type] || t.type) + '</td>' +
                '<td class="py-3 px-4 text-xs text-slate-600">' + escapeHtml(t.description || '—') + '</td>' +
                '<td class="py-3 px-4 text-right font-bold ' + (plus ? 'text-emerald-600' : 'text-rose-600') + '">' + (plus ? '+' : '') + Number(t.amount) + '</td></tr>';
        }).join('');
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-rose-500">' + escapeHtml(err.message) + '</td></tr>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}
