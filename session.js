// ============================================================
// SESSION PAR COOKIE SÉCURISÉ - E-VISIOCAM
// ------------------------------------------------------------
// Le jeton de connexion vit dans un cookie « HttpOnly » : le JavaScript des pages
// ne peut pas le lire, donc une faille d'affichage (XSS) ne permet plus de le voler.
//   HttpOnly      → invisible pour le JavaScript
//   Secure        → envoyé uniquement en HTTPS
//   SameSite=Strict → jamais envoyé depuis un autre site (protection CSRF)
// www.e-visiocam.com et api.e-visiocam.com sont le même « site » : le cookie suit.
// Transition : un en-tête « Authorization: Bearer … » reste accepté.
// ============================================================
const jwt = require('jsonwebtoken');

const COOKIE = 'evc_session';

function lireCookies(header) {
    const out = {};
    String(header || '').split(';').forEach(part => {
        const i = part.indexOf('=');
        if (i > 0) {
            const k = part.slice(0, i).trim();
            try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch (e) {}
        }
    });
    return out;
}

// Jeton de la requête : en-tête Authorization d'abord (anciens onglets), sinon cookie
function tokenFromHeaders(headers) {
    const h = headers && headers.authorization;
    if (h && h.startsWith('Bearer ')) {
        const t = h.substring(7).trim();
        if (t && t !== 'null' && t !== 'undefined') return t;
    }
    return lireCookies(headers && headers.cookie)[COOKIE] || null;
}
const tokenFrom = req => tokenFromHeaders(req.headers);

function attributs(maxAgeSec) {
    const a = ['Path=/', 'HttpOnly', 'SameSite=Strict'];
    // Secure partout sauf en développement sur http://localhost explicitement demandé
    if (process.env.COOKIE_INSECURE !== '1') a.push('Secure');
    a.push('Max-Age=' + Math.max(0, Math.floor(maxAgeSec)));
    return a.join('; ');
}

function poserSession(res, token) {
    let maxAge = 7 * 24 * 3600;
    try {
        const p = jwt.decode(token);
        if (p && p.exp) maxAge = p.exp - Math.floor(Date.now() / 1000);
    } catch (e) {}
    res.append('Set-Cookie', COOKIE + '=' + encodeURIComponent(token) + '; ' + attributs(maxAge));
}

function effacerSession(res) {
    res.append('Set-Cookie', COOKIE + '=; ' + attributs(0));
}

module.exports = { COOKIE, tokenFrom, tokenFromHeaders, poserSession, effacerSession, lireCookies };
