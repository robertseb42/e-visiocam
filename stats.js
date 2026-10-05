// ============================================================
// STATISTIQUES DU SITE (panneau Super Admin) — E-VISIOCAM
// ------------------------------------------------------------
// Chaque jour (heure de Paris) on retient :
//   - qui s'est connecté (une ligne par membre et par jour : daily_activity)
//   - le pic de membres connectés en même temps (daily_peak)
// Les inscriptions et les crédits vendus viennent des tables existantes
// (users.created_at ; credits_transactions : crédits gagnés et dépensés, le site étant gratuit).
// ============================================================
const database = require('./database');
const { db } = database;

db.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity (
        day TEXT NOT NULL,                 -- AAAA-MM-JJ, heure de Paris
        user_id INTEGER NOT NULL,
        PRIMARY KEY (day, user_id)
    );
    CREATE TABLE IF NOT EXISTS daily_peak (
        day TEXT PRIMARY KEY,
        peak INTEGER NOT NULL DEFAULT 0
    );
`);

const FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const jourParis = (d = new Date()) => FMT.format(d);
// Les dates SQLite « AAAA-MM-JJ HH:MM:SS » sont en heure universelle
const depuisSqlite = t => new Date(String(t).replace(' ', 'T') + (/[Z+]/.test(t) ? '' : 'Z'));

// Première mise en route : les dernières connexions connues comptent comme activité de ce jour-là
try {
    const deja = db.prepare('SELECT COUNT(*) AS n FROM daily_activity').get().n;
    if (!deja) {
        const ins = db.prepare('INSERT OR IGNORE INTO daily_activity (day, user_id) VALUES (?, ?)');
        db.prepare('SELECT id, last_login FROM users WHERE last_login IS NOT NULL').all()
            .forEach(u => ins.run(jourParis(depuisSqlite(u.last_login)), u.id));
    }
} catch (e) { console.error('Statistiques (reprise) :', e.message); }

const insActivite = db.prepare('INSERT OR IGNORE INTO daily_activity (day, user_id) VALUES (?, ?)');
const majPic = db.prepare(`INSERT INTO daily_peak (day, peak) VALUES (?, ?)
                           ON CONFLICT(day) DO UPDATE SET peak = MAX(peak, excluded.peak)`);

// Appelée à chaque connexion (page ou socket) ; enLigne = nombre de membres connectés à cet instant
function noterPresence(userId, enLigne) {
    try {
        const jour = jourParis();
        if (userId) insActivite.run(jour, userId);
        if (Number.isFinite(enLigne)) majPic.run(jour, enLigne);
    } catch (e) { /* une statistique ne doit jamais bloquer une connexion */ }
}

function enLigneMaintenant() {
    const ids = new Set();
    if (global.onlineUsers) global.onlineUsers.forEach(u => ids.add(u.id));
    let lives = 0, livesPrives = 0;
    if (global.liveStreams) global.liveStreams.forEach(s => { if (s.isBroadcasting === false) return; s.isPrivate ? livesPrives++ : lives++; });
    return { membres: ids.size, lives, livesPrives };
}

// Résumé sur les N derniers jours (aujourd'hui compris)
function resume(nbJours = 30) {
    nbJours = Math.min(365, Math.max(7, parseInt(nbJours, 10) || 30));
    const jours = [];
    const parJour = {};
    const [ay, am, ad] = jourParis().split('-').map(Number);
    for (let i = nbJours - 1; i >= 0; i--) {
        const j = new Date(Date.UTC(ay, am - 1, ad - i, 12)).toISOString().slice(0, 10);   // calendrier, sans souci d'heure d'été
        parJour[j] = { jour: j, inscriptions: 0, actifs: 0, pic: 0, creditsDistribues: 0, creditsDepenses: 0, depenses: 0 };
        jours.push(parJour[j]);
    }
    const debut = jours[0].jour;
    const marge = '-' + (nbJours + 2) + ' days';

    db.prepare(`SELECT created_at FROM users WHERE created_at >= datetime('now', ?)`).all(marge).forEach(u => {
        const d = parJour[jourParis(depuisSqlite(u.created_at))];
        if (d) d.inscriptions++;
    });
    db.prepare(`SELECT day, COUNT(*) AS n FROM daily_activity WHERE day >= ? GROUP BY day`).all(debut)
        .forEach(r => { if (parJour[r.day]) parJour[r.day].actifs = r.n; });
    db.prepare(`SELECT day, peak FROM daily_peak WHERE day >= ?`).all(debut)
        .forEach(r => { if (parJour[r.day]) parJour[r.day].pic = r.peak; });
    // Site gratuit : crédits gagnés (distribués) et crédits dépensés (cadeaux) ; les anciens achats et la remise à zéro ne comptent pas
    db.prepare(`SELECT type, amount, created_at FROM credits_transactions WHERE created_at >= datetime('now', ?) AND type NOT IN ('purchase', 'reset', 'retrait')`).all(marge).forEach(t => {
        const d = parJour[jourParis(depuisSqlite(t.created_at))];
        if (!d) return;
        if (t.amount > 0) d.creditsDistribues += t.amount;
        else if (t.amount < 0) { d.creditsDepenses += -t.amount; d.depenses++; }
    });

    const somme = k => jours.reduce((a, d) => a + d[k], 0);
    const u = db.prepare(`SELECT COUNT(*) AS total,
                                 SUM(role = 'model') AS modeles,
                                 SUM(status = 'banned') AS bannis FROM users WHERE role != 'bot'`).get();
    const circulation = db.prepare('SELECT COALESCE(SUM(balance), 0) AS n FROM credits_balance').get().n;
    const actifsPeriode = db.prepare('SELECT COUNT(DISTINCT user_id) AS n FROM daily_activity WHERE day >= ?').get(debut).n;
    const aujourdhui = jours[jours.length - 1];

    return {
        genereLe: new Date().toISOString(),
        nbJours,
        maintenant: enLigneMaintenant(),
        aujourdhui,
        periode: {
            inscriptions: somme('inscriptions'), actifsUniques: actifsPeriode,
            creditsDistribues: somme('creditsDistribues'), creditsDepenses: somme('creditsDepenses'), depenses: somme('depenses'),
            picMax: Math.max(0, ...jours.map(d => d.pic))
        },
        total: { membres: u.total || 0, modeles: u.modeles || 0, bannis: u.bannis || 0, creditsEnCirculation: circulation },
        jours
    };
}

module.exports = { noterPresence, resume, jourParis, enLigneMaintenant };
