#!/usr/bin/env node
// ============================================================
// E-VISIOCAM - Vérification du chantier CSP (retrait de 'unsafe-inline' dans script-src)
// ------------------------------------------------------------
// Lancer depuis la racine du site :   node outils/verif-csp.cjs
//
// Liste, page par page, tout ce qui a encore besoin de 'unsafe-inline' :
//   - blocs <script> sans src (hors JSON-LD, qui n'est pas exécuté)
//   - attributs onclick=, onsubmit=… dans le HTML
//   - liens javascript:
// puis, dans les fichiers .js, les on…= écrits dans des chaînes HTML, eval, new Function,
// setTimeout('code').
//
// Vérifie aussi que chaque data-click / data-submit… vise une fonction autorisée dans actions.js
// et que les pages qui en utilisent chargent bien actions.js.
//
// Code de sortie 1 si une page « stricte » (sans 'unsafe-inline' dans script-src) contient
// encore du code inline, ou si une action n'est pas autorisée : le navigateur la bloquerait.
// ============================================================
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const racine = path.resolve(__dirname, '..');
const EVENEMENTS = ['click', 'submit', 'input', 'change'];

const lire = f => fs.readFileSync(path.join(racine, f), 'utf8');
const ligneDe = (texte, index) => texte.slice(0, index).split('\n').length;

// Fonctions autorisées : le contenu de new Set([...]) dans actions.js
const autorisees = new Set(
    (lire('actions.js').match(/AUTORISEES = new Set\(\[([\s\S]*?)\]\)/) || [, ''])[1]
        .match(/'[^']+'/g)?.map(s => s.slice(1, -1)) || []
);

function analyserHtml(fichier) {
    const html = lire(fichier);
    const meta = (html.match(/<meta\b[^>]*Content-Security-Policy[^>]*>/i) || [])[0];
    const csp = meta ? (meta.match(/\bcontent="([^"]*)"/i) || [])[1] || null : null;
    const scriptSrc = csp ? (csp.match(/script-src([^;]*)/) || [, ''])[1] : null;
    const stricte = !!scriptSrc && !scriptSrc.includes("'unsafe-inline'");
    const problemes = [];

    for (const m of html.matchAll(/<script\b([^>]*)>/gi)) {
        const attrs = m[1];
        if (/\bsrc\s*=/.test(attrs) || /application\/ld\+json/i.test(attrs)) continue;
        problemes.push({ ligne: ligneDe(html, m.index), type: 'script inline' });
    }
    for (const m of html.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/gi)) {
        problemes.push({ ligne: ligneDe(html, m.index), type: m[1] + '=' });
    }
    for (const m of html.matchAll(/(?:href|src|action)\s*=\s*["']\s*javascript:/gi)) {
        problemes.push({ ligne: ligneDe(html, m.index), type: 'javascript:' });
    }

    const actions = [];
    for (const type of EVENEMENTS) {
        for (const m of html.matchAll(new RegExp('\\sdata-' + type + '="([^"]*)"', 'g'))) {
            actions.push({ ligne: ligneDe(html, m.index), nom: m[1] });
        }
    }
    const chargeActions = /<script\b[^>]*\bsrc="actions\.js[?"]/.test(html);
    return { fichier, csp: !!csp, stricte, problemes, actions, chargeActions };
}

function analyserJs(fichier) {
    const js = lire(fichier);
    const problemes = [];
    const motifs = [
        // onclick="…" écrit dans une chaîne (pas el.onclick = …, qui est autorisé)
        [/(?<![.\w$])(on[a-z]+)\s*=\s*\\?["']/gi, m => m[1] + '= (dans du HTML généré)'],
        [/["'`]\s*javascript:/gi, () => 'javascript:'],
        [/\beval\s*\(/g, () => 'eval('],
        [/\bnew\s+Function\s*\(/g, () => 'new Function('],
        [/\bset(?:Timeout|Interval)\s*\(\s*["'`]/g, () => 'setTimeout(chaîne)'],
    ];
    for (const [re, nom] of motifs) {
        for (const m of js.matchAll(re)) problemes.push({ ligne: ligneDe(js, m.index), type: nom(m) });
    }
    const actions = [];
    for (const type of EVENEMENTS) {
        for (const m of js.matchAll(new RegExp('data-' + type + '=\\\\?["\']([A-Za-z_$][\\w$]*)', 'g'))) {
            actions.push({ ligne: ligneDe(js, m.index), nom: m[1] });
        }
    }
    return { fichier, problemes, actions };
}

const fichiers = fs.readdirSync(racine);
const pages = fichiers.filter(f => f.endsWith('.html')).sort().map(analyserHtml);
const scriptsPages = fs.existsSync(path.join(racine, 'pages'))
    ? fs.readdirSync(path.join(racine, 'pages')).filter(f => f.endsWith('.js')).map(f => 'pages/' + f) : [];
const scripts = fichiers.filter(f => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'actions.js')
    .concat(scriptsPages).sort().map(analyserJs);

let erreurs = 0;
const detail = process.argv.includes('--detail');

console.log('\n=== Pages HTML ===');
console.log('page'.padEnd(30) + 'CSP'.padEnd(10) + 'reste');
for (const p of pages) {
    const etat = !p.csp ? 'AUCUNE' : p.stricte ? 'stricte' : 'inline';
    const resume = {};
    for (const x of p.problemes) resume[x.type.endsWith('=') ? 'on…=' : x.type] = (resume[x.type.endsWith('=') ? 'on…=' : x.type] || 0) + 1;
    const texte = Object.entries(resume).map(([k, v]) => v + ' ' + k).join(', ') || 'OK';
    console.log(p.fichier.padEnd(30) + etat.padEnd(10) + texte);
    if (p.stricte && p.problemes.length) {
        erreurs++;
        console.log('   ✖ page stricte avec du code inline (bloqué par le navigateur) :');
        for (const x of p.problemes) console.log('     ligne ' + x.ligne + ' : ' + x.type);
    } else if (detail) {
        for (const x of p.problemes) console.log('     ligne ' + x.ligne + ' : ' + x.type);
    }
    if (p.actions.length && !p.chargeActions) {
        erreurs++;
        console.log('   ✖ utilise data-click/data-submit… mais ne charge pas actions.js');
    }
}

console.log('\n=== Fichiers JS ===');
for (const s of scripts) {
    if (!s.problemes.length) continue;
    console.log(s.fichier.padEnd(30) + s.problemes.length + ' à traiter');
    if (detail) for (const x of s.problemes) console.log('     ligne ' + x.ligne + ' : ' + x.type);
}

console.log('\n=== Actions (data-click…) ===');
const inconnues = [...pages, ...scripts].flatMap(f => f.actions.filter(a => !autorisees.has(a.nom)).map(a => ({ ...a, fichier: f.fichier })));
for (const a of inconnues) {
    erreurs++;
    console.log('   ✖ ' + a.fichier + ' ligne ' + a.ligne + ' : « ' + a.nom + ' » absente de la liste AUTORISEES (actions.js)');
}
if (!inconnues.length) console.log('OK (' + autorisees.size + ' fonctions autorisées)');

const strictes = pages.filter(p => p.stricte).length;
const restant = pages.reduce((n, p) => n + p.problemes.length, 0) + scripts.reduce((n, s) => n + s.problemes.length, 0);
console.log('\nBilan : ' + strictes + '/' + pages.length + ' pages strictes, ' + restant + ' éléments inline restants.');
if (erreurs) {
    console.log(erreurs + ' erreur(s) bloquante(s).');
    process.exit(1);
}
