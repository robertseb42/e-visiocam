// ============================================================
// LIVE PRIVÉ SUR INVITATION
// ------------------------------------------------------------
// Un live privé n'est visible, listé et accessible que pour :
//   - son diffuseur,
//   - les membres qu'il a invités,
//   - l'équipe de modération (super admin et modérateurs), qui garde son droit
//     de regard comme sur toutes les caméras du site.
// Les règles sont ici, à un seul endroit : socket.js, routes/sfu.js et
// l'annuaire /api/streams les appellent toutes de la même façon.
// ============================================================
'use strict';

const MAX_INVITES = 20;

const isStaff = u => !!u && (u.role === 'super_admin' || u.role === 'moderator');

// Ce membre peut-il voir ce live ? (live public : tout le monde, même sans compte)
function canWatch(stream, user) {
    if (!stream) return false;
    // Un live public dans un salon privé reste réservé aux membres autorisés.
    if (stream.salon && !require('./salon-security').canAccessSalon(user, stream.salon)) return false;
    if (!stream.isPrivate) return true;
    if (!user) return false;
    if (user.id === stream.broadcasterId) return true;
    if (isStaff(user)) return true;
    return !!(stream.invited && stream.invited.has(user.id));
}

// Nettoie la liste d'invités envoyée par le navigateur : entiers uniques, pas soi-même,
// comptes existants et non bannis, 20 au maximum. `lookup(id)` renvoie l'utilisateur ou rien.
function cleanInvites(ids, ownerId, lookup) {
    const out = [];
    if (!Array.isArray(ids)) return out;
    for (const raw of ids) {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0 || id === ownerId || out.includes(id)) continue;
        let u = null;
        try { u = lookup(id); } catch (e) { u = null; }
        if (!u || u.status === 'banned') continue;
        out.push(id);
        if (out.length >= MAX_INVITES) break;
    }
    return out;
}

module.exports = { MAX_INVITES, isStaff, canWatch, cleanInvites };
