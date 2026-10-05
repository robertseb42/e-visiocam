// ============================================================
// CONNEXION AVEC GOOGLE — E-VISIOCAM
// ------------------------------------------------------------
// Le bouton « Continuer avec Google » (Google Identity Services) renvoie un jeton
// signé par Google. On le vérifie ici sans bibliothèque externe :
//   - signature RS256 avec les clés publiques de Google (mises en cache)
//   - émetteur accounts.google.com, destinataire = notre identifiant (GOOGLE_CLIENT_ID)
//   - jeton non expiré, adresse e-mail vérifiée par Google
// Réglage sur Render : GOOGLE_CLIENT_ID (identifiant public, pas de secret nécessaire).
// Sans ce réglage, le bouton Google n'apparaît pas sur le site.
// ============================================================
const crypto = require('crypto');
const database = require('./database');

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const EMETTEURS = ['accounts.google.com', 'https://accounts.google.com'];
const clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim() || null;

// Colonne google_sub : identifiant Google du compte (relie un compte E-VISIOCAM à un compte Google)
try {
    const { db } = database;
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    if (!cols.includes('google_sub')) db.prepare('ALTER TABLE users ADD COLUMN google_sub TEXT').run();
    db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL').run();
} catch (e) { /* base simulée (tests) */ }

const b64url = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

// ---------- Clés publiques de Google (cache selon Cache-Control) ----------
let cles = null, clesExpirent = 0;
async function clesGoogle(forcer) {
    if (cles && !forcer && Date.now() < clesExpirent) return cles;
    const r = await fetch(CERTS_URL);
    if (!r.ok) throw new Error('Clés Google indisponibles (' + r.status + ')');
    const j = await r.json();
    const age = Number(((r.headers.get('cache-control') || '').match(/max-age=(\d+)/) || [])[1]) || 3600;
    cles = {}; (j.keys || []).forEach(k => { cles[k.kid] = k; });
    clesExpirent = Date.now() + Math.min(age, 86400) * 1000;
    return cles;
}

// Vérifie le jeton d'identité ; renvoie { sub, email, nom, prenom } ou lève une erreur lisible
async function verifierJeton(jeton) {
    const id = clientId();
    if (!id) throw Object.assign(new Error('La connexion avec Google n\'est pas activée'), { code: 503 });
    const morceaux = String(jeton || '').split('.');
    if (morceaux.length !== 3) throw Object.assign(new Error('Jeton Google invalide'), { code: 401 });
    let entete, corps;
    try { entete = JSON.parse(b64url(morceaux[0]).toString('utf8')); corps = JSON.parse(b64url(morceaux[1]).toString('utf8')); }
    catch (e) { throw Object.assign(new Error('Jeton Google illisible'), { code: 401 }); }
    if (entete.alg !== 'RS256' || !entete.kid) throw Object.assign(new Error('Jeton Google invalide'), { code: 401 });

    let k = (await clesGoogle())[entete.kid];
    if (!k) k = (await clesGoogle(true))[entete.kid];   // clés renouvelées par Google
    if (!k) throw Object.assign(new Error('Jeton Google non reconnu'), { code: 401 });
    const ok = crypto.verify('RSA-SHA256', Buffer.from(morceaux[0] + '.' + morceaux[1]),
        crypto.createPublicKey({ key: k, format: 'jwk' }), b64url(morceaux[2]));
    if (!ok) throw Object.assign(new Error('Signature Google invalide'), { code: 401 });

    const maintenant = Math.floor(Date.now() / 1000);
    if (!EMETTEURS.includes(corps.iss)) throw Object.assign(new Error('Jeton Google invalide (émetteur)'), { code: 401 });
    if (corps.aud !== id) throw Object.assign(new Error('Jeton Google destiné à un autre site'), { code: 401 });
    if (!(corps.exp > maintenant - 60)) throw Object.assign(new Error('Jeton Google expiré, réessayez'), { code: 401 });
    if (!corps.sub) throw Object.assign(new Error('Jeton Google incomplet'), { code: 401 });
    if (!corps.email || corps.email_verified !== true && corps.email_verified !== 'true') {
        throw Object.assign(new Error('Votre adresse Google n\'est pas vérifiée'), { code: 403 });
    }
    return { sub: String(corps.sub), email: String(corps.email).toLowerCase(), prenom: corps.given_name || '', nom: corps.name || '' };
}

// ---------- Ticket d'inscription (étape « choisir un pseudo ») : signé, valable 20 minutes ----------
const SECRET = () => process.env.JWT_SECRET || 'evc-dev';
function creerTicket(g) {
    const data = Buffer.from(JSON.stringify({ sub: g.sub, email: g.email, exp: Date.now() + 20 * 60000 })).toString('base64url');
    return data + '.' + crypto.createHmac('sha256', SECRET()).update('gticket:' + data).digest('base64url');
}
function lireTicket(t) {
    const [data, sig] = String(t || '').split('.');
    if (!data || !sig) return null;
    const attendu = crypto.createHmac('sha256', SECRET()).update('gticket:' + data).digest('base64url');
    if (sig.length !== attendu.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(attendu))) return null;
    try { const o = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')); return o.exp > Date.now() ? o : null; } catch (e) { return null; }
}

// ---------- Pseudo au hasard (baguette magique) ----------
const MOTS_A = ['Disco', 'Neon', 'Velours', 'Funky', 'Cosmo', 'Groovy', 'Electro', 'Lunar', 'Solar', 'Vinyl', 'Jazzy', 'Retro', 'Pixel', 'Swing', 'Glam', 'Zen', 'Wild', 'Sunny', 'Midnight', 'Crystal'];
const MOTS_B = ['Panda', 'Renard', 'Loup', 'Tigre', 'Lynx', 'Faucon', 'Dauphin', 'Hibou', 'Koala', 'Phoenix', 'Comete', 'Etoile', 'Pirate', 'Rider', 'Dancer', 'Wave', 'Groove', 'Flash', 'Spark', 'Echo'];
const tirer = l => l[crypto.randomInt(l.length)];
function pseudoLibre(n) { return !database.getUserByUsername(n); }
function pseudoAuHasard() {
    for (let i = 0; i < 25; i++) {
        const n = tirer(MOTS_A) + tirer(MOTS_B) + crypto.randomInt(10, 1000);
        if (n.length <= 20 && pseudoLibre(n)) return n;
    }
    return 'Membre' + crypto.randomInt(100000, 999999);
}
// Propose un pseudo à partir du prénom Google (sans accents ni espaces), sinon au hasard
function pseudoDepuis(prenom) {
    const base = String(prenom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 14);
    if (base.length >= 3) {
        if (pseudoLibre(base)) return base;
        for (let i = 0; i < 15; i++) { const n = base + crypto.randomInt(10, 10000); if (pseudoLibre(n)) return n; }
    }
    return pseudoAuHasard();
}

function parGoogle(sub) { try { return database.db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub) || null; } catch (e) { return null; } }
function relier(userId, sub) {
    database.db.prepare('UPDATE users SET google_sub = ?, email_verified = 1 WHERE id = ?').run(sub, userId);
}

module.exports = { clientId, verifierJeton, creerTicket, lireTicket, pseudoAuHasard, pseudoDepuis, parGoogle, relier,
    _setCles(c) { cles = c; clesExpirent = Date.now() + 3600000; } };
