// ============================================================
// E-VISIOCAM — Avatars par défaut : masques vénitiens dessinés en SVG (aucune image à charger)
//   evcMasque(genre, graine)  → balise <svg> prête à insérer
//     genre  : 'femme' | 'homme' | 'couple' | autre valeur (masque neutre doré)
//     graine : nombre ou texte (id, pseudo) — choisit la couleur, toujours la même pour un membre
//   evcAvatarHtml(membre, base) → <img> de la photo validée, sinon le masque
// Membres sans photo : discrétion assumée, dans l'esprit du site.
// ============================================================
(function () {
    'use strict';
    var PALETTES = {
        femme: [['#ff1680', '#ff7ab8'], ['#e11d48', '#fb7185'], ['#c026d3', '#f0abfc'], ['#db2777', '#f9a8d4']],
        homme: [['#2563eb', '#60a5fa'], ['#7c3aed', '#a78bfa'], ['#0f766e', '#2dd4bf'], ['#1e40af', '#818cf8']],
        couple: [['#ff1680', '#7c3aed'], ['#e11d48', '#2563eb'], ['#c026d3', '#0ea5e9'], ['#db2777', '#4f46e5']],
        neutre: [['#eab308', '#fde047'], ['#f59e0b', '#fcd34d'], ['#ca8a04', '#facc15'], ['#d97706', '#fbbf24']]
    };
    var n = 0;
    function hash(g) { var s = String(g == null ? '' : g), h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
    function famille(genre) {
        var g = String(genre || '').toLowerCase();
        if (g === 'femme' || g === 'female' || g === 'f') return 'femme';
        if (g === 'homme' || g === 'male' || g === 'h') return 'homme';
        if (g === 'couple') return 'couple';
        return 'neutre';
    }
    // Masque « colombine » (une moitié de visage) : contour, deux yeux en amande, liseré doré
    function masque(id, c1, c2, angulaire) {
        var forme = angulaire
            ? 'M12 42 L22 31 Q36 26 50 35 Q64 26 78 31 L88 42 Q86 56 72 62 Q60 66 54 58 Q50 54 46 58 Q40 66 28 62 Q14 56 12 42 Z'
            : 'M13 44 C13 31 32 26 50 35 C68 26 87 31 87 44 C87 58 70 67 58 60 C54 57 52 55 50 55 C48 55 46 57 42 60 C30 67 13 58 13 44 Z';
        return '<path d="' + forme + '" fill="url(#' + id + 'g)" stroke="#ffd34d" stroke-width="2" stroke-linejoin="round"/>' +
            '<path d="' + forme + '" fill="url(#' + id + 'r)" opacity=".55"/>' +
            '<ellipse cx="34" cy="45" rx="9.5" ry="5.6" transform="rotate(-8 34 45)" fill="#0b0b0f" stroke="#ffd34d" stroke-width="1.2"/>' +
            '<ellipse cx="66" cy="45" rx="9.5" ry="5.6" transform="rotate(8 66 45)" fill="#0b0b0f" stroke="#ffd34d" stroke-width="1.2"/>' +
            '<circle cx="50" cy="40" r="2.6" fill="#ffd34d"/>' +
            '<path d="M22 53 q6 4 12 2 M66 55 q6 2 12 -2" stroke="#ffffff66" stroke-width="1.3" fill="none" stroke-linecap="round"/>';
    }
    function defs(id, c1, c2) {
        return '<defs><linearGradient id="' + id + 'g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + c2 + '"/><stop offset="1" stop-color="' + c1 + '"/></linearGradient>' +
            '<radialGradient id="' + id + 'r" cx=".35" cy=".25" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
            '<radialGradient id="' + id + 'f" cx=".5" cy=".35" r=".75"><stop offset="0" stop-color="' + c1 + '" stop-opacity=".45"/><stop offset="1" stop-color="#141418"/></radialGradient></defs>';
    }
    window.evcMasque = function (genre, graine) {
        var f = famille(genre), pal = PALETTES[f][hash(graine) % 4], c1 = pal[0], c2 = pal[1];
        var id = 'evm' + (++n) + '_';
        var fond = '<rect width="100" height="100" fill="url(#' + id + 'f)"/>';
        var corps;
        if (f === 'couple') {
            // Deux masques qui se chevauchent : rose devant à gauche, bleu derrière à droite
            corps = defs(id + 'b', c2, c2) + '<g transform="translate(26 14) scale(.74)">' + masque(id + 'b', c2, c2, true) + '</g>' +
                '<g transform="translate(-2 30) scale(.74)">' + masque(id, c1, c1, false) + '</g>';
        } else if (f === 'femme') {
            // Colombine avec une plume
            corps = '<path d="M80 42 C84 28 80 16 70 10 C74 20 72 30 66 38 Z" fill="' + c2 + '" stroke="#ffd34d" stroke-width="1.2"/>' +
                '<path d="M70 12 C72 22 70 32 66 38" stroke="#ffd34d" stroke-width="1" fill="none"/>' +
                '<g transform="translate(0 8)">' + masque(id, c1, c2, false) + '</g>' +
                '<circle cx="50" cy="69" r="1.6" fill="#ffd34d"/><circle cx="44" cy="71" r="1.2" fill="#ffd34d"/><circle cx="56" cy="71" r="1.2" fill="#ffd34d"/>';
        } else if (f === 'homme') {
            // Masque anguleux avec rubans
            corps = '<g transform="translate(0 8)">' + masque(id, c1, c2, true) + '</g>' +
                '<path d="M12 50 q-6 10 -2 22 M88 50 q6 10 2 22" stroke="' + c2 + '" stroke-width="3" fill="none" stroke-linecap="round"/>';
        } else {
            // Neutre : masque doré avec une étoile
            corps = '<g transform="translate(0 8)">' + masque(id, c1, c2, false) + '</g>' +
                '<path d="M50 18 l3 7 7 .6 -5.4 4.6 1.7 7 -6.3 -3.8 -6.3 3.8 1.7 -7 -5.4 -4.6 7 -.6 Z" fill="#ffd34d"/>';
        }
        return '<svg class="evc-masque" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Avatar masqué">' +
            (f === 'couple' ? defs(id, c1, c1) : defs(id, c1, c2)) + fond + '<g transform="translate(50 52) scale(' + (f === 'couple' ? 1.1 : 1.16) + ') translate(-50 -52)">' + corps + '</g></svg>';
    };
    // Photo validée si elle existe, sinon le masque
    window.evcAvatarHtml = function (m) {
        var photo = m && typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        if (photo) return '<img src="' + photo.replace(/"/g, '&quot;') + '" alt="" loading="lazy">';
        return window.evcMasque(m && (m.genre != null ? m.genre : m.gender), m && (m.id != null ? m.id : m.username));
    };
})();
