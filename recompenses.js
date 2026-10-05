// ============================================================
// PROGRAMME DE RÉCOMPENSES — E-VISIOCAM (site gratuit)
// ------------------------------------------------------------
// Les crédits se gagnent en participant à la vie du site :
//   bienvenue      : une fois (compte confirmé)
//   quotidien      : une fois par jour (heure de Paris), plus si plusieurs jours de suite
//   actif          : par tranche de 15 min d'activité réelle (messages, réactions, cadeaux, live regardé ou diffusé)
//   live           : modèles, par heure de live public
//   parrainage     : quand le filleul a confirmé son compte et été actif 3 jours différents
//   signalement    : signalement confirmé par la modération
// Garde-fous : compte confirmé et non sanctionné, plafonds par jour / semaine / mois,
// activité mesurée par le serveur, parrainage refusé si même adresse IP que le parrain.
// Montants et plafonds réglables par le Super Admin (panneau Admin → Récompenses).
// ============================================================
const crypto = require('crypto');
const database = require('./database');

const DEFAUT = {
    actif: true,
    bienvenue: 50,
    quotidien: 5, quotidienSerie: 10, serieJours: 7,
    actif15: 2, actifMaxJour: 20,
    liveHeure: 10, liveMaxJour: 50,
    parrainage: 100, parrainageJoursActifs: 3, parrainageMaxMois: 10,
    signalement: 10, signalementMaxSemaine: 3,
    modoOffreMax: 100, modoOffreJour: 500          // crédits offerts à la main par un modérateur (par envoi / par jour) ; 0 = interdit
};
const NIVEAUX = [
    { min: 0, nom: 'Nouveau', icone: '🌱' },
    { min: 100, nom: 'Bronze', icone: '🥉' },
    { min: 500, nom: 'Argent', icone: '🥈' },
    { min: 1500, nom: 'Or', icone: '🥇' },
    { min: 5000, nom: 'Diamant', icone: '💎' }
];
const LIBELLES = {
    bienvenue: 'Bonus de bienvenue', quotidien: 'Connexion du jour', actif: 'Participation',
    live: 'Live animé', parrainage: 'Parrainage', signalement: 'Signalement confirmé', offert: 'Offert par l\'équipe', quiz: 'Quiz de l\'animateur', retrait: 'Retrait (fraude)'
};

let pret = false;
const { db } = database;
try {
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!cols.includes('referred_by')) db.prepare('ALTER TABLE users ADD COLUMN referred_by INTEGER').run();
    if (!cols.includes('register_ip')) db.prepare('ALTER TABLE users ADD COLUMN register_ip TEXT').run();
    if (!cols.includes('last_ip')) db.prepare('ALTER TABLE users ADD COLUMN last_ip TEXT').run();
    db.exec(`
        CREATE TABLE IF NOT EXISTS reward_counters (
            user_id INTEGER NOT NULL, day TEXT NOT NULL, action TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0, times INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (user_id, day, action)
        );
        CREATE TABLE IF NOT EXISTS reward_streaks (
            user_id INTEGER PRIMARY KEY, last_day TEXT NOT NULL, streak INTEGER NOT NULL DEFAULT 1, best INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS reward_referrals (
            filleul_id INTEGER PRIMARY KEY, parrain_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',            -- pending | rewarded | refused
            reason TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, decided_at TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_referrals_parrain ON reward_referrals(parrain_id, status);
        CREATE TABLE IF NOT EXISTS reward_gifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
            amount INTEGER NOT NULL, reason TEXT, day TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_reward_gifts_from ON reward_gifts(from_id, day);
    `);
    pret = true;
} catch (e) { /* base simulée (tests) */ }

// ---------- Réglages ----------
let cacheConfig = null;
function config() {
    if (cacheConfig) return cacheConfig;
    let c = {};
    try { c = JSON.parse(database.getSetting('rewards_config') || '{}'); } catch (e) {}
    cacheConfig = Object.assign({}, DEFAUT, c);
    if (process.env.REWARDS_ENABLED === '0') cacheConfig.actif = false;   // coupure d'urgence (et tests)
    return cacheConfig;
}
function reglerConfig(nouveau, auteur) {
    const c = Object.assign({}, config());
    Object.keys(DEFAUT).forEach(k => {
        if (nouveau[k] === undefined) return;
        if (k === 'actif') c.actif = !!nouveau.actif;
        else { const n = Math.round(Number(nouveau[k])); if (Number.isFinite(n) && n >= 0 && n <= 100000) c[k] = n; }
    });
    database.setSetting('rewards_config', JSON.stringify(c));
    cacheConfig = null;
    try { database.addLog('REWARDS_CONFIG', (auteur ? auteur.username : '?') + ' a modifié le programme de récompenses', auteur && auteur.id); } catch (e) {}
    return config();
}

