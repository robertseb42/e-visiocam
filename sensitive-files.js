'use strict';
// Défense complémentaire : aucune base, copie, configuration ou métadonnée Git
// ne doit être servie par express.static, même si elle est copiée dans public/.
module.exports = function sensitiveFiles(req, res, next) {
    let pathname;
    try { pathname = decodeURIComponent(req.path); } catch { return res.sendStatus(400); }
    if (/(?:^|\/)\.(?:env(?:\.[^/]*)?|git)(?:\/|$)/i.test(pathname) ||
        /\.(?:sqlite(?:3)?|db)(?:[-.][^/]*)?(?:\/|$)/i.test(pathname)) {
        return res.status(404).json({ error: 'Route introuvable' });
    }
    next();
};
