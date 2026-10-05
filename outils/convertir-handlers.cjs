#!/usr/bin/env node
// ============================================================
// E-VISIOCAM - Convertit les onclick="…", onsubmit="…", oninput="…", onchange="…" d'une page
// en attributs data-* lus par actions.js (chantier CSP)
// ------------------------------------------------------------
//   node outils/convertir-handlers.cjs compte.html [autre.html …]
//
// Ne convertit que les appels simples : nomFonction(arguments) où chaque argument est un texte
// entre apostrophes, un nombre, true/false/null, this, event ou this.value. Exemple :
//   onclick="showTab('users', this)"  ->  data-click="showTab" data-click-args='["users","$this"]'
// Tout le reste est signalé et laissé tel quel, à traiter à la main.
//
// Ajoute <script src="actions.js"></script> dans le <head> si la page ne le charge pas encore,
// et affiche les fonctions à ajouter à la liste AUTORISEES d'actions.js.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '..');
const EVENEMENTS = { onclick: 'click', onsubmit: 'submit', oninput: 'input', onchange: 'change' };

const autorisees = new Set(
    (fs.readFileSync(path.join(racine, 'actions.js'), 'utf8').match(/AUTORISEES = new Set\(\[([\s\S]*?)\]\)/) || [, ''])[1]
        .match(/'[^']+'/g)?.map(s => s.slice(1, -1)) || []
);

// Découpe "'users', this" en ['users', '$this'] ; null si un argument n'est pas simple
function lireArguments(texte) {
    const args = [];
    let reste = texte.trim();
    while (reste) {
        let m;
        if ((m = reste.match(/^'((?:[^'\\]|\\.)*)'/))) args.push(m[1].replace(/\\(.)/g, '$1'));
        else if ((m = reste.match(/^this\.value\b/))) args.push('$value');
        else if ((m = reste.match(/^this\b/))) args.push('$this');
        else if ((m = reste.match(/^event\b/))) args.push('$event');
        else if ((m = reste.match(/^(true|false|null)\b/))) args.push(JSON.parse(m[1]));
        else if ((m = reste.match(/^-?\d+(\.\d+)?\b/))) args.push(Number(m[0]));
        else return null;
        reste = reste.slice(m[0].length).trim();
        if (!reste) break;
        if (reste[0] !== ',') return null;
        reste = reste.slice(1).trim();
    }
    return args;
}

const attr = s => s.replace(/&/g, '&amp;').replace(/'/g, '&#39;');

for (const page of process.argv.slice(2)) {
    const chemin = path.join(racine, page);
    let html = fs.readFileSync(chemin, 'utf8');
    const nouvelles = new Set();
    let convertis = 0;

    html = html.replace(/\s(onclick|onsubmit|oninput|onchange)="([^"]*)"/g, (tout, handler, code) => {
        const type = EVENEMENTS[handler];
        // « return fn(…) » ou « fn(…); return false » : on garde l'appel, l'annulation devient -prevent
        let corps = code.trim().replace(/;\s*$/, '');
        let prevent = false;
        const rf = corps.match(/^(.*?);\s*return\s+false$/);
        if (rf) { corps = rf[1].trim(); prevent = true; }
        const m = corps.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/);
        const args = m && lireArguments(m[2]);
        if (!args) {
            const ligne = html.slice(0, html.indexOf(tout)).split('\n').length;
            console.log('  ⚠ ' + page + ' ligne ' + ligne + ' — à faire à la main : ' + handler + '="' + code + '"');
            return tout;
        }
        convertis++;
        if (!autorisees.has(m[1])) nouvelles.add(m[1]);
        let r = ' data-' + type + '="' + m[1] + '"';
        if (args.length) r += " data-" + type + "-args='" + attr(JSON.stringify(args)) + "'";
        if (prevent) r += ' data-' + type + '-prevent';
        return r;
    });

    if (convertis && !/<script\b[^>]*\bsrc="actions\.js[?"]/.test(html)) {
        const fin = html.includes('\r\n') ? '\r\n' : '\n';
        const balise = '<script src="actions.js"></script>';
        if (/<script src="theme\.js"><\/script>/.test(html)) {
            html = html.replace(/([ \t]*)<script src="theme\.js"><\/script>/, (t, ind) => t + fin + ind + balise);
        } else {
            html = html.replace(/([ \t]*)<\/head>/, (t, ind) => ind + '    ' + balise + fin + t);
        }
    }

    fs.writeFileSync(chemin, html);
    console.log(page + ' : ' + convertis + ' converti(s)' + (nouvelles.size ? ' — à autoriser : ' + [...nouvelles].map(n => "'" + n + "'").join(', ') : ''));
}