const jourParis = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const veille = j => { const [y, m, d] = j.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - 1, 12)).toISOString().slice(0, 10); };
const hacherIp = ip => ip ? crypto.createHash('sha256').update('evc-ip:' + String(ip)).digest('hex').slice(0, 32) : null;

// ---------- Qui peut gagner ----------
function eligible(userId) {
    if (!pret || !config().actif) return false;
    const u = database.getUserById(userId);
    if (!u || u.status === 'banned') return false;
    try { if (!require('./email-verif').estConfirme(u)) return false; } catch (e) {}
    try { const s = require('./sanctions').etat(u); if (s.bloque || s.muet) return false; } catch (e) {}
    return true;
}

function compteur(userId, day, action) {
    return db.prepare('SELECT amount, times FROM reward_counters WHERE user_id = ? AND day = ? AND action = ?').get(userId, day, action) || { amount: 0, times: 0 };
}
function somme(userId, action, depuisJour) {
    return db.prepare('SELECT COALESCE(SUM(amount), 0) AS a, COALESCE(SUM(times), 0) AS t FROM reward_counters WHERE user_id = ? AND action = ? AND day >= ?').get(userId, action, depuisJour);
}

// Crédite (dans la limite du plafond) et prévient le membre en direct
function crediter(userId, action, montant, { plafondJour = null, detail = null } = {}) {
    if (!montant || montant <= 0) return 0;
    const day = jourParis();
    if (plafondJour !== null) {
        const deja = compteur(userId, day, action).amount;
        montant = Math.min(montant, Math.max(0, plafondJour - deja));
        if (!montant) return 0;
    }
    db.transaction(() => {
        database.addCredits(userId, montant, 'reward', LIBELLES[action] + (detail ? ' — ' + detail : ''), null, { action });
        db.prepare(`INSERT INTO reward_counters (user_id, day, action, amount, times) VALUES (?, ?, ?, ?, 1)
                    ON CONFLICT(user_id, day, action) DO UPDATE SET amount = amount + excluded.amount, times = times + 1`).run(userId, day, action, montant);
    })();
    niveauCache.delete(userId);
    try {
        if (global.io) global.io.to('user:' + userId).emit('recompense:gain', {
            montant, action, libelle: LIBELLES[action] + (detail ? ' — ' + detail : ''), solde: database.getBalance(userId).balance
        });
    } catch (e) {}
    return montant;
}

// ---------- Connexion (page ou temps réel) : bienvenue + jour + parrainage ----------
function connexion(userId, ip) {
    if (!pret) return;
    try {
        if (ip) db.prepare('UPDATE users SET last_ip = ? WHERE id = ?').run(hacherIp(ip), userId);
        if (!eligible(userId)) return;
        const c = config(), day = jourParis();
        // Bienvenue : une seule fois par compte
        const dejaBienvenue = db.prepare("SELECT 1 FROM reward_counters WHERE user_id = ? AND action = 'bienvenue' LIMIT 1").get(userId);
        if (!dejaBienvenue) crediter(userId, 'bienvenue', c.bienvenue);
        // Jour : une fois par jour, plus avec une série
        if (!compteur(userId, day, 'quotidien').times) {
            const s = db.prepare('SELECT last_day, streak, best FROM reward_streaks WHERE user_id = ?').get(userId);
            let serie = 1;
            if (s && s.last_day === veille(day)) serie = s.streak + 1;
            else if (s && s.last_day === day) serie = s.streak;
            db.prepare(`INSERT INTO reward_streaks (user_id, last_day, streak, best) VALUES (?, ?, ?, ?)
                        ON CONFLICT(user_id) DO UPDATE SET last_day = excluded.last_day, streak = excluded.streak, best = MAX(best, excluded.streak)`).run(userId, day, serie, serie);
            const montant = serie >= c.serieJours ? c.quotidienSerie : c.quotidien;
            crediter(userId, 'quotidien', montant, { detail: serie > 1 ? serie + ' jours de suite' : null });
        }
        verifierParrainage(userId);
    } catch (e) { console.error('Récompenses (connexion) :', e.message); }
}

