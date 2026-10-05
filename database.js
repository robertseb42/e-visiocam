// ============================================================
// BASE DE DONNÉES - SQLite
// ============================================================
const Database = require('better-sqlite3');
const path = require('path');

// ⚠️ En production (Render), utiliser le disque persistant
// DB_PATH (facultatif) : base à un autre endroit, par exemple une base temporaire pour les tests
const dbPath = process.env.DB_PATH || (process.env.NODE_ENV === 'production'
    ? '/data/database.sqlite'
    : path.join(__dirname, 'database.sqlite'));

const db = new Database(dbPath);
db.pragma('foreign_keys = ON');
// Pseudos insensibles aux majuscules : « sebastien » retrouve « Sebastien » (accents compris : « élodie » = « Élodie »)
const minuscules = v => v == null ? null : String(v).normalize('NFC').toLowerCase();
try { db.function('evc_min', { deterministic: true }, minuscules); } catch (e) { /* base simulée (tests) */ }
// Mode WAL : les lectures ne bloquent plus pendant une écriture (chat, cadeaux, connexions en même temps).
// busy_timeout : en cas d'écriture simultanée, on attend jusqu'à 5 s au lieu d'échouer.
try {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
} catch (e) { console.error('SQLite : réglages de performance impossibles —', e.message); }

