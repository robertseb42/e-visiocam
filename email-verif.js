// ============================================================
// CONFIRMATION DE L'ADRESSE E-MAIL — E-VISIOCAM
// ------------------------------------------------------------
// Inscription : le compte est créé « non confirmé » et un lien est envoyé par e-mail.
// Tant que l'adresse n'est pas confirmée, la connexion est refusée (avec un bouton
// pour renvoyer le lien). Le lien est valable 48 h et ne sert qu'une fois.
// Changement d'adresse dans le profil : la nouvelle adresse n'est enregistrée
// qu'après clic sur le lien reçu à cette nouvelle adresse.
// Les comptes jamais confirmés sont supprimés au bout de 7 jours (pseudo et e-mail libérés).
// Les comptes existants avant cette mise à jour sont considérés comme confirmés.
// ============================================================
const crypto = require('crypto');
const database = require('./database');

const VALIDITE_H = 48;
const PAUSE_RENVOI_S = 120;          // un renvoi toutes les 2 minutes au plus
const PURGE_JOURS = 7;
// EMAIL_VERIFICATION=0 : confirmation désactivée (dépannage si l'envoi d'e-mails est en panne, et tests)
const ACTIVE = () => process.env.EMAIL_VERIFICATION !== '0';
const SITE = () => (process.env.SITE_URL || 'https://www.e-visiocam.com').replace(/\/$/, '');

let pret = false;
try {
    const { db } = database;
    const cols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
    // DEFAULT 1 : tous les comptes existants sont considérés comme confirmés
    if (!cols.includes('email_verified')) db.prepare('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1').run();
    if (!cols.includes('pending_email')) db.prepare('ALTER TABLE users ADD COLUMN pending_email TEXT').run();
    db.exec(`
        CREATE TABLE IF NOT EXISTS email_verifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL,
            purpose TEXT NOT NULL DEFAULT 'signup',   -- signup | change
            expires_at TEXT NOT NULL,
            used_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_email_verif_user ON email_verifications(user_id, created_at);
    `);
    pret = true;
} catch (e) { /* base simulée (tests) */ }

const hacher = t => crypto.createHash('sha256').update(String(t)).digest('hex');
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function estConfirme(userOuId) {
    if (!pret || !ACTIVE()) return true;
    const id = typeof userOuId === 'object' && userOuId ? userOuId.id : userOuId;
    const r = database.db.prepare('SELECT email_verified FROM users WHERE id = ?').get(id);
    return !r || r.email_verified === 1;
}

function marquerNonConfirme(userId) {
    if (pret) database.db.prepare('UPDATE users SET email_verified = 0 WHERE id = ?').run(userId);
}

// Masque une adresse pour l'afficher : j***e@g***l.com
function masquer(email) {
    const [u, d] = String(email || '').split('@');
    if (!d) return '';
    const m = s => s.length <= 2 ? s[0] + '*' : s[0] + '*'.repeat(Math.min(4, s.length - 2)) + s[s.length - 1];
    const parts = d.split('.');
    return m(u) + '@' + m(parts[0]) + (parts.length > 1 ? '.' + parts.slice(1).join('.') : '');
}

// Crée un lien et l'envoie. purpose : 'signup' (adresse du compte) ou 'change' (nouvelle adresse)
function envoyerLien(user, purpose = 'signup', email = null) {
    if (!pret) return { ok: false };
    const { db } = database;
    const cible = email || user.email;
    const dernier = db.prepare("SELECT created_at FROM email_verifications WHERE user_id = ? AND purpose = ? ORDER BY id DESC LIMIT 1").get(user.id, purpose);
    if (dernier && Date.now() - Date.parse(dernier.created_at.replace(' ', 'T') + 'Z') < PAUSE_RENVOI_S * 1000) return { ok: false, tropTot: true };
    // Les anciens liens de même nature ne servent plus
    db.prepare("UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND purpose = ? AND used_at IS NULL").run(user.id, purpose);
    const jeton = crypto.randomBytes(32).toString('hex');
    const expire = new Date(Date.now() + VALIDITE_H * 3600000).toISOString();
    db.prepare('INSERT INTO email_verifications (user_id, token_hash, email, purpose, expires_at) VALUES (?, ?, ?, ?, ?)')
        .run(user.id, hacher(jeton), cible, purpose, expire);

    const lien = SITE() + '/verifier-email.html?t=' + jeton;
    let mailer; try { mailer = require('./mailer'); } catch (e) { return { ok: true }; }
    const inscription = purpose === 'signup';
    mailer.sendMail({
        to: cible,
        subject: inscription ? '✉️ Confirmez votre adresse e-mail — E-VISIOCAM' : '✉️ Confirmez votre nouvelle adresse e-mail — E-VISIOCAM',
        html: mailer.emailTemplate(inscription ? 'Confirmez votre adresse e-mail' : 'Confirmez votre nouvelle adresse',
            '<p>Bonjour ' + esc(user.username) + ',</p>' +
            (inscription
                ? '<p>Merci pour votre inscription sur <strong>E-VISIOCAM</strong>. Pour activer votre compte, confirmez que cette adresse e-mail vous appartient en cliquant sur le bouton ci-dessous.</p>'
                : '<p>Vous avez demandé à remplacer l\'adresse e-mail de votre compte par celle-ci. Cliquez sur le bouton ci-dessous pour confirmer le changement.</p>') +
            '<p>Ce lien est valable <strong>' + VALIDITE_H + ' heures</strong> et ne peut servir qu\'une fois.</p>' +
            '<div class="warning">Vous n\'êtes pas à l\'origine de cette demande ? Ignorez simplement cet e-mail : ' +
            (inscription ? 'sans confirmation, le compte sera supprimé automatiquement sous ' + PURGE_JOURS + ' jours.' : 'l\'adresse de votre compte ne changera pas.') + '</div>',
            inscription ? 'Confirmer mon adresse' : 'Confirmer la nouvelle adresse', lien),
        text: 'Bonjour ' + user.username + ',\n\n' + (inscription ? 'Confirmez votre adresse pour activer votre compte E-VISIOCAM' : 'Confirmez votre nouvelle adresse e-mail') +
            ' (lien valable ' + VALIDITE_H + ' h) :\n' + lien + '\n\nVous n\'êtes pas à l\'origine de cette demande ? Ignorez cet e-mail.'
    }).catch(e => console.error('E-mail de confirmation :', e.message));
    return { ok: true };
}