// ---------- Activité réelle : mesurée par le serveur ----------
// Chaque action utile marque le membre « actif » ; toutes les minutes, un membre actif dans
// les 5 dernières minutes (ou qui regarde / diffuse un live) cumule une minute. 15 min = une tranche.
const derniereActivite = new Map();   // userId -> timestamp
const minutesActives = new Map();     // userId -> minutes cumulées
const minutesLive = new Map();        // userId -> minutes de live public
function activite(userId) { if (userId) derniereActivite.set(userId, Date.now()); }

function tic() {
    if (!pret || !config().actif) return;
    const c = config(), maintenant = Date.now();
    const actifs = new Set(), diffuseurs = new Set();
    derniereActivite.forEach((t, id) => { if (maintenant - t < 5 * 60000) actifs.add(id); else if (maintenant - t > 3600000) derniereActivite.delete(id); });
    if (global.liveStreams) global.liveStreams.forEach(s => {
        if (s.isBroadcasting === false) return;
        actifs.add(s.broadcasterId);
        if (!s.isPrivate && !s.isCameraOff) diffuseurs.add(s.broadcasterId);
        (s.viewers || []).forEach(sid => { const v = global.onlineUsers && global.onlineUsers.get(sid); if (v) actifs.add(v.id); });
    });
    actifs.forEach(id => {
        const m = (minutesActives.get(id) || 0) + 1;
        if (m >= 15) {
            minutesActives.set(id, 0);
            if (eligible(id)) crediter(id, 'actif', c.actif15, { plafondJour: c.actifMaxJour });
        } else minutesActives.set(id, m);
    });
    diffuseurs.forEach(id => {
        const u = database.getUserById(id);
        if (!u || u.role !== 'model') return;
        const m = (minutesLive.get(id) || 0) + 1;
        if (m >= 60) {
            minutesLive.set(id, 0);
            if (eligible(id)) crediter(id, 'live', c.liveHeure, { plafondJour: c.liveMaxJour, detail: '1 h de live public' });
        } else minutesLive.set(id, m);
    });
}
if (pret) setInterval(tic, 60000).unref();

// ---------- Parrainage ----------
function enregistrerParrain(filleulId, codeParrain, ip) {
    if (!pret) return null;
    try {
        if (ip) db.prepare('UPDATE users SET register_ip = ? WHERE id = ?').run(hacherIp(ip), filleulId);
        const code = String(codeParrain || '').trim().slice(0, 30);
        if (!code) return null;
        const p = database.getUserByUsername(code);
        if (!p || p.id === filleulId || p.status === 'banned') return null;
        db.prepare('UPDATE users SET referred_by = ? WHERE id = ?').run(p.id, filleulId);
        db.prepare('INSERT OR IGNORE INTO reward_referrals (filleul_id, parrain_id) VALUES (?, ?)').run(filleulId, p.id);
        return p.username;
    } catch (e) { return null; }
}

function verifierParrainage(filleulId) {
    const r = db.prepare("SELECT * FROM reward_referrals WHERE filleul_id = ? AND status = 'pending'").get(filleulId);
    if (!r) return;
    const c = config();
    const jours = db.prepare('SELECT COUNT(DISTINCT day) AS n FROM daily_activity WHERE user_id = ?').get(filleulId).n;
    if (jours < c.parrainageJoursActifs) return;
    const refuser = raison => {
        db.prepare("UPDATE reward_referrals SET status = 'refused', reason = ?, decided_at = CURRENT_TIMESTAMP WHERE filleul_id = ?").run(raison, filleulId);
        try { database.addLog('REFERRAL_REFUSED', 'Parrainage refusé (' + raison + ') : filleul #' + filleulId + ', parrain #' + r.parrain_id, null, r.parrain_id); } catch (e) {}
    };
    const f = db.prepare('SELECT register_ip, last_ip FROM users WHERE id = ?').get(filleulId) || {};
    const p = db.prepare('SELECT last_ip, register_ip FROM users WHERE id = ?').get(r.parrain_id) || {};
    const ipsF = [f.register_ip, f.last_ip].filter(Boolean), ipsP = [p.last_ip, p.register_ip].filter(Boolean);
    if (ipsF.some(x => ipsP.includes(x))) return refuser('même adresse IP que le parrain');
    const mois = jourParis().slice(0, 7) + '-01';
    if (somme(r.parrain_id, 'parrainage', mois).t >= c.parrainageMaxMois) return refuser('plafond mensuel atteint');
    if (!eligible(r.parrain_id)) return refuser('parrain non éligible');
    const filleul = database.getUserById(filleulId);
    db.prepare("UPDATE reward_referrals SET status = 'rewarded', decided_at = CURRENT_TIMESTAMP WHERE filleul_id = ?").run(filleulId);
    crediter(r.parrain_id, 'parrainage', c.parrainage, { detail: filleul ? filleul.username : null });
}