// ============================================================
// CRÉATION DES TABLES
// ============================================================
db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        bio TEXT DEFAULT '',
        gender TEXT DEFAULT '',
        birthdate TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login TEXT,
        must_change_password INTEGER NOT NULL DEFAULT 0,
        tokens_valid_from TEXT
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        salon TEXT NOT NULL DEFAULT 'Salon Général',
        text TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        message TEXT NOT NULL,
        author_id INTEGER,
        target_id INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        target_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        handled_by INTEGER,
        handled_at TEXT,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moderation_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reporter_id INTEGER NOT NULL,
        target_type TEXT NOT NULL,
        target_id INTEGER,
        target_username TEXT,
        reason TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority INTEGER NOT NULL DEFAULT 1,
        handled_by INTEGER,
        action_taken TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        handled_at TEXT,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS banned_words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT UNIQUE NOT NULL,
        severity INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS flagged_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        reason TEXT,
        auto_flagged INTEGER DEFAULT 0,
        reviewed INTEGER DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token TEXT UNIQUE NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS revoked_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT NOT NULL UNIQUE,
        revoked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS credits_balance (
        user_id INTEGER PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 0,
        total_purchased INTEGER NOT NULL DEFAULT 0,
        total_spent INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS credits_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT,
        stripe_session_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS gifts_catalog (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        emoji TEXT NOT NULL,
        animation_url TEXT,
        price INTEGER NOT NULL,
        color TEXT DEFAULT 'from-pink-500 to-purple-600',
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS gifts_sent (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER,
        gift_id INTEGER NOT NULL,
        salon TEXT,
        message TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (gift_id) REFERENCES gifts_catalog(id) ON DELETE CASCADE
    );

    -- ═══════════════════════════════════════════════════════════
    -- WEBCAM ET SURVEILLANCE
    -- ═══════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS salon_streams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        salon TEXT NOT NULL,
        stream_id TEXT UNIQUE NOT NULL,
        is_broadcasting INTEGER DEFAULT 1,
        is_muted INTEGER DEFAULT 0,
        is_camera_off INTEGER DEFAULT 0,
        started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ended_at TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS moderation_view_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        moderator_id INTEGER NOT NULL,
        moderator_username TEXT NOT NULL,
        target_user_id INTEGER,
        target_username TEXT,
        stream_id TEXT,
        action TEXT NOT NULL DEFAULT 'view',
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (moderator_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ═══════════════════════════════════════════════════════════
    -- MESSAGERIE PRIVÉE
    -- ═══════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS private_conversations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user1_id INTEGER NOT NULL,
        user2_id INTEGER NOT NULL,
        last_message_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user1_id, user2_id)
    );

    CREATE TABLE IF NOT EXISTS private_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        is_read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES private_conversations(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- ═══════════════════════════════════════════════════════════
    -- RADIOS
    -- ═══════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS radios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT DEFAULT '',
        html_embed TEXT NOT NULL,
        cover_url TEXT DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0,
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );

    -- ═══════════════════════════════════════════════════════════
    -- RÉGLAGES DU SITE (mode maintenance...)
    -- ═══════════════════════════════════════════════════════════
    CREATE TABLE IF NOT EXISTS site_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    -- ═══════════════════════════════════════════════════════════
    -- INDEX
    -- ═══════════════════════════════════════════════════════════
    CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_logs_created ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_salon ON chat_messages(salon);
    CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_credits_user ON credits_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_credits_created ON credits_transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_mod_reports_status ON moderation_reports(status);
    CREATE INDEX IF NOT EXISTS idx_mod_reports_priority ON moderation_reports(priority);
    CREATE INDEX IF NOT EXISTS idx_flagged_reviewed ON flagged_messages(reviewed);
    CREATE INDEX IF NOT EXISTS idx_gifts_active ON gifts_catalog(active);
    CREATE INDEX IF NOT EXISTS idx_gifts_sent_sender ON gifts_sent(sender_id);
    CREATE INDEX IF NOT EXISTS idx_pwd_resets_token ON password_resets(token);
    CREATE INDEX IF NOT EXISTS idx_salon_streams_salon ON salon_streams(salon);
    CREATE INDEX IF NOT EXISTS idx_salon_streams_active ON salon_streams(is_broadcasting);
    CREATE INDEX IF NOT EXISTS idx_mod_view_logs_moderator ON moderation_view_logs(moderator_id);
    CREATE INDEX IF NOT EXISTS idx_mod_view_logs_target ON moderation_view_logs(target_user_id);
    CREATE INDEX IF NOT EXISTS idx_mod_view_logs_created ON moderation_view_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_conv_user1 ON private_conversations(user1_id);
    CREATE INDEX IF NOT EXISTS idx_conv_user2 ON private_conversations(user2_id);
    CREATE INDEX IF NOT EXISTS idx_conv_last_msg ON private_conversations(last_message_at);
    CREATE INDEX IF NOT EXISTS idx_pmsg_conv ON private_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_pmsg_created ON private_messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_pmsg_unread ON private_messages(conversation_id, is_read);
    CREATE INDEX IF NOT EXISTS idx_radios_active ON radios(active);
    CREATE INDEX IF NOT EXISTS idx_radios_position ON radios(position);
`);

// ============================================================
// MIGRATIONS
// ============================================================
function migrateGenderColumn() {
    try {
        const columns = db.prepare("PRAGMA table_info(users)").all();
        const hasGender = columns.some(c => c.name === 'gender');
        if (!hasGender) {
            db.prepare("ALTER TABLE users ADD COLUMN gender TEXT DEFAULT ''").run();
            console.log('🔧 Migration : colonne gender ajoutée');
        } else {
            console.log('✅ Colonne gender déjà présente');
        }
    } catch (e) {
        console.error('Erreur migration gender:', e.message);
    }
}

migrateGenderColumn();
// ⚠️ MIGRATION : Ajouter colonne stream_url si absente
try {
    const columns = db.prepare("PRAGMA table_info(radios)").all();
    const hasStreamUrl = columns.some(c => c.name === 'stream_url');
    if (!hasStreamUrl) {
        db.prepare("ALTER TABLE radios ADD COLUMN stream_url TEXT DEFAULT ''").run();
        console.log('🔧 Migration : colonne stream_url ajoutée à radios');
    } else {
        console.log('✅ Colonne stream_url déjà présente');
    }
} catch (e) {
    console.error('❌ Erreur migration stream_url:', e.message);
}

// ⚠️ MIGRATION : mot de passe à renouveler (réinitialisation par un admin)
//                 + date d'invalidation des anciennes sessions
try {
    const userColumns = db.prepare("PRAGMA table_info(users)").all();
    // Sanctions à durée (bannissement temporaire, exclusion, sourdine) : voir sanctions.js
    [['banned_until', 'TEXT'], ['kicked_until', 'TEXT'], ['muted_until', 'TEXT'], ['ban_reason', 'TEXT']].forEach(([c, t]) => {
        if (!userColumns.some(x => x.name === c)) db.prepare('ALTER TABLE users ADD COLUMN ' + c + ' ' + t).run();
    });
    if (!userColumns.some(c => c.name === 'must_change_password')) {
        db.prepare("ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0").run();
        console.log('🔧 Migration : colonne must_change_password ajoutée');
    }
    // Département du membre (« 42 »), facultatif : seul lui est gardé, pas la ville
    if (!userColumns.some(c => c.name === 'departement')) db.prepare('ALTER TABLE users ADD COLUMN departement TEXT').run();
    if (!userColumns.some(c => c.name === 'tokens_valid_from')) {
        db.prepare("ALTER TABLE users ADD COLUMN tokens_valid_from TEXT").run();
        console.log('🔧 Migration : colonne tokens_valid_from ajoutée');
    }
} catch (e) {
    console.error('❌ Erreur migration mot de passe:', e.message);
}

// ============================================================
// INITIALISATIONS
// ============================================================
function initializeBannedWords() {
    const existing = db.prepare('SELECT COUNT(*) as count FROM banned_words').get();
    if (existing.count > 0) return;

    const words = [
        { word: 'connard', severity: 2 }, { word: 'salope', severity: 2 },
        { word: 'enculé', severity: 3 }, { word: 'fdp', severity: 3 },
        { word: 'nique', severity: 3 }, { word: 'pédophile', severity: 5 },
        { word: 'viol', severity: 5 }, { word: 'drogue', severity: 4 },
        { word: 'cocaine', severity: 5 }, { word: 'arme', severity: 3 }
    ];
    const stmt = db.prepare('INSERT INTO banned_words (word, severity) VALUES (?, ?)');
    words.forEach(w => stmt.run(w.word, w.severity));
    console.log('🚫 Mots interdits initialisés : ' + words.length + ' mots');
}

function initializeGifts() {
    const existing = db.prepare('SELECT COUNT(*) as count FROM gifts_catalog').get();
    if (existing.count > 0) return;

    const gifts = [
        { name: 'Rose',            emoji: '🌹',  price: 10,  color: 'from-rose-500 to-pink-600' },
        { name: 'Coeur',           emoji: '❤️',  price: 15,  color: 'from-rose-600 to-red-600' },
        { name: 'Étoile',          emoji: '⭐',  price: 25,  color: 'from-amber-400 to-yellow-500' },
        { name: 'Bouquet',         emoji: '💐',  price: 30,  color: 'from-pink-400 to-purple-500' },
        { name: 'Peluche',         emoji: '🧸',  price: 40,  color: 'from-amber-400 to-orange-500' },
        { name: 'Couronne',        emoji: '👑',  price: 50,  color: 'from-amber-500 to-orange-600' },
        { name: 'Champagne',       emoji: '🍾',  price: 75,  color: 'from-yellow-400 to-amber-500' },
        { name: 'Diamant',         emoji: '💎',  price: 100, color: 'from-cyan-400 to-blue-500' },
        { name: 'Trophée',         emoji: '🏆',  price: 150, color: 'from-amber-500 to-yellow-600' },
        { name: 'Fusée',           emoji: '🚀',  price: 200, color: 'from-purple-500 to-pink-600' },
        { name: 'Feu d\'artifice', emoji: '🎆',  price: 300, color: 'from-red-500 to-purple-700' },
        { name: 'Voiture',         emoji: '🏎️', price: 500, color: 'from-red-600 to-orange-600' }
    ];
    const stmt = db.prepare('INSERT INTO gifts_catalog (name, emoji, price, color) VALUES (?, ?, ?, ?)');
    gifts.forEach(g => stmt.run(g.name, g.emoji, g.price, g.color));
    console.log('🎁 Catalogue de cadeaux initialisé : ' + gifts.length + ' cadeaux');
}

initializeBannedWords();
initializeGifts();

// ============================================================
// FONCTIONS UTILITAIRES
// ============================================================
const dbHelpers = {
    // ---------- USERS ----------
    getUserById(id) {
        return db.prepare('SELECT id, username, email, role, status, bio, gender, birthdate, departement, created_at, last_login, must_change_password, tokens_valid_from FROM users WHERE id = ?').get(id);
    },
    getUserByUsername(username) {
        // 1) orthographe exacte ; 2) sinon sans tenir compte des majuscules
        return db.prepare('SELECT * FROM users WHERE username = ?').get(username)
            || db.prepare('SELECT * FROM users WHERE evc_min(username) = evc_min(?) ORDER BY id LIMIT 1').get(username);
    },
    // Tous les comptes dont le pseudo ne diffère que par les majuscules (anciens doublons éventuels)
    getUsersByUsernameNoCase(username) {
        return db.prepare('SELECT * FROM users WHERE evc_min(username) = evc_min(?) ORDER BY id').all(username);
    },
    getUserByEmail(email) {
        return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    },
    getAllUsers() {
        return db.prepare('SELECT id, username, email, role, status, bio, created_at, last_login, must_change_password, banned_until, kicked_until, muted_until, ban_reason FROM users ORDER BY created_at DESC').all();
    },
    createUser(username, email, passwordHash, role = 'user') {
        return db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)')
            .run(username, email, passwordHash, role).lastInsertRowid;
    },
    updateUserRole(userId, newRole) {
        return db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, userId);
    },
    updateUserStatus(userId, status) {
        return db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, userId);
    },
    updateUserProfile(userId, { bio, birthdate, email, gender }) {
        return db.prepare(`UPDATE users SET bio = COALESCE(?, bio), birthdate = COALESCE(?, birthdate), email = COALESCE(?, email), gender = COALESCE(?, gender) WHERE id = ?`)
            .run(bio, birthdate, email, gender || '', userId);
    },
    updateLastLogin(userId) {
        return db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    },
    updatePassword(userId, hash) {
        return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
    },
    // Mot de passe + obligation de le renouveler à la prochaine connexion
    setPasswordState(userId, hash, mustChange = 0) {
        return db.prepare('UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?')
            .run(hash, mustChange ? 1 : 0, userId);
    },
    // Invalide toutes les sessions ouvertes avant cet instant (jetons JWT déjà émis)
    touchTokensValidFrom(userId) {
        return db.prepare('UPDATE users SET tokens_valid_from = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
    },
    // Un jeton émis avant la réinitialisation du mot de passe n'est plus valable
    isTokenOutdated(user, iatSeconds) {
        if (!user || !user.tokens_valid_from || !iatSeconds) return false;
        const from = Date.parse(String(user.tokens_valid_from).replace(' ', 'T') + 'Z');
        if (isNaN(from)) return false;
        return iatSeconds * 1000 < from;
    },
    deleteUser(userId) {
        // La photo de profil part avec le compte (RGPD)
        try { db.prepare('DELETE FROM user_avatars WHERE user_id = ?').run(userId); } catch (e) { /* table absente */ }
        return db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    },

    // ---------- LOGS ----------
    addLog(type, message, authorId = null, targetId = null, metadata = null) {
        return db.prepare('INSERT INTO activity_logs (type, message, author_id, target_id, metadata) VALUES (?, ?, ?, ?, ?)')
            .run(type, message, authorId, targetId, metadata ? JSON.stringify(metadata) : null);
    },
    getLogs(limit = 200) {
        return db.prepare(`SELECT l.*, u.username as author_name FROM activity_logs l
            LEFT JOIN users u ON u.id = l.author_id ORDER BY l.created_at DESC LIMIT ?`).all(limit);
    },

    // ---------- REPORTS ----------
    createReport(reporterId, targetId, type, reason) {
        return db.prepare('INSERT INTO reports (reporter_id, target_id, type, reason) VALUES (?, ?, ?, ?)')
            .run(reporterId, targetId, type, reason);
    },
    getPendingReports() {
        return db.prepare(`SELECT r.*, u1.username as reporter_name, u2.username as target_name
            FROM reports r JOIN users u1 ON u1.id = r.reporter_id
            JOIN users u2 ON u2.id = r.target_id WHERE r.status = 'pending'
            ORDER BY r.created_at DESC`).all();
    },
    handleReport(reportId, handlerId, newStatus) {
        return db.prepare('UPDATE reports SET status = ?, handled_by = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newStatus, handlerId, reportId);
    },

    // ---------- TOKENS ----------
    revokeToken(token) {
        try { return db.prepare('INSERT INTO revoked_tokens (token) VALUES (?)').run(token); }
        catch (e) { return null; }
    },
    isTokenRevoked(token) {
        return !!db.prepare('SELECT id FROM revoked_tokens WHERE token = ?').get(token);
    },

    // ---------- PASSWORD RESETS ----------
    createPasswordReset(userId, token, expiresAt) {
        db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(userId);
        return db.prepare(`INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)`)
            .run(userId, token, expiresAt);
    },
    getPasswordReset(token) {
        return db.prepare(`SELECT * FROM password_resets WHERE token = ? AND used = 0 AND expires_at > CURRENT_TIMESTAMP`).get(token);
    },
    usePasswordReset(token) {
        return db.prepare('UPDATE password_resets SET used = 1 WHERE token = ?').run(token);
    },

    // ---------- CHAT ----------
    getRecentMessages(salon = 'Salon Général', limit = 30) {
        return db.prepare(`SELECT m.*, u.username, u.role FROM chat_messages m
            JOIN users u ON u.id = m.user_id WHERE m.salon = ?
            ORDER BY m.created_at DESC LIMIT ?`).all(salon, limit).reverse();
    },
    addChatMessage(userId, salon, text) {
        return db.prepare('INSERT INTO chat_messages (user_id, salon, text) VALUES (?, ?, ?)')
            .run(userId, salon, text).lastInsertRowid;
    },

    // ---------- CRÉDITS ----------
    getBalance(userId) {
        let row = db.prepare('SELECT * FROM credits_balance WHERE user_id = ?').get(userId);
        if (!row) {
            db.prepare('INSERT INTO credits_balance (user_id, balance) VALUES (?, 0)').run(userId);
            row = db.prepare('SELECT * FROM credits_balance WHERE user_id = ?').get(userId);
        }
        return row;
    },
    addCredits(userId, amount, type, description, stripeSessionId, metadata) {
        db.prepare(`INSERT INTO credits_transactions (user_id, type, amount, description, stripe_session_id, metadata)
            VALUES (?, ?, ?, ?, ?, ?)`)
            .run(userId, type, amount, description || '', stripeSessionId || null, metadata ? JSON.stringify(metadata) : null);
        db.prepare('INSERT OR IGNORE INTO credits_balance (user_id, balance) VALUES (?, 0)').run(userId);
        if (amount > 0) {
            db.prepare(`UPDATE credits_balance SET balance = balance + ?, total_purchased = total_purchased + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
                .run(amount, amount, userId);
        } else {
            db.prepare(`UPDATE credits_balance SET balance = balance + ?, total_spent = total_spent + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?`)
                .run(amount, Math.abs(amount), userId);
        }
        return this.getBalance(userId);
    },
    getTransactions(userId, limit) {
        return db.prepare('SELECT * FROM credits_transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
            .all(userId, limit || 50);
    },

    // ---------- MODÉRATION ----------
    createModerationReport(reporterId, targetType, targetId, targetUsername, reason, description, priority = 1) {
        return db.prepare(`INSERT INTO moderation_reports (reporter_id, target_type, target_id, target_username, reason, description, priority)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(reporterId, targetType, targetId, targetUsername, reason, description || '', priority);
    },
    getModerationReports(status = 'pending', limit = 100) {
        return db.prepare(`SELECT r.*, u1.username as reporter_name, u2.username as handler_name
            FROM moderation_reports r LEFT JOIN users u1 ON u1.id = r.reporter_id
            LEFT JOIN users u2 ON u2.id = r.handled_by WHERE r.status = ?
            ORDER BY r.priority DESC, r.created_at DESC LIMIT ?`).all(status, limit);
    },
    handleModerationReport(reportId, handlerId, action, newStatus = 'resolved') {
        return db.prepare(`UPDATE moderation_reports SET status = ?, handled_by = ?, action_taken = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(newStatus, handlerId, action, reportId);
    },
    countReportsAgainstUser(userId, days = 7) {
        // Membres DIFFÉRENTS : une seule personne ne peut pas faire suspendre quelqu'un en signalant 5 fois
        return db.prepare(`SELECT COUNT(DISTINCT reporter_id) as count FROM moderation_reports
            WHERE target_id = ? AND target_type = 'user' AND created_at > datetime('now', '-' || ? || ' days')`)
            .get(userId, days).count;
    },
    getBannedWords() {
        return db.prepare('SELECT * FROM banned_words ORDER BY severity DESC').all();
    },
    addBannedWord(word, severity = 1) {
        try { return db.prepare('INSERT INTO banned_words (word, severity) VALUES (?, ?)').run(word.toLowerCase(), severity); }
        catch (e) { return null; }
    },
    removeBannedWord(word) {
        return db.prepare('DELETE FROM banned_words WHERE word = ?').run(word.toLowerCase());
    },
    flagMessage(messageId, userId, reason, autoFlagged = 0) {
        return db.prepare('INSERT INTO flagged_messages (message_id, user_id, reason, auto_flagged) VALUES (?, ?, ?, ?)')
            .run(messageId, userId, reason, autoFlagged ? 1 : 0);
    },
    getFlaggedMessages(limit = 100) {
        return db.prepare(`SELECT fm.*, u.username, cm.text, cm.salon FROM flagged_messages fm
            JOIN users u ON u.id = fm.user_id LEFT JOIN chat_messages cm ON cm.id = fm.message_id
            WHERE fm.reviewed = 0 ORDER BY fm.created_at DESC LIMIT ?`).all(limit);
    },

    // ---------- CADEAUX ----------
    getGifts() {
        return db.prepare('SELECT * FROM gifts_catalog WHERE active = 1 ORDER BY price ASC').all();
    },
    getGiftById(id) {
        return db.prepare('SELECT * FROM gifts_catalog WHERE id = ?').get(id);
    },
    sendGift(senderId, receiverId, giftId, salon, message) {
        return db.prepare('INSERT INTO gifts_sent (sender_id, receiver_id, gift_id, salon, message) VALUES (?, ?, ?, ?, ?)')
            .run(senderId, receiverId || null, giftId, salon, message || '').lastInsertRowid;
    },
    getRecentGifts(limit = 20) {
        return db.prepare(`SELECT g.*, c.name as gift_name, c.emoji as gift_emoji, c.color as gift_color, u.username as sender_name
            FROM gifts_sent g JOIN gifts_catalog c ON c.id = g.gift_id
            JOIN users u ON u.id = g.sender_id ORDER BY g.created_at DESC LIMIT ?`).all(limit);
    },

    // ---------- SURVEILLANCE MODÉRATION ----------
    logModerationView(moderatorId, moderatorUsername, targetUserId, targetUsername, streamId, action = 'view', reason = '') {
        return db.prepare(`
            INSERT INTO moderation_view_logs 
            (moderator_id, moderator_username, target_user_id, target_username, stream_id, action, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(moderatorId, moderatorUsername, targetUserId, targetUsername, streamId, action, reason);
    },
    getModerationViewLogs(limit = 100) {
        return db.prepare(`SELECT * FROM moderation_view_logs ORDER BY created_at DESC LIMIT ?`).all(limit);
    },
    getModerationViewLogsByModerator(moderatorId, limit = 50) {
        return db.prepare(`SELECT * FROM moderation_view_logs WHERE moderator_id = ? ORDER BY created_at DESC LIMIT ?`).all(moderatorId, limit);
    },

    // ---------- MESSAGERIE PRIVÉE ----------
    getOrCreateConversation(userAId, userBId) {
        const u1 = Math.min(userAId, userBId);
        const u2 = Math.max(userAId, userBId);

        let conv = db.prepare('SELECT * FROM private_conversations WHERE user1_id = ? AND user2_id = ?').get(u1, u2);
        if (conv) return conv;

        const result = db.prepare('INSERT INTO private_conversations (user1_id, user2_id) VALUES (?, ?)').run(u1, u2);
        return db.prepare('SELECT * FROM private_conversations WHERE id = ?').get(result.lastInsertRowid);
    },
    getConversationById(convId) {
        return db.prepare('SELECT * FROM private_conversations WHERE id = ?').get(convId);
    },
    getUserConversations(userId) {
        const rows = db.prepare(`
            SELECT 
                c.id,
                c.user1_id,
                c.user2_id,
                c.last_message_at,
                CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END AS other_user_id,
                (SELECT content FROM private_messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_message,
                (SELECT COUNT(*) FROM private_messages WHERE conversation_id = c.id AND sender_id != ? AND is_read = 0) AS unread_count
            FROM private_conversations c
            WHERE c.user1_id = ? OR c.user2_id = ?
            ORDER BY c.last_message_at DESC
        `).all(userId, userId, userId, userId);

        return rows.map(row => {
            const other = db.prepare('SELECT id, username, role, status FROM users WHERE id = ?').get(row.other_user_id);
            return {
                id: row.id,
                otherUser: other,
                lastMessage: row.last_message,
                lastMessageAt: row.last_message_at,
                unreadCount: row.unread_count
            };
        });
    },
    getConversationMessages(convId, limit = 100) {
        return db.prepare(`
            SELECT m.*, u.username AS sender_username, u.role AS sender_role
            FROM private_messages m
            JOIN users u ON u.id = m.sender_id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at ASC
            LIMIT ?
        `).all(convId, limit);
    },
    addPrivateMessage(convId, senderId, content) {
        const result = db.prepare('INSERT INTO private_messages (conversation_id, sender_id, content) VALUES (?, ?, ?)')
            .run(convId, senderId, content);
        db.prepare('UPDATE private_conversations SET last_message_at = CURRENT_TIMESTAMP WHERE id = ?').run(convId);
        return db.prepare('SELECT * FROM private_messages WHERE id = ?').get(result.lastInsertRowid);
    },
    markConversationAsRead(convId, userId) {
        return db.prepare('UPDATE private_messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0')
            .run(convId, userId);
    },
    getTotalUnreadCount(userId) {
        const row = db.prepare(`
            SELECT COUNT(*) AS count FROM private_messages m
            JOIN private_conversations c ON c.id = m.conversation_id
            WHERE (c.user1_id = ? OR c.user2_id = ?)
              AND m.sender_id != ?
              AND m.is_read = 0
        `).get(userId, userId, userId);
        return row.count;
    },

    // ---------- RADIOS ----------
    getAllRadios(onlyActive = false) {
        if (onlyActive) {
            return db.prepare('SELECT * FROM radios WHERE active = 1 ORDER BY position ASC, id ASC').all();
        }
        return db.prepare('SELECT * FROM radios ORDER BY position ASC, id ASC').all();
    },
    getRadioById(id) {
        return db.prepare('SELECT * FROM radios WHERE id = ?').get(id);
    },
    createRadio({ name, description, html_embed, cover_url, position, created_by, stream_url }) {
        const result = db.prepare(`
            INSERT INTO radios (name, description, html_embed, cover_url, position, created_by, stream_url)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(name, description || '', html_embed || '', cover_url || '', position || 0, created_by || null, stream_url || '');
        return db.prepare('SELECT * FROM radios WHERE id = ?').get(result.lastInsertRowid);
    },

    updateRadio(id, { name, description, html_embed, cover_url, position, active, stream_url }) {
        return db.prepare(`
            UPDATE radios SET 
                name = COALESCE(?, name),
                description = COALESCE(?, description),
                html_embed = COALESCE(?, html_embed),
                cover_url = COALESCE(?, cover_url),
                position = COALESCE(?, position),
                active = COALESCE(?, active),
                stream_url = COALESCE(?, stream_url)
            WHERE id = ?
        `).run(name, description, html_embed, cover_url, position, active, stream_url, id);
    },
    deleteRadio(id) {
        return db.prepare('DELETE FROM radios WHERE id = ?').run(id);
    },

    // ---------- RÉGLAGES DU SITE ----------
    getSetting(key) {
        const row = db.prepare('SELECT value FROM site_settings WHERE key = ?').get(key);
        return row ? row.value : null;
    },
    setSetting(key, value) {
        db.prepare(`INSERT INTO site_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(key, String(value));
    }
};

module.exports = { db, dbPath, ...dbHelpers };
