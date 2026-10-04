// ============================================================
// SANCTIONS : e-mails au membre + contestations — E-VISIOCAM
// ------------------------------------------------------------
// À chaque sanction (avertissement, mute, kick, ban), le membre reçoit un e-mail qui
// explique la mesure : nature, durée, début et fin, motif, règle concernée (article 6
// des CGU), effets, et un lien personnel pour la contester (valable 6 mois).
// La contestation arrive dans Modération → Contestations ; la décision lui est envoyée
// par e-mail. Une contestation ne suspend pas la sanction.
// ============================================================
const crypto = require('crypto');
const database = require('./database');

const SITE = () => (process.env.SITE_URL || 'https://www.e-visiocam.com').replace(/\/$/, '');
const DELAI_JOURS = 183;   // 6 mois pour contester

let pret = false;
try {
    const { db } = database;
    const cols = db.prepare('PRAGMA table_info(user_sanctions)').all().map(c => c.name);
    if (cols.length && !cols.includes('appeal_token')) db.prepare('ALTER TABLE user_sanctions ADD COLUMN appeal_token TEXT').run();
    db.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sanctions_token ON user_sanctions(appeal_token);
        CREATE TABLE IF NOT EXISTS sanction_appeals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sanction_id INTEGER NOT NULL UNIQUE,       -- une contestation par sanction
            user_id INTEGER NOT NULL,
            message TEXT NOT NULL,
            contact_email TEXT,
            status TEXT NOT NULL DEFAULT 'pending',     -- pending | accepted | rejected
            decision_note TEXT,
            decided_by TEXT,
            decided_at TEXT,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_appeals_status ON sanction_appeals(status, created_at);
    `);
    pret = true;
} catch (e) { /* base simulée (tests) */ }

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateFr = d => new Date(d).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const depuisSqlite = t => new Date(String(t).replace(' ', 'T') + (/[Z+]/.test(String(t)) ? '' : 'Z'));

const NOMS = {
    warn: { titre: 'Avertissement', sujet: 'Avertissement sur votre compte' },
    mute: { titre: 'Mise en sourdine', sujet: 'Vous ne pouvez plus écrire temporairement' },
    kick: { titre: 'Expulsion', sujet: 'Vous avez été expulsé du site' },
    ban: { titre: 'Suspension du compte', sujet: 'Votre compte est suspendu' },
    bandef: { titre: 'Bannissement définitif', sujet: 'Votre compte a été banni définitivement' }
};
const EFFETS = {
    warn: ['Aucune restriction : il s\'agit d\'un rappel des règles.', 'En cas de récidive, une sanction plus lourde peut être prise.'],
    mute: ['Vous restez connecté et pouvez regarder les salons et les lives.', 'Vous ne pouvez plus écrire, ni dans les salons ni en message privé, jusqu\'à la fin de la mesure.'],
    kick: ['Vous avez été déconnecté immédiatement.', 'Vous ne pouvez pas vous reconnecter avant la fin de la mesure.'],
    ban: ['Votre compte est bloqué : connexion, messages et lives sont impossibles jusqu\'à la fin de la suspension.', 'La suspension se lève automatiquement à la date indiquée ; vos crédits restent sur votre compte.', 'Créer un autre compte pour contourner la suspension entraîne le bannissement définitif.'],
    bandef: ['Votre compte est fermé définitivement : il n\'est plus possible de s\'y connecter.', 'Créer un autre compte pour contourner ce bannissement est interdit.', 'Pour toute question sur vos crédits non utilisés, écrivez au support en indiquant votre pseudo.']
};

function libelleDuree(type, minutes) {
    if (type === 'warn') return '—';
    if (minutes === null || minutes === undefined) return 'Définitive';
    if (!minutes) return 'Immédiate (vous pouvez revenir tout de suite)';
    if (minutes % 1440 === 0) return (minutes / 1440) + ' jour' + (minutes >= 2880 ? 's' : '');
    if (minutes % 60 === 0) return (minutes / 60) + ' heure' + (minutes >= 120 ? 's' : '');
    return minutes + ' minutes';
}

// Envoi de l'e-mail de sanction ; renvoie le jeton de contestation (ou null)
function notifierSanction({ sanctionId, cible, type, minutes, jusqua, raison, auto }) {
    if (!pret || !cible) return null;
    const u = database.getUserById(cible.id);
    if (!u || !u.email) return null;
    let jeton = null;
    if (sanctionId && type !== 'warn') {
        jeton = crypto.randomBytes(24).toString('hex');
        try { database.db.prepare('UPDATE user_sanctions SET appeal_token = ? WHERE id = ?').run(jeton, sanctionId); } catch (e) { jeton = null; }
    }
    const cle = type === 'ban' && (minutes === null || minutes === undefined) ? 'bandef' : type;
    const n = NOMS[cle];
    const maintenant = new Date();
    const lien = jeton ? SITE() + '/contestation.html?t=' + jeton : null;
    const lignes = [
        ['Mesure', n.titre],
        ['Durée', libelleDuree(type, minutes)],
        ['Date', dateFr(maintenant)],
        jusqua ? ['Fin de la mesure', dateFr(jusqua)] : null,
        ['Motif', raison || (auto ? 'Message contenant un mot interdit (filtre automatique)' : 'Non-respect des règles de conduite')],
        ['Décidée par', auto ? 'Le filtre automatique du site' : 'L\'équipe de modération'],
        ['Règle concernée', 'Article 6 des Conditions générales d\'utilisation (règles de conduite et sanctions)']
    ].filter(Boolean);
    let mailer = null;
    try { mailer = require('./mailer'); } catch (e) { return jeton; }
    const corps =
        '<p>Bonjour ' + esc(u.username) + ',</p>' +
        '<p>Nous vous informons qu\'une mesure de modération a été prise sur votre compte E-VISIOCAM.</p>' +
        '<table style="width:100%;border-collapse:collapse;margin:16px 0">' + lignes.map(l =>
            '<tr><td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#64748b;width:38%;vertical-align:top">' + esc(l[0]) + '</td>' +
            '<td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-weight:600">' + esc(l[1]) + '</td></tr>').join('') + '</table>' +
        '<p><strong>Ce que cela change pour vous :</strong></p><ul>' + EFFETS[cle].map(e => '<li>' + esc(e) + '</li>').join('') + '</ul>' +
        '<p>Les règles du site et le barème des sanctions sont détaillés dans nos <a href="' + SITE() + '/cgu.html#sanctions">Conditions générales d\'utilisation, article 6</a>.</p>' +
        (lien ? '<div class="warning"><strong>Vous pensez que cette décision est une erreur ?</strong><br>Vous pouvez la contester dans un délai de 6 mois grâce au lien ci-dessous. ' +
            'Votre demande sera examinée par l\'équipe de modération et vous recevrez une réponse motivée par e-mail. ' +
            'La contestation ne suspend pas la mesure pendant son examen.</div>' : '') +
        '<p style="font-size:13px;color:#64748b">Cet e-mail est envoyé automatiquement ; merci de ne pas y répondre directement. Pour toute question : <a href="' + SITE() + '/contact.html">formulaire de contact</a>.</p>';
    const texte = 'Bonjour ' + u.username + ',\n\nUne mesure de modération a été prise sur votre compte E-VISIOCAM.\n\n' +
        lignes.map(l => l[0] + ' : ' + l[1]).join('\n') + '\n\n' + EFFETS[cle].join('\n') +
        '\n\nRègles du site : ' + SITE() + '/cgu.html#sanctions' + (lien ? '\n\nContester cette décision (6 mois) : ' + lien : '');
    mailer.sendMail({
        to: u.email,
        subject: '⚠️ ' + n.sujet + ' — E-VISIOCAM',
        html: mailer.emailTemplate(n.titre, corps, lien ? 'Contester la décision' : null, lien),
        text: texte
    }).catch(e => console.error('E-mail de sanction :', e.message));
    return jeton;
}

// E-mail simple (levée de sanction, réponse à une contestation)
function envoyer(userId, titre, sujet, paragraphes, autreAdresse) {
    const u = database.getUserById(userId);
    if (!u || !(autreAdresse || u.email)) return;
    let mailer; try { mailer = require('./mailer'); } catch (e) { return; }
    const corps = '<p>Bonjour ' + esc(u.username) + ',</p>' + paragraphes.map(p => '<p>' + esc(p) + '</p>').join('');
    mailer.sendMail({ to: autreAdresse || u.email, subject: sujet + ' — E-VISIOCAM', html: mailer.emailTemplate(titre, corps), text: 'Bonjour ' + u.username + ',\n\n' + paragraphes.join('\n\n') })
        .catch(e => console.error('E-mail de sanction :', e.message));
}

function notifierLevee(userId, type) {
    const n = { ban: 'Votre suspension a été levée', kick: 'Votre exclusion a été levée', mute: 'Vous pouvez de nouveau écrire' }[type];
    if (!n) return;
    envoyer(userId, n, n, ['L\'équipe de modération a levé la mesure prise sur votre compte. ' +
        (type === 'mute' ? 'Vous pouvez de nouveau écrire dans les salons et en message privé.' : 'Vous pouvez de nouveau vous connecter.'),
        'Merci de respecter les règles du site (CGU, article 6).']);
}

// ---------- Contestations ----------
function sanctionParJeton(jeton) {
    if (!pret || !/^[a-f0-9]{48}$/.test(String(jeton || ''))) return null;
    return database.db.prepare(`SELECT s.*, u.username FROM user_sanctions s JOIN users u ON u.id = s.user_id WHERE s.appeal_token = ?`).get(jeton);
}

function resumePublic(s) {
    const a = database.db.prepare('SELECT status, decision_note, created_at, decided_at FROM sanction_appeals WHERE sanction_id = ?').get(s.id);
    const cree = depuisSqlite(s.created_at);
    return {
        pseudo: s.username, type: s.type, mesure: NOMS[s.type === 'ban' && s.minutes === null ? 'bandef' : s.type].titre,
        duree: libelleDuree(s.type, s.minutes), date: cree.toISOString(), fin: s.until, motif: s.reason || '',
        levee: !!s.lifted_at, expireLe: new Date(cree.getTime() + DELAI_JOURS * 86400000).toISOString(),
        delaiDepasse: Date.now() > cree.getTime() + DELAI_JOURS * 86400000,
        contestation: a ? { statut: a.status, reponse: a.decision_note || '', le: a.created_at, decideeLe: a.decided_at } : null
    };
}

function deposer(jeton, message, contact) {
    const s = sanctionParJeton(jeton);
    if (!s) return { erreur: 'Lien de contestation invalide', code: 404 };
    const r = resumePublic(s);
    if (r.delaiDepasse) return { erreur: 'Le délai de 6 mois pour contester cette décision est dépassé', code: 410 };
    if (r.contestation) return { erreur: 'Cette décision a déjà été contestée', code: 409 };
    database.db.prepare('INSERT INTO sanction_appeals (sanction_id, user_id, message, contact_email) VALUES (?, ?, ?, ?)')
        .run(s.id, s.user_id, message, contact || null);
    try { database.addLog('APPEAL', s.username + ' conteste la sanction #' + s.id + ' (' + s.type + ')', s.user_id, s.user_id); } catch (e) {}
    // Prévenir l'équipe (boîte contact) et accuser réception au membre
    try {
        const mailer = require('./mailer');
        mailer.sendMail({
            to: process.env.CONTACT_NOTIFY_EMAIL || 'contact@e-visiocam.com',
            subject: '⚖️ Contestation de ' + s.username + ' (' + r.mesure + ')',
            html: mailer.emailTemplate('Nouvelle contestation', '<p><strong>' + esc(s.username) + '</strong> conteste : ' + esc(r.mesure) + ' (' + esc(r.duree) + ').</p><p>' + esc(message).replace(/\n/g, '<br>') + '</p>', 'Ouvrir la modération', SITE() + '/moderation.html#contestations'),
            text: s.username + ' conteste : ' + r.mesure + '\n\n' + message
        }).catch(() => {});
    } catch (e) {}
    envoyer(s.user_id, 'Contestation reçue', 'Nous avons bien reçu votre contestation', [
        'Votre contestation concernant la mesure « ' + r.mesure + ' » a bien été enregistrée.',
        'Elle sera examinée par l\'équipe de modération. Vous recevrez la décision motivée par e-mail. La mesure reste appliquée pendant l\'examen.'], contact || null);
    return { ok: true };
}

function compterEnAttente() {
    if (!pret) return 0;
    return database.db.prepare("SELECT COUNT(*) AS n FROM sanction_appeals WHERE status = 'pending'").get().n;
}

function lister(statut) {
    return database.db.prepare(`
        SELECT a.*, s.type, s.minutes, s.until, s.reason, s.by_name, s.created_at AS sanction_le, s.lifted_at, u.username
        FROM sanction_appeals a JOIN user_sanctions s ON s.id = a.sanction_id JOIN users u ON u.id = a.user_id
        WHERE a.status = ? ORDER BY a.created_at ${statut === 'pending' ? 'ASC' : 'DESC'} LIMIT 200`).all(statut)
        .map(a => Object.assign(a, { duree: libelleDuree(a.type, a.minutes), mesure: NOMS[a.type === 'ban' && a.minutes === null ? 'bandef' : a.type].titre }));
}

// Décision : accepted → la sanction est levée ; rejected → elle est maintenue. Le membre reçoit la réponse.
function decider({ id, auteur, decision, note }) {
    const a = database.db.prepare(`SELECT a.*, s.type, s.minutes, s.lifted_at, s.user_id AS cible_id FROM sanction_appeals a JOIN user_sanctions s ON s.id = a.sanction_id WHERE a.id = ?`).get(id);
    if (!a) return { erreur: 'Contestation introuvable', code: 404 };
    if (a.status !== 'pending') return { erreur: 'Cette contestation a déjà reçu une réponse', code: 409 };
    if (!['accepted', 'rejected'].includes(decision)) return { erreur: 'Décision invalide', code: 400 };
    note = String(note || '').trim().slice(0, 2000);
    if (note.length < 10) return { erreur: 'Expliquez la décision au membre (10 caractères au moins)', code: 400 };
    if (decision === 'accepted' && a.type === 'ban' && auteur.role !== 'super_admin') return { erreur: 'Lever un bannissement est réservé au Super Admin', code: 403 };

    if (decision === 'accepted' && !a.lifted_at) {
        const cible = database.getUserById(a.cible_id);
        if (cible) require('./sanctions').lever({ cible, auteur, type: a.type, silencieux: true });
    }
    database.db.prepare('UPDATE sanction_appeals SET status = ?, decision_note = ?, decided_by = ?, decided_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(decision, note, auteur.username, id);
    try { database.addLog('APPEAL_' + decision.toUpperCase(), auteur.username + ' a ' + (decision === 'accepted' ? 'accepté' : 'refusé') + ' la contestation #' + id, auteur.id, a.cible_id); } catch (e) {}
    envoyer(a.cible_id, decision === 'accepted' ? 'Contestation acceptée' : 'Contestation refusée',
        decision === 'accepted' ? 'Votre contestation a été acceptée' : 'Réponse à votre contestation',
        decision === 'accepted'
            ? ['Après examen, votre contestation a été acceptée : la mesure prise sur votre compte est levée.', 'Explication de l\'équipe de modération : ' + note]
            : ['Après examen, votre contestation n\'a pas été retenue : la mesure est maintenue jusqu\'à son terme.', 'Explication de l\'équipe de modération : ' + note,
               'Si vous restez en désaccord, vous pouvez recourir à un organisme de règlement extrajudiciaire des litiges ou saisir les juridictions compétentes (CGU, article 6).'], a.contact_email || null);
    return { ok: true };
}

module.exports = { notifierSanction, notifierLevee, sanctionParJeton, resumePublic, deposer, lister, decider, compterEnAttente, envoyer, libelleDuree };