// ---------- Signalement confirmé par la modération ----------
function signalementConfirme(reporterId) {
    if (!pret || !reporterId || !eligible(reporterId)) return 0;
    const c = config();
    const lundi = (() => { const d = new Date(jourParis() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); })();
    if (somme(reporterId, 'signalement', lundi).t >= c.signalementMaxSemaine) return 0;
    return crediter(reporterId, 'signalement', c.signalement);
}

// ---------- Niveaux et badges ----------
const niveauCache = new Map();   // userId -> { n, t }
function niveauDe(gagnes) {
    let n = NIVEAUX[0], suivant = null;
    for (let i = 0; i < NIVEAUX.length; i++) if (gagnes >= NIVEAUX.at(i).min) { n = NIVEAUX.at(i); suivant = NIVEAUX.at(i + 1) || null; }
    return { nom: n.nom, icone: n.icone, min: n.min, suivant: suivant ? { nom: suivant.nom, icone: suivant.icone, min: suivant.min } : null };
}
function gagnesTotal(userId) {
    return db.prepare("SELECT COALESCE(SUM(amount), 0) AS n FROM credits_transactions WHERE user_id = ? AND type = 'reward'").get(userId).n;
}
// Petit insigne à afficher à côté du pseudo (mis en cache 1 minute)
function insigne(userId) {
    if (!pret || !userId) return null;
    const c = niveauCache.get(userId);
    if (c && Date.now() - c.t < 60000) return c.n;
    let n = null;
    try { const nv = niveauDe(gagnesTotal(userId)); n = nv.min > 0 ? { icone: nv.icone, nom: nv.nom } : null; } catch (e) {}
    niveauCache.set(userId, { n, t: Date.now() });
    return n;
}
function badges(userId) {
    const b = [];
    const u = database.getUserById(userId);
    if (!u) return b;
    const s = db.prepare('SELECT best FROM reward_streaks WHERE user_id = ?').get(userId);
    if (s && s.best >= 7) b.push({ id: 'fidele', icone: '🔥', nom: 'Fidèle', aide: '7 jours de suite' });
    if (s && s.best >= 30) b.push({ id: 'pilier', icone: '🏛️', nom: 'Pilier', aide: '30 jours de suite' });
    const filleuls = db.prepare("SELECT COUNT(*) AS n FROM reward_referrals WHERE parrain_id = ? AND status = 'rewarded'").get(userId).n;
    if (filleuls >= 1) b.push({ id: 'parrain', icone: '🤝', nom: 'Parrain', aide: filleuls + ' filleul' + (filleuls > 1 ? 's' : '') });
    const lives = somme(userId, 'live', '2000-01-01').t;
    if (lives >= 10) b.push({ id: 'animateur', icone: '🎙️', nom: 'Animateur', aide: lives + ' h de live' });
    const anc = Date.now() - Date.parse(String(u.created_at).replace(' ', 'T') + 'Z');
    if (anc > 365 * 86400000) b.push({ id: 'ancien', icone: '⭐', nom: 'Ancien', aide: 'Membre depuis plus d\'un an' });
    return b;
}

// ---------- Vue « Mes récompenses » ----------
function resumeMembre(userId) {
    const c = config(), day = jourParis();
    const aujourdhui = a => compteur(userId, day, a);
    const gagnes = gagnesTotal(userId);
    const serie = db.prepare('SELECT last_day, streak, best FROM reward_streaks WHERE user_id = ?').get(userId);
    const serieActuelle = serie && (serie.last_day === day || serie.last_day === veille(day)) ? serie.streak : 0;
    const parr = db.prepare("SELECT status, COUNT(*) AS n FROM reward_referrals WHERE parrain_id = ? GROUP BY status").all(userId);
    const nb = st => (parr.find(x => x.status === st) || {}).n || 0;
    const u = database.getUserById(userId);
    let confirme = true; try { confirme = require('./email-verif').estConfirme(u); } catch (e) {}
    return {
        programmeActif: !!c.actif, eligible: eligible(userId), confirme,
        config: c,
        aujourdhui: {
            quotidien: aujourdhui('quotidien').amount, actif: aujourdhui('actif').amount, live: aujourdhui('live').amount,
            actifMinutes: minutesActives.get(userId) || 0
        },
        bienvenueRecue: !!db.prepare("SELECT 1 FROM reward_counters WHERE user_id = ? AND action = 'bienvenue' LIMIT 1").get(userId),
        serie: serieActuelle, meilleureSerie: serie ? serie.best : 0,
        gagnes, niveau: niveauDe(gagnes), badges: badges(userId),
        estModele: u && u.role === 'model',
        parrainage: { code: u ? u.username : '', enAttente: nb('pending'), valides: nb('rewarded'), refuses: nb('refused') }
    };
}

