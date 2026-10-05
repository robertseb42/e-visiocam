#!/usr/bin/env node
// ============================================================
// E-VISIOCAM - Sort les <script> inline d'une page vers des fichiers .js (chantier CSP)
// ------------------------------------------------------------
//   node outils/extraire-scripts.cjs contact.html                 -> liste les blocs
//   node outils/extraire-scripts.cjs contact.html contact          -> pages/contact.js
//   node outils/extraire-scripts.cjs compte.html compte-acces compte
//                                     (un nom par bloc, dans l'ordre de la page)
//
// Chaque bloc est remplacé par <script src="pages/<nom>.js"></script> À LA MÊME PLACE et sans
// defer : le navigateur l'exécute au même moment qu'avant, donc le comportement ne change pas.
// Les blocs JSON-LD (type="application/ld+json") ne sont pas exécutés : on les laisse.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '..');
const [page, ...noms] = process.argv.slice(2);
if (!page) { console.error('Usage : node outils/extraire-scripts.cjs <page.html> [nom1 nom2 …]'); process.exit(1); }

const chemin = path.join(racine, page);
const html = fs.readFileSync(chemin, 'utf8');
const fin = html.includes('\r\n') ? '\r\n' : '\n';
const re = /<script>([\s\S]*?)<\/script>/g;
const blocs = [...html.matchAll(re)];

if (!noms.length) {
    blocs.forEach((m, i) => {
        const ligne = html.slice(0, m.index).split('\n').length;
        const debut = m[1].split('\n').map(l => l.trim()).find(Boolean) || '(vide)';
        console.log('bloc ' + (i + 1) + ' — ligne ' + ligne + ', ' + m[1].split('\n').length + ' lignes : ' + debut.slice(0, 100));
    });
    process.exit(0);
}
if (noms.length !== blocs.length) {
    console.error(page + ' contient ' + blocs.length + ' bloc(s) mais ' + noms.length + ' nom(s) donné(s).');
    process.exit(1);
}

fs.mkdirSync(path.join(racine, 'pages'), { recursive: true });
let i = 0;
const resultat = html.replace(re, (tout, code) => {
    const nom = noms[i++];
    const fichier = path.join(racine, 'pages', nom + '.js');
    if (fs.existsSync(fichier)) { console.error('Existe déjà : pages/' + nom + '.js'); process.exit(1); }
    // Retire les lignes vides du début et de la fin, garde l'indentation d'origine
    const propre = code.replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\s+$/, '');
    fs.writeFileSync(fichier, '// Extrait de ' + page + ' (CSP stricte : plus de script inline dans les pages)\n' + propre + '\n');
    console.log('pages/' + nom + '.js  (' + propre.split('\n').length + ' lignes)');
    return '<script src="pages/' + nom + '.js"></script>';
});
fs.writeFileSync(chemin, resultat.replace(/\r?\n/g, fin));
