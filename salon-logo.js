// ============================================================
// E-VISIOCAM - Préparation d'un logo image de salon
// ------------------------------------------------------------
// Utilisé par « Gestion des salons » (moderation-salons.html).
//   SalonLogo.preparerImage(file) -> Promise<{ data, w, h, cote, octets }>
// Contrôle le fichier (format, poids, taille minimale), le réduit dans un carré
// de 256 px au maximum, SANS le déformer (l'image est centrée en entier), puis
// renvoie une image prête à envoyer au serveur (PNG, sinon WebP ou JPG si trop lourde).
// ============================================================
(function () {
    'use strict';

    var LOGO = {
        px: 256,                           // côté du logo final
        min: 64,                           // en dessous, le logo serait flou
        maxBytes: 2 * 1024 * 1024,         // poids du fichier choisi
        serveurMaxBytes: 380 * 1024,       // le serveur refuse au-delà de 400 Ko
        types: ['image/png', 'image/jpeg', 'image/webp']
    };

    // Côté du carré : 256 px au maximum, sans agrandir une petite image (ce qui la rendrait floue)
    function cotePourImage(w, h) { return Math.min(LOGO.px, Math.max(w, h)); }

    // Place l'image ENTIÈRE, centrée, sans la déformer, dans un carré de `cote` px
    function ajusterDansCarre(w, h, cote) {
        var k = Math.min(cote / w, cote / h);
        var dw = Math.max(1, Math.round(w * k)), dh = Math.max(1, Math.round(h * k));
        return { dw: dw, dh: dh, dx: Math.floor((cote - dw) / 2), dy: Math.floor((cote - dh) / 2) };
    }

    function octetsDataUrl(data) {
        var b64 = data.slice(data.indexOf(',') + 1);
        return Math.floor(b64.length * 3 / 4) - (b64.slice(-2) === '==' ? 2 : b64.slice(-1) === '=' ? 1 : 0);
    }

    function preparerImage(file) {
        return new Promise(function (resolve, reject) {
            if (!file || LOGO.types.indexOf(file.type) === -1) {
                return reject(new Error('Format non accepté : utilisez PNG, JPG ou WebP.'));
            }
            if (file.size > LOGO.maxBytes) {
                return reject(new Error('Image trop lourde (' + (file.size / 1048576).toFixed(1).replace('.', ',') + ' Mo) : 2 Mo maximum.'));
            }
            var url = URL.createObjectURL(file);
            var img = new Image();
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible ou abîmée.')); };
            img.onload = function () {
                URL.revokeObjectURL(url);
                var w = img.naturalWidth, h = img.naturalHeight;
                if (w < LOGO.min || h < LOGO.min) {
                    return reject(new Error('Image trop petite (' + w + ' × ' + h + ' px) : ' + LOGO.min + ' × ' + LOGO.min + ' px minimum.'));
                }
                var cote = cotePourImage(w, h), p = ajusterDansCarre(w, h, cote);
                var canvas = document.createElement('canvas');
                canvas.width = cote; canvas.height = cote;
                canvas.getContext('2d').drawImage(img, p.dx, p.dy, p.dw, p.dh);
                // PNG d'abord (garde la transparence) ; si c'est trop lourd (photo), WebP puis JPG
                var essais = [['image/png'], ['image/webp', 0.9], ['image/jpeg', 0.85]];
                for (var i = 0; i < essais.length; i++) {
                    var data = canvas.toDataURL(essais[i][0], essais[i][1]);
                    if (data.indexOf('data:' + essais[i][0]) === 0 && octetsDataUrl(data) <= LOGO.serveurMaxBytes) {
                        return resolve({ data: data, w: w, h: h, cote: cote, octets: octetsDataUrl(data) });
                    }
                }
                reject(new Error('Image trop détaillée : essayez une image plus simple ou plus petite.'));
            };
            img.src = url;
        });
    }

    // ------------------------------------------------------------
    // Image d'en-tête d'un salon (carte « Trouvez votre ambiance » de l'accueil)
    //   SalonLogo.preparerCouverture(file) -> Promise<{ data, w, h, largeur, hauteur, octets }>
    // Recadre au centre au format de la carte (2,64 : 1), 1600 px de large au maximum,
    // puis JPG de plus en plus compressé jusqu'à passer sous la limite du serveur.
    // ------------------------------------------------------------
    var COVER = {
        largeur: 1600, ratio: 557 / 211, minW: 600, minH: 200,
        maxBytes: 10 * 1024 * 1024, serveurMaxBytes: 620 * 1024,
        types: ['image/png', 'image/jpeg', 'image/webp']
    };

    function preparerCouverture(file) {
        return new Promise(function (resolve, reject) {
            if (!file || COVER.types.indexOf(file.type) === -1) return reject(new Error('Format non accepté : utilisez PNG, JPG ou WebP.'));
            if (file.size > COVER.maxBytes) return reject(new Error('Image trop lourde : 10 Mo maximum.'));
            var url = URL.createObjectURL(file), img = new Image();
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Image illisible ou abîmée.')); };
            img.onload = function () {
                URL.revokeObjectURL(url);
                var w = img.naturalWidth, h = img.naturalHeight;
                if (w < COVER.minW || h < COVER.minH) return reject(new Error('Image trop petite (' + w + ' × ' + h + ' px) : ' + COVER.minW + ' × ' + COVER.minH + ' px minimum.'));
                // Zone gardée : la plus grande possible au bon format, centrée
                var sw = w, sh = Math.round(w / COVER.ratio);
                if (sh > h) { sh = h; sw = Math.round(h * COVER.ratio); }
                var sx = Math.floor((w - sw) / 2), sy = Math.floor((h - sh) / 2);
                var lw = Math.min(COVER.largeur, sw), lh = Math.round(lw / COVER.ratio);
                var canvas = document.createElement('canvas');
                canvas.width = lw; canvas.height = lh;
                var ctx = canvas.getContext('2d');
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, sx, sy, sw, sh, 0, 0, lw, lh);
                var qualites = [0.86, 0.8, 0.72, 0.64, 0.56];
                for (var i = 0; i < qualites.length; i++) {
                    var data = canvas.toDataURL('image/jpeg', qualites[i]);
                    if (octetsDataUrl(data) <= COVER.serveurMaxBytes) {
                        return resolve({ data: data, w: w, h: h, largeur: lw, hauteur: lh, octets: octetsDataUrl(data) });
                    }
                }
                reject(new Error('Image trop détaillée : essayez-en une autre.'));
            };
            img.src = url;
        });
    }

    window.SalonLogo = { LOGO: LOGO, COVER: COVER, cotePourImage: cotePourImage, ajusterDansCarre: ajusterDansCarre,
                         octetsDataUrl: octetsDataUrl, preparerImage: preparerImage, preparerCouverture: preparerCouverture };
})();