// ---------- Panneau Super Admin ----------
function tableauAdmin(nbJours = 30) {
    nbJours = Math.min(365, Math.max(1, parseInt(nbJours, 10) || 30));
    const depuis = (() => { const [y, m, d] = jourParis().split('-').map(Number); return new Date(Date.UTC(y, m - 1, d - nbJours + 1, 12)).toISOString().slice(0, 10); })();
    const parAction = db.prepare('SELECT action, SUM(amount) AS credits, SUM(times) AS fois, COUNT(DISTINCT user_id) AS membres FROM reward_counters WHERE day >= ? GROUP BY action ORDER BY credits DESC').all(depuis)
        .map(r => Object.assign(r, { libelle: LIBELLES[r.action] || r.action }));
    const top = db.prepare(`SELECT r.user_id AS id, u.username, u.role, SUM(r.amount) AS credits,
            (SELECT balance FROM credits_balance b WHERE b.user_id = r.user_id) AS solde
        FROM reward_counters r JOIN users u ON u.id = r.user_id WHERE r.day >= ? GROUP BY r.user_id ORDER BY credits DESC LIMIT 15`).all(depuis);
    const parrainages = db.prepare(`SELECT rr.status, rr.reason, rr.created_at, rr.decided_at, f.username AS filleul, p.username AS parrain
        FROM reward_referrals rr JOIN users f ON f.id = rr.filleul_id JOIN users p ON p.id = rr.parrain_id
        ORDER BY rr.created_at DESC LIMIT 30`).all();
    // Alerte : plusieurs comptes inscrits depuis la même adresse IP
    const memeIp = db.prepare(`SELECT register_ip, COUNT(*) AS n, GROUP_CONCAT(username, ', ') AS comptes FROM users
        WHERE register_ip IS NOT NULL GROUP BY register_ip HAVING n >= 3 ORDER BY n DESC LIMIT 10`).all().map(r => ({ n: r.n, comptes: r.comptes }));
    const total = parAction.reduce((a, r) => a + r.credits, 0);
    // Derniers crédits offerts ou retirés à la main
    const offerts = db.prepare(`SELECT 'offert' AS type, g.amount, g.reason AS description, g.created_at, u.username, a.username AS par, a.role AS parRole
        FROM reward_gifts g JOIN users u ON u.id = g.to_id LEFT JOIN users a ON a.id = g.from_id ORDER BY g.id DESC LIMIT 30`).all();
    const retraits = db.prepare(`SELECT 'retrait' AS type, t.amount, t.description, t.created_at, u.username, t.metadata FROM credits_transactions t JOIN users u ON u.id = t.user_id
        WHERE t.type = 'retrait' ORDER BY t.id DESC LIMIT 30`).all().map(r => { let par = null; try { par = JSON.parse(r.metadata || '{}').par || null; } catch (e) {} delete r.metadata; return Object.assign(r, { par, description: String(r.description || '').replace(/^Retrait : /, '') }); });
    const manuels = offerts.concat(retraits).sort((x, y) => String(y.created_at).localeCompare(String(x.created_at))).slice(0, 30);
    return { nbJours, depuis, config: config(), defaut: DEFAUT, total, parAction, top, parrainages, memeIp, manuels, offreMax: OFFRE_MAX };
}

