// ============================================================
// SERVEUR PRINCIPAL - Express
// ============================================================
require('dotenv').config();
require('./mailer');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const http = require('http');
const { initializeSocket } = require('./socket');
const maintenance = require('./maintenance');
const privateLive = require('./private-live');
const { optionalAuthenticate } = require('./middleware');
const app = express();
app.use(require('./sensitive-files'));
// ⚠️ IMPORTANT pour Render (proxy)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;

// ---------- SÉCURITÉ ----------
app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.ALLOWED_ORIGINS || 'https://robertseb42.github.io,https://www.e-visiocam.com,https://e-visiocam.com').split(',').map(o => o.trim()).filter(Boolean)
        : true,
    credentials: true
}));

// ---------- MODE MAINTENANCE ----------
// Avant toutes les routes : si le Super Admin l'a activé, l'API répond 503 aux autres.
app.use('/api', maintenance.gate);
app.get('/api/maintenance', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(maintenance.get());
});

// Décor : analyse JSON après authentification, pour les images (9 Mo maximum).
app.use('/api/decor', rateLimit({ windowMs: 60000, max: 60 }), require('./routes/decor'));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------- RATE LIMITING GLOBAL ----------
app.use('/api/', rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Trop de requêtes. Ralentissez.' }
}));

// ---------- LOGS ----------
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ---------- ROUTES API ----------
app.use('/api/auth', require('./routes/auth'));
app.use('/api/auth', require('./routes/password'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/mod', require('./routes/moderation'));
app.use('/api/model', require('./routes/model'));
app.use('/api/users', require('./routes/users'));
app.use('/api/credits', require('./routes/credits'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/turn', require('./routes/turn'));   // ← AJOUT CLOUDFLARE TURN
app.use('/api/sfu', require('./routes/sfu'));    // Diffusion Cloudflare Realtime SFU
app.use('/api/messages', require('./routes/messages'));
app.use('/api/radios', require('./routes/radios'));
app.use('/api/salons', require('./routes/salons'));
require('./sanctions'); require('./sanctions-mail'); require('./email-verif');
try { require('./gratuit').remettreAZero(); } catch (e) { console.error('Remise à zéro des crédits :', e.message); }   // tables des sanctions et des contestations
app.use('/api/appeals', require('./routes/appeals'));   // Contestation d'une sanction (lien reçu par e-mail)
app.use('/api/rewards', require('./routes/rewards'));   // Programme de récompenses (site gratuit)
app.use('/api/contact', require('./routes/contact'));   // Formulaire de contact + boîte Super Admin
const discover = require('./routes/discover');
app.use('/api/models', discover.models);         // Annuaire et recherche des modèles
app.use('/api/favorites', discover.favorites);   // Favoris (modèles, salons) + alertes de live
// Route pour lister les streams actifs (WebRTC)
// Les lives privés n'y figurent que pour le diffuseur, ses invités et la modération (jeton de connexion facultatif)
app.get('/api/streams', optionalAuthenticate, (req, res) => {
    const streams = [];
    if (global.liveStreams) {
        global.liveStreams.forEach((stream, streamId) => {
            if (!privateLive.canWatch(stream, req.user)) return;
            streams.push({
                streamId: streamId,
                broadcasterId: stream.broadcasterId,
                broadcasterUsername: stream.broadcasterUsername,
                isPrivate: !!stream.isPrivate,
                salon: stream.isPrivate ? null : (stream.salon || null),   // le salon d'un live privé reste discret
                startedAt: stream.startedAt,
                viewers: stream.viewers.length
            });
        });
    }
    res.json({ streams });
});

// ---------- HEALTH CHECK ----------
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- SERVE FRONT-END (en dev) ----------
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- 404 ----------
app.use((req, res) => {
    res.status(404).json({ error: 'Route introuvable' });
});

// ---------- ERREUR GLOBALE ----------
app.use((err, req, res, next) => {
    console.error('Erreur:', err);
    res.status(500).json({ error: 'Erreur serveur' });
});

// ---------- DÉMARRAGE ----------
const httpServer = http.createServer(app);
const io = initializeSocket(httpServer);
global.io = io;

// Sauvegarde automatique de la base, chaque nuit (voir backup.js)
try {
    const dbm = require('./database');
    require('./sanctions');   // table de l'historique des sanctions
    require('./stats');   // tables des statistiques (et reprise des dernières connexions)
    require('./backup').demarrer(dbm.db, dbm.dbPath, require('./mailer'));
} catch (e) { console.error('Sauvegardes non démarrées :', e.message); }

httpServer.listen(PORT, () => {
    console.log('');
    console.log('════════════════════════════════════════');
    console.log(`🚀 Serveur E-VISIOCAM démarré`);
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`💬 WebSocket actif`);
    console.log(`🌍 Environnement : ${process.env.NODE_ENV || 'development'}`);
    console.log('════════════════════════════════════════');
    console.log('');
});