// Clic sur le lien : confirme l'inscription ou applique le changement d'adresse
function confirmer(jeton) {
    if (!pret || !/^[a-f0-9]{64}$/.test(String(jeton || ''))) return { erreur: 'Lien invalide', code: 400 };
    const { db } = database;
    const v = db.prepare('SELECT * FROM email_verifications WHERE token_hash = ?').get(hacher(jeton));
    if (!v) return { erreur: 'Ce lien n\'est pas valide. Demandez un nouveau lien depuis la page de connexion.', code: 404 };
    const user = database.getUserById(v.user_id);
    if (!user) return { erreur: 'Compte introuvable', code: 404 };
    if (v.used_at) {
        // Déjà utilisé : si le compte est confirmé, on le dit simplement
        if (v.purpose === 'signup' && estConfirme(user.id)) return { ok: true, deja: true, username: user.username, purpose: v.purpose };
        return { erreur: 'Ce lien a déjà été utilisé ou remplacé par un lien plus récent.', code: 410 };
    }
    if (Date.parse(v.expires_at) < Date.now()) return { erreur: 'Ce lien a expiré (validité ' + VALIDITE_H + ' h). Demandez-en un nouveau.', code: 410, expire: true };

    if (v.purpose === 'change') {
        const pris = database.getUserByEmail(v.email);
        if (pris && pris.id !== user.id) return { erreur: 'Cette adresse est déjà utilisée par un autre compte.', code: 409 };
        db.prepare('UPDATE users SET email = ?, pending_email = NULL, email_verified = 1 WHERE id = ?').run(v.email, user.id);
        try { database.addLog('EMAIL_CHANGE', user.username + ' a confirmé sa nouvelle adresse e-mail', user.id); } catch (e) {}
    } else {
        db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(user.id);
        try { database.addLog('EMAIL_VERIFIED', user.username + ' a confirmé son adresse e-mail', user.id); } catch (e) {}
        // Bienvenue seulement une fois l'adresse confirmée
        try { require('./mailer').sendWelcomeEmail({ username: user.username, email: user.email }).catch(() => {}); } catch (e) {}
    }
    db.prepare('UPDATE email_verifications SET used_at = CURRENT_TIMESTAMP WHERE id = ?').run(v.id);
    return { ok: true, username: user.username, purpose: v.purpose };
}

// Supprime les comptes jamais confirmés depuis plus de 7 jours (libère pseudo et e-mail)
function purger() {
    if (!pret) return 0;
    try {
        const r = database.db.prepare(`DELETE FROM users WHERE email_verified = 0 AND role = 'user'
            AND created_at < datetime('now', ?)`).run('-' + PURGE_JOURS + ' days');
        if (r.changes) console.log('🧹 ' + r.changes + ' compte(s) jamais confirmé(s) supprimé(s)');
        return r.changes;
    } catch (e) { return 0; }
}
if (pret) { setTimeout(purger, 30000).unref(); setInterval(purger, 6 * 3600000).unref(); }

module.exports = { ACTIVE, estConfirme, marquerNonConfirme, envoyerLien, confirmer, masquer, purger, VALIDITE_H, PAUSE_RENVOI_S };