// Offrir des crédits à la main : Super Admin (sans limite autre que 5 000 par envoi)
// ou modérateur (plafonds réglables : par envoi et par jour ; ni à lui-même ni à l'équipe)
const OFFRE_MAX = 5000;
function quotaModo(auteurId) {
    const c = config();
    const utilise = pret ? db.prepare('SELECT COALESCE(SUM(amount), 0) AS n FROM reward_gifts WHERE from_id = ? AND day = ?').get(auteurId, jourParis()).n : 0;
    return { parEnvoi: c.modoOffreMax, parJour: c.modoOffreJour, utilise, reste: Math.max(0, c.modoOffreJour - utilise) };
}
function offrir({ cible, auteur, montant, raison }) {
    montant = Math.round(Number(montant));
    raison = String(raison || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    const admin = auteur && auteur.role === 'super_admin';
    if (!cible) return { erreur: 'Membre introuvable', code: 404 };
    if (cible.status === 'banned') return { erreur: 'Ce membre est banni', code: 400 };
    if (raison.length < 3) return { erreur: 'Indiquez un petit mot (il est affiché au membre)', code: 400 };
    if (!(montant > 0) || montant > OFFRE_MAX) return { erreur: 'Montant entre 1 et ' + OFFRE_MAX + ' crédits', code: 400 };
    if (!admin) {
        const q = quotaModo(auteur.id);
        if (!q.parEnvoi || !q.parJour) return { erreur: 'Le Super Admin n\'autorise pas les modérateurs à offrir des crédits pour le moment', code: 403 };
        if (cible.id === auteur.id) return { erreur: 'Vous ne pouvez pas vous offrir des crédits', code: 403 };
        if (cible.role === 'moderator' || cible.role === 'super_admin') return { erreur: 'Seul le Super Admin peut offrir des crédits à l\'équipe de modération', code: 403 };
        if (montant > q.parEnvoi) return { erreur: q.parEnvoi + ' crédits au plus par envoi', code: 400 };
        if (montant > q.reste) return { erreur: q.reste ? 'Il vous reste ' + q.reste + ' crédits à offrir aujourd\'hui' : 'Vous avez atteint votre limite du jour (' + q.parJour + ' crédits)', code: 400 };
    }
    const donne = crediter(cible.id, 'offert', montant, { detail: raison });
    if (pret) db.prepare('INSERT INTO reward_gifts (from_id, to_id, amount, reason, day) VALUES (?, ?, ?, ?, ?)').run(auteur.id, cible.id, donne, raison, jourParis());
    try { database.addLog('REWARDS_GIFT', auteur.username + ' a offert ' + donne + ' crédits à ' + cible.username + ' (' + raison + ')', auteur.id, cible.id); } catch (e) {}
    return { ok: true, offert: donne, solde: database.getBalance(cible.id).balance, quota: admin ? null : quotaModo(auteur.id) };
}

// Retirer des crédits (fraude) : ne descend jamais sous zéro
function retirer({ cible, auteur, montant, raison }) {
    montant = Math.round(Number(montant));
    raison = String(raison || '').trim().slice(0, 200);
    if (!(montant > 0)) return { erreur: 'Montant invalide', code: 400 };
    if (raison.length < 5) return { erreur: 'Indiquez la raison du retrait', code: 400 };
    const solde = database.getBalance(cible.id).balance;
    const retire = Math.min(solde, montant);
    if (!retire) return { erreur: 'Ce membre n\'a plus de crédits', code: 400 };
    db.prepare(`INSERT INTO credits_transactions (user_id, type, amount, description, metadata) VALUES (?, 'retrait', ?, ?, ?)`)
        .run(cible.id, -retire, 'Retrait : ' + raison, JSON.stringify({ par: auteur.username }));
    db.prepare('UPDATE credits_balance SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(retire, cible.id);
    try { database.addLog('REWARDS_REMOVE', auteur.username + ' a retiré ' + retire + ' crédits à ' + cible.username + ' (' + raison + ')', auteur.id, cible.id); } catch (e) {}
    try {
        require('./sanctions-mail').envoyer(cible.id, 'Crédits retirés', 'Des crédits ont été retirés de votre compte', [
            retire + ' crédits ont été retirés de votre compte par l\'équipe de modération.', 'Motif : ' + raison,
            'Les crédits obtenus de manière artificielle peuvent être annulés (CGU, article 7.4). Pour contester, répondez via le formulaire de contact.']);
    } catch (e) {}
    return { ok: true, retire };
}

module.exports = { config, reglerConfig, connexion, activite, tic, enregistrerParrain, verifierParrainage, signalementConfirme,
    insigne, badges, niveauDe, resumeMembre, tableauAdmin, offrir, quotaModo, retirer, crediter, jourParis, DEFAUT, NIVEAUX, _reset() { cacheConfig = null; minutesActives.clear(); minutesLive.clear(); derniereActivite.clear(); niveauCache.clear(); } };
