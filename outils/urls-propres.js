// Adresses « propres » pour Google et Bing.
// Cloudflare Pages retire le .html des adresses (/tchat-bretagne.html redirige vers /tchat-bretagne).
// Si le sitemap ou la balise canonical donnent l'adresse avec .html, les moteurs tombent sur une
// redirection au lieu de la page, et l'indexation ralentit.
// Ce script tourne APRÈS la construction de _site : il réécrit uniquement les adresses complètes
// du site (https://www.e-visiocam.com/xxx.html) dans le sitemap et dans les pages HTML
// (canonical, og:url, données structurées). Les liens internes relatifs ne sont pas touchés.
// Usage : node outils/urls-propres.js _site
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(process.argv[2] || '_site');
const MOTIF = /https:\/\/www\.e-visiocam\.com\/((?:[\w-]+\/)*)([\w-]+)\.html(?=[?#"'<\s]|$)/g;

function propre(texte) {
    return texte.replace(MOTIF, (tout, dossiers, nom) =>
        'https://www.e-visiocam.com/' + dossiers + (nom === 'index' ? '' : nom));
}

let fichiers = 0, adresses = 0;
function traiter(f) {
    const avant = fs.readFileSync(f, 'utf8');
    const n = (avant.match(MOTIF) || []).length;
    if (!n) return;
    fs.writeFileSync(f, propre(avant));
    fichiers++; adresses += n;
}
function parcourir(dossier) {
    for (const e of fs.readdirSync(dossier, { withFileTypes: true })) {
        const p = path.join(dossier, e.name);
        if (e.isDirectory()) parcourir(p);
        else if (/\.(html|xml)$/i.test(e.name)) traiter(p);
    }
}
if (!fs.existsSync(SITE)) { console.log('urls-propres : dossier ' + SITE + ' introuvable'); process.exit(0); }
parcourir(SITE);
console.log('urls-propres : ' + adresses + ' adresse(s) sans .html dans ' + fichiers + ' fichier(s).');
