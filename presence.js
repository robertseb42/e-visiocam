// ============================================================
// PRÉSENCE — qui est connecté, qui est en direct
// ------------------------------------------------------------
// Connecté = une connexion temps réel ouverte (pages de chat, live)
//            OU un appel à l'API depuis moins de 2 minutes (toutes les pages
//            interrogent l'API au moins toutes les 30 s ; voir middleware.js).
// ============================================================
'use strict';
const DELAI_MS = 2 * 60 * 1000;

function enLigne() {
    const ids = new Set();
    try { if (global.onlineUsers) global.onlineUsers.forEach(u => { if (u && u.id) ids.add(u.id); }); } catch (e) {}
    const t = Date.now();
    try { if (global.evcDerniereVue) global.evcDerniereVue.forEach((vu, id) => { if (t - vu < DELAI_MS) ids.add(id); }); } catch (e) {}
    return ids;
}
const estEnLigne = id => enLigne().has(Number(id));

// Lives PUBLICS en cours, par diffuseur (un live privé reste discret)
function livesPublics() {
    const parMembre = new Map();
    try {
        if (global.liveStreams) global.liveStreams.forEach((s, streamId) => {
            if (s.isPrivate || s.isBroadcasting === false) return;
            if (!parMembre.has(s.broadcasterId)) parMembre.set(s.broadcasterId, { streamId, salon: s.salon, viewers: (s.viewers || []).length, startedAt: s.startedAt });
        });
    } catch (e) {}
    return parMembre;
}

module.exports = { enLigne, estEnLigne, livesPublics, DELAI_MS };
