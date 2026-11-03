#!/usr/bin/env node
// ============================================================
// E-VISIOCAM — pages fixes du Guide libertin, lisibles par Google
// Lancé par outils/build-cloudflare.sh après la copie du site dans _site :
//   node outils/generer-guide.js _site
// Lit /api/guide/export (lieux publiés, soirées à venir) et écrit :
//   /club-libertin/                          → toutes les régions et villes
//   /club-libertin/<region>/                 → une région (si elle a au moins un lieu vérifié)
//   /club-libertin/<ville>/                  → une ville (si elle a au moins un lieu vérifié)
//   /club-libertin/<ville>/<lieu>/           → la fiche d'un lieu vérifié (le site la complète ensuite en direct)
// et ajoute ces adresses au sitemap. Si l'API ne répond pas, le site est publié sans ces pages (pas d'échec).
// ============================================================
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(process.argv[2] || '_site');
const API = process.env.GUIDE_API || 'https://api.e-visiocam.com/api/guide/export';
const DOMAINE = 'https://www.e-visiocam.com';
const RACINE = 'club-libertin';

const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'lieu';
const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const TYPES = { club: 'club', sauna: 'sauna', soiree: 'soirée privée', autre: 'lieu' };
const PUBLICS = { couples: 'Couples', femmes: 'Femmes seules', hommes: 'Hommes seuls', trans: 'Trans' };
const ICONES = { club: 'fa-champagne-glasses', sauna: 'fa-hot-tub-person', soiree: 'fa-masks-theater', autre: 'fa-location-dot' };
const heureFr = h => (h ? h.replace(':', 'h') : '');
const prixFr = n => (n == null || n === '' ? '' : n === 0 ? 'offert' : String(n).replace('.', ',') + ' €');
const dateLongue = d => new Date(d + 'T12:00:00Z').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const dateCourte = d => new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(d) ? '' : 'Z')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
function liste(noms) { return noms.length < 2 ? noms.join('') : noms.slice(0, -1).join(', ') + ' et ' + noms[noms.length - 1]; }
function pluriel(n, un, plusieurs) { return n + ' ' + (n > 1 ? plusieurs : un); }
function paragraphes(t) { return String(t || '').split(/\n+/).map(x => x.trim()).filter(Boolean).map(x => '<p>' + esc(x) + '</p>').join(''); }
function texteCourt(t, n) { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; }

// ---------- Gabarits : les pages du site lui-même (en-tête, menu, pied de page, styles) ----------
function lireGabarit(nom) {
    const f = path.join(SITE, nom);
    if (!fs.existsSync(f)) throw new Error(nom + ' introuvable dans ' + SITE);
    return fs.readFileSync(f, 'utf8');
}
function habiller(gabarit, o) {
    let h = gabarit;
    // Les pages sont dans des sous-dossiers : tous les liens relatifs du gabarit partent de la racine du site
    h = h.replace(/<head>/i, '<head>\n    <base href="/">');
    h = h.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + esc(o.titre) + '</title>');
    h = h.replace(/<meta name="description"[^>]*>/i, '<meta name="description" content="' + esc(o.description) + '"/>');
    h = h.replace(/<link rel="canonical"[^>]*>/i, '<link rel="canonical" href="' + DOMAINE + o.chemin + '">');
    h = h.replace(/<meta property="og:[^>]*>\s*/gi, '');
    h = h.replace(/<link rel="canonical"[^>]*>/i, m => m + '\n    <meta property="og:type" content="website">\n    <meta property="og:title" content="' + esc(o.titre) + '">\n    <meta property="og:description" content="' + esc(o.description) + '">\n    <meta property="og:url" content="' + DOMAINE + o.chemin + '">');
    if (o.ld) h = h.replace(/<\/head>/i, '    <script type="application/ld+json">' + JSON.stringify(o.ld).replace(/</g, '\\u003c') + '</script>\n</head>');
    if (o.main) h = h.replace(/<main[\s\S]*?<\/main>/i, o.main);
    if (o.sansScriptGuide) {
        h = h.replace(/\s*<script src="pages\/guide\.js[^"]*"><\/script>/i, '');
        h = h.replace(/\s*<link rel="stylesheet" href="https:\/\/cdnjs[^"]*leaflet[^>]*>/i, '').replace(/\s*<script src="https:\/\/cdnjs[^"]*leaflet[^>]*><\/script>/i, '');
    }
    return h;
}
function ecrire(chemin, html) {
    const dossier = path.join(SITE, chemin);
    fs.mkdirSync(dossier, { recursive: true });
    fs.writeFileSync(path.join(dossier, 'index.html'), html);
}

// ---------- Morceaux de page ----------
function urlFiche(l) { return l.url || 'lieu.html?l=' + encodeURIComponent(l.slug); }
function carteLieu(l, avecRegion) {
    const badges = (l.types || [l.type]).map(t => '<span class="gl-mini gl-mini-' + t + '">' + esc(({ club: 'Club', sauna: 'Sauna', soiree: 'Soirées' })[t] || 'Lieu') + '</span>').join('') +
        (l.verifie ? '<span class="gl-mini gl-verifie"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Vérifiée</span>' : '');
    return '<a class="gl-lieu" href="' + esc(urlFiche(l)) + '"><span class="gl-lieu-ico" aria-hidden="true"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '"></i></span>' +
        '<span class="gl-lieu-txt"><b>' + esc(l.nom) + '</b><span class="gl-lieu-ville"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + esc(l.ville) + (avecRegion ? ' · ' + esc(l.regionNom) : '') + '</span>' +
        '<span class="gl-lieu-badges">' + badges + '</span>' + (l.equipementsCourt ? '<small>' + esc(l.equipementsCourt) + '</small>' : '') + '</span>' +
        '<span class="gl-lieu-note">' + (l.nbAvis ? '<b>' + String(l.note).replace('.', ',') + '</b><small>' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</span></a>';
}
function carteSoiree(s, lieuxParId) {
    const d = new Date(s.date + 'T12:00:00Z');
    const l = lieuxParId.get(s.lieu.id);
    return '<article class="gl-soiree"><div class="gl-soiree-date" aria-hidden="true"><small>' + d.toLocaleDateString('fr-FR', { weekday: 'short', timeZone: 'UTC' }) + '</small><b>' + d.getUTCDate() + '</b><small>' + d.toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }) + '</small></div>' +
        '<div class="gl-soiree-txt"><h3>' + esc(s.titre) + (s.recurrenceLibelle ? ' <span class="gl-mini gl-recurrence">' + esc(s.recurrenceLibelle) + '</span>' : '') + '</h3>' +
        '<p class="gl-soiree-infos"><span>' + esc(dateLongue(s.date)) + (s.debut ? ', ' + heureFr(s.debut) + (s.fin ? ' – ' + heureFr(s.fin) : '') : '') + '</span>' +
        '<a href="' + esc(l ? urlFiche(l) : 'lieu.html?l=' + encodeURIComponent(s.lieu.slug)) + '">' + esc(s.lieu.nom) + ' · ' + esc(s.lieu.ville) + '</a>' + (s.prix ? '<span class="gl-soiree-prix">' + esc(s.prix) + '</span>' : '') + '</p>' +
        (s.description ? '<div class="gl-soiree-desc"><p>' + esc(texteCourt(s.description, 220)) + '</p></div>' : '') + '</div></article>';
}
function evenementLd(s, l) {
    const ev = { '@type': 'Event', name: s.titre, startDate: s.date + (s.debut ? 'T' + s.debut : ''), eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: { '@type': 'Place', name: s.lieu.nom, address: { '@type': 'PostalAddress', streetAddress: s.lieu.adresse || undefined, addressLocality: s.lieu.ville, addressCountry: 'FR' } },
        url: DOMAINE + (l && l.url ? l.url : '/lieu.html?l=' + encodeURIComponent(s.lieu.slug)) };
    if (s.description) ev.description = texteCourt(s.description, 300);
    if (s.visuel) ev.image = 'https://api.e-visiocam.com' + s.visuel;
    return ev;
}
function ariane(elements) {
    const items = elements.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: e[0], item: DOMAINE + e[1] }));
    return {
        html: '<nav class="gl-ariane" aria-label="Fil d\'Ariane">' + elements.map((e, i) => i === elements.length - 1 ? '<span>' + esc(e[0]) + '</span>' : '<a href="' + esc(e[1].replace(/^\//, '')) + '">' + esc(e[0]) + '</a>').join(' › ') + '</nav>',
        ld: { '@type': 'BreadcrumbList', itemListElement: items }
    };
}
function horairesHTML(l) {
    const pl = l.planning || [];
    if (!pl.length) return l.horaires ? '<section class="gl-horaires"><h2>Horaires</h2>' + paragraphes(l.horaires) + '</section>' : '';
    // Jours consécutifs aux créneaux identiques regroupés (« Du lundi au jeudi »)
    const groupes = [];
    for (let d = 1; d <= 7; d++) {
        const cr = pl.filter(c => c.jours.includes(d)).sort((a, b) => (a.debut || '').localeCompare(b.debut || ''));
        const cle = JSON.stringify(cr.map(c => Object.assign({}, c, { jours: 0 })));
        const der = groupes[groupes.length - 1];
        if (der && der.cle === cle && der.jours[der.jours.length - 1] === d - 1) der.jours.push(d); else groupes.push({ jours: [d], cr, cle });
    }
    const BOISSON_OFFERTE = /(boisson|conso|verre|soft|coupe|champagne|ap[eé]ritif)[^.·]*offert|offert[^.·]*(boisson|conso|verre|coupe|champagne)/i;
    const SYMBOLES = { Hommes: ['♂', 'h'], Femmes: ['♀', 'f'], Couples: ['⚤', 'c'], Trans: ['⚧', 't'] };
    const maj = t => t.replace(/^./, c => c.toUpperCase());
    const nomJours = j => j.length === 1 ? maj(JOURS[j[0]]) : j.length === 2 ? maj(JOURS[j[0]]) + ' et ' + JOURS[j[1]] : 'Du ' + JOURS[j[0]] + ' au ' + JOURS[j[j.length - 1]];
    const jours = groupes.filter(g => g.cr.length).map(g => '<div class="gl-jour"><h3>' + nomJours(g.jours) + '</h3>' + g.cr.map(c => {
        const p = c.prix || {}, prix = [['Hommes', p.hommes], ['Femmes', p.femmes], ['Couples', p.couples], ['Trans', p.trans]].filter(x => x[1] != null && x[1] !== '');
        return '<div class="gl-cr"><div class="gl-cr-tete">' + (c.debut ? '<span class="gl-h">' + heureFr(c.debut) + (c.fin ? ' – ' + heureFr(c.fin) : '') + '</span>' : '') + (c.espace ? '<span class="gl-espace">' + esc(c.espace) + '</span>' : '') + '</div>' +
            (c.titre ? '<strong class="gl-cr-titre">' + esc(c.titre) + '</strong>' : '') + (c.public ? '<p class="gl-cr-public">' + esc(c.public) + '</p>' : '') +
            (prix.length ? '<ul class="gl-prix">' + prix.map(x => '<li title="' + x[0] + '"><span class="gl-sym gl-sym-' + SYMBOLES[x[0]][1] + '" aria-hidden="true">' + SYMBOLES[x[0]][0] + '</span><span class="gl-sr">' + x[0] + '</span> <b>' + prixFr(x[1]) + '</b></li>').join('') + '</ul>' : '') +
            (c.note ? '<div class="gl-cr-note"><p>' + (BOISSON_OFFERTE.test(c.note) ? '🥂 ' : '') + esc(c.note) + '</p></div>' : '') + '</div>';
    }).join('') + '</div>');
    const fermes = groupes.filter(g => !g.cr.length).reduce((a, g) => a.concat(g.jours), []);
    return '<section class="gl-horaires"><div class="gl-horaires-tete"><h2>Horaires et tarifs</h2></div><div class="gl-jours-grille">' + jours.join('') + '</div>' + (fermes.length ? '<p class="gl-ferme">Fermé le ' + fermes.map(d => JOURS[d]).join(', ') + '.</p>' : '') +
        (l.tarifs ? '<div class="gl-tarifs-note"><h3>Tarifs et consommations</h3>' + paragraphes(l.tarifs) + '</div>' : '') + '</section>';
}

// ---------- Pages ----------
function pageFiche(gab, l, soirees, lieuxParId, regionUrl, villeUrl) {
    const chemin = l.url;
    const types = (l.types || [l.type]).map(t => TYPES[t] || 'lieu');
    const titre = l.nom + ' : ' + liste(types) + ' libertin à ' + l.ville + ' — horaires, tarifs, avis | E-VISIOCAM';
    const desc = texteCourt(l.nom + ', ' + liste(types) + ' libertin à ' + l.ville + ' (' + l.regionNom + '). ' + (l.description ? l.description + ' ' : '') + 'Horaires, tarifs, avis des membres et prochaines soirées.', 158);
    const ar = ariane([['Guide libertin', '/guide.html'], [l.regionNom, regionUrl], [l.ville, villeUrl], [l.nom, chemin]]);
    const infos = [['Adresse', l.adresse], ['Téléphone', l.telephone], ['Équipements', l.equipements], ['Tenue', l.tenue]].filter(x => x[1]).map(x => '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>').join('') +
        (l.email ? '<dt>E-mail</dt><dd><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a></dd>' : '') + (l.site ? '<dt>Site</dt><dd><a href="' + esc(l.site) + '" rel="noopener nofollow ugc" target="_blank">' + esc(l.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a></dd>' : '');
    const pubs = (l.publics || []).map(p => '<span class="gl-tag">' + PUBLICS[p] + '</span>').join('') + (l.precisionPublic ? '<span class="gl-tag">' + esc(l.precisionPublic) + '</span>' : '');
    const avis = (l.avis || []).map(a => '<article class="gl-avis"><div class="gl-avis-tete"><span><b>' + esc(a.auteur) + '</b></span><span>Avis du ' + esc(dateCourte(a.date)) + '</span></div>' +
        '<div class="gl-avis-titre">' + a.note + '/5' + (a.titre ? ' <b>' + esc(a.titre) + '</b>' : '') + '</div><p>' + esc(a.texte) + '</p>' +
        (a.reponse ? '<div class="gl-reponse"><b>Réponse de l\'établissement</b><p>' + esc(a.reponse.texte) + '</p></div>' : '') + '</article>').join('');
    const mesSoirees = soirees.filter(s => s.lieu.id === l.id);
    const main = '<main class="gl max-w-[1400px] w-full mx-auto flex-1 p-3 md:p-6">' + ar.html +
        '<div id="glFiche" class="gl-fiche" data-slug="' + esc(l.slug) + '"><div class="gl-fiche-grille"><div class="gl-fiche-principal">' +
        '<div class="gl-fiche-tete"><div><span class="gl-type">' + esc(l.typeLibelle) + '</span><h1>' + esc(l.nom) + '</h1><p class="gl-ville">' + esc(l.ville) + ' · ' + esc(l.regionNom) + '</p><div class="gl-tags">' + pubs + '</div></div>' +
        '<div class="gl-note-bloc">' + (l.nbAvis ? '<b>' + String(l.note).replace('.', ',') + '</b><small>sur 5 · ' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</div></div>' +
        (l.description ? '<div class="gl-description">' + paragraphes(l.description) + '</div>' : '') + horairesHTML(l) +
        '<section class="gl-agenda-fiche"><h2>Prochaines soirées</h2><div class="gl-agenda">' + (mesSoirees.length ? mesSoirees.map(s => carteSoiree(s, lieuxParId)).join('') : '<p class="gl-vide-plan">Aucune soirée annoncée pour le moment.</p>') + '</div></section>' +
        '<section class="gl-avis-bloc"><h2>Avis des membres</h2>' + (avis || '<p class="gl-vide">Soyez le premier à donner votre avis sur ce lieu.</p>') + '</section></div>' +
        '<aside class="gl-fiche-cote"><section class="gl-encart"><h2>Infos pratiques</h2><dl>' + (infos || '<dt></dt><dd>Infos à compléter.</dd>') + '</dl>' +
        (l.verifieLe ? '<p>Fiche vérifiée par l\'équipe le ' + esc(dateCourte(l.verifieLe)) + '.</p>' : '') + '</section>' +
        '<section class="gl-encart"><h2>Autour de ' + esc(l.ville) + '</h2><p><a class="gl-lien" href="' + esc(villeUrl.replace(/^\//, '')) + '">Tous les lieux libertins à ' + esc(l.ville) + ' →</a></p><p><a class="gl-lien" href="' + esc(regionUrl.replace(/^\//, '')) + '">Le guide ' + esc(l.regionNom) + ' →</a></p></section>' +
        (l.salon ? '<a class="gl-btn gl-large" href="chat.html?theme=' + encodeURIComponent(l.salon) + '">Discuter dans le salon ' + esc(l.regionNom) + '</a>' : '') + '</aside></div></div></main>';
    const lieuLd = { '@type': (l.types || []).includes('club') ? 'NightClub' : 'LocalBusiness', name: l.nom, url: DOMAINE + chemin,
        address: { '@type': 'PostalAddress', streetAddress: l.adresse || undefined, addressLocality: l.ville, addressRegion: l.regionNom, addressCountry: 'FR' } };
    if (l.telephone) lieuLd.telephone = l.telephone;
    if (l.email) lieuLd.email = l.email;
    if (l.lat != null) lieuLd.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
    if (l.nbAvis) lieuLd.aggregateRating = { '@type': 'AggregateRating', ratingValue: l.note, reviewCount: l.nbAvis, bestRating: 5, worstRating: 1 };
    const ld = { '@context': 'https://schema.org', '@graph': [lieuLd, ar.ld].concat(mesSoirees.slice(0, 10).map(s => evenementLd(s, l))) };
    return { chemin, html: habiller(gab.fiche, { titre, description: desc, chemin, main, ld }) };
}

function pageListe(gab, o) {
    const main = '<main class="gl max-w-[1400px] w-full mx-auto flex-1 p-3 md:p-6">' + o.ariane.html +
        '<div class="gl-tete"><div><p class="gl-sur">Guide libertin</p><h1>' + esc(o.h1) + '</h1>' + o.intro + '</div>' +
        '<div class="gl-tete-actions"><a class="gl-btn gl-btn-jaune" href="' + esc(o.carte) + '"><i class="fa-regular fa-map" aria-hidden="true"></i> Voir sur la carte</a></div></div>' +
        (o.soirees ? '<section class="gl-liste-bloc gl-agenda-bloc"><div class="gl-liste-tete"><h2>Prochaines soirées</h2></div><div class="gl-agenda gl-agenda-grille">' + o.soirees + '</div></section>' : '') +
        o.blocs + '<p class="gl-legal">Site réservé aux majeurs. Fiches relues par la modération ; les avis portent sur les établissements, jamais sur des personnes. Les informations sont données à titre indicatif : vérifiez auprès de l\'établissement avant de vous déplacer.</p></main>';
    return habiller(gab.liste, { titre: o.titre, description: o.description, chemin: o.chemin, main, ld: o.ld, sansScriptGuide: true });
}

// ---------- Programme ----------
async function principal() {
    let d;
    try {
        const r = await fetch(API, { signal: AbortSignal.timeout(30000) });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        d = await r.json();
    } catch (e) {
        console.warn('generer-guide : API indisponible (' + e.message + ') — site publié sans les pages fixes du guide.');
        return;
    }
    const gab = { fiche: lireGabarit('lieu.html'), liste: lireGabarit('guide.html') };
    const lieux = d.lieux || [], soirees = d.soirees || [];
    const lieuxParId = new Map(lieux.map(l => [l.id, l]));
    const regions = new Map((d.regions || []).map(r => [r.slug, r]));
    const verifies = lieux.filter(l => l.url);
    const urls = [];

    // Villes et régions qui ont au moins un lieu vérifié
    const villes = new Map();
    for (const l of lieux) {
        const k = l.villeSlug || slug(l.ville);
        if (!villes.has(k)) villes.set(k, { slug: k, noms: {}, region: l.region, lieux: [] });
        const v = villes.get(k); v.lieux.push(l); v.noms[l.ville] = (v.noms[l.ville] || 0) + 1;
    }
    for (const v of villes.values()) {
        v.nom = Object.entries(v.noms).sort((a, b) => b[1] - a[1] || /[-éè]/.test(b[0]) - /[-éè]/.test(a[0]))[0][0];
        v.verifies = v.lieux.filter(l => l.url);
        v.lieux.sort((a, b) => (b.url ? 1 : 0) - (a.url ? 1 : 0) || (b.nbAvis - a.nbAvis) || a.nom.localeCompare(b.nom));
        v.chemin = '/' + RACINE + '/' + v.slug + '/';
    }
    const villesOk = [...villes.values()].filter(v => v.verifies.length);
    const regionsOk = [...new Set(villesOk.map(v => v.region))].map(s => regions.get(s)).filter(Boolean);
    const cheminRegion = s => '/' + RACINE + '/' + s + '/';
    // Une ville ne doit pas porter le même nom de dossier qu'une région
    for (const v of villesOk) if (regions.has(v.slug)) { v.slug = v.slug + '-ville'; v.chemin = '/' + RACINE + '/' + v.slug + '/'; }
    const villeDe = l => villes.get(l.villeSlug || slug(l.ville));

    // Fiches des lieux vérifiés
    for (const l of verifies) {
        const v = villeDe(l);
        const p = pageFiche(gab, l, soirees, lieuxParId, cheminRegion(l.region), v.chemin);
        ecrire(p.chemin, p.html); urls.push(p.chemin);
    }

    // Pages des villes
    for (const v of villesOk) {
        const r = regions.get(v.region) || { nom: v.region, slug: v.region };
        const n = v.lieux.length, parType = t => v.lieux.filter(l => (l.types || [l.type]).includes(t)).length;
        const clubs = parType('club'), saunas = parType('sauna');
        const FORMES = { 'Club': ['club', 'clubs'], 'Sauna': ['sauna', 'saunas'], 'Club et sauna': ['club avec sauna', 'clubs avec sauna'], 'Soirée privée': ['soirée privée', 'soirées privées'] };
        const comptes = {}; v.lieux.forEach(l => { comptes[l.typeLibelle] = (comptes[l.typeLibelle] || 0) + 1; });
        const detail = Object.entries(comptes).sort((a, b) => b[1] - a[1]).map(([t, k]) => pluriel(k, (FORMES[t] || [t.toLowerCase()])[0], (FORMES[t] || [0, t.toLowerCase() + 's'])[1]));
        const sesSoirees = soirees.filter(s => v.lieux.some(l => l.id === s.lieu.id));
        const ouvertsSamedi = v.lieux.filter(l => (l.jours || []).includes(6)).map(l => l.nom);
        const notes = v.lieux.filter(l => l.nbAvis);
        const intro = '<p class="gl-intro">' + esc('À ' + v.nom + ', le guide recense ' + pluriel(n, 'lieu libertin', 'lieux libertins') +
            (detail.length ? ' (' + liste(detail) + ')' : '') +
            ' : ' + liste(v.lieux.slice(0, 6).map(l => l.nom)) + (n > 6 ? '…' : '.') + ' ' +
            (v.verifies.length ? pluriel(v.verifies.length, 'fiche a été vérifiée', 'fiches ont été vérifiées') + ' par l\'équipe. ' : '') +
            (ouvertsSamedi.length ? 'Ouverts le samedi : ' + liste(ouvertsSamedi.slice(0, 5)) + '. ' : '') +
            (sesSoirees.length ? 'Prochaine soirée : « ' + sesSoirees[0].titre + ' » au ' + sesSoirees[0].lieu.nom + ', ' + dateLongue(sesSoirees[0].date) + '. ' : '') +
            (notes.length ? 'Les membres ont laissé ' + pluriel(notes.reduce((a, l) => a + l.nbAvis, 0), 'avis', 'avis') + ' sur les lieux de la ville.' : '')) + '</p>';
        const autres = villesOk.filter(x => x.region === v.region && x !== v);
        const ar = ariane([['Guide libertin', '/guide.html'], [r.nom, cheminRegion(r.slug)], [v.nom, v.chemin]]);
        const titreTypes = saunas && clubs ? 'Clubs et saunas libertins' : saunas ? 'Saunas libertins' : 'Clubs libertins';
        const html = pageListe(gab, {
            chemin: v.chemin, h1: titreTypes + ' à ' + v.nom,
            titre: titreTypes + ' à ' + v.nom + ' : ' + pluriel(n, 'adresse', 'adresses') + ', horaires et soirées | E-VISIOCAM',
            description: texteCourt(titreTypes + ' à ' + v.nom + ' (' + r.nom + ') : ' + liste(v.lieux.slice(0, 4).map(l => l.nom)) + '. Horaires, tarifs, avis des membres et prochaines soirées libertines.', 158),
            intro, ariane: ar, carte: 'guide.html?region=' + encodeURIComponent(v.region),
            soirees: sesSoirees.slice(0, 12).map(s => carteSoiree(s, lieuxParId)).join(''),
            blocs: '<section class="gl-liste-bloc gl-eq-bloc"><div class="gl-liste-tete"><h2>Les lieux à ' + esc(v.nom) + '</h2></div><div class="gl-liste">' + v.lieux.map(l => carteLieu(l)).join('') + '</div></section>' +
                (autres.length ? '<section class="gl-liste-bloc gl-eq-bloc"><div class="gl-liste-tete"><h2>Ailleurs en ' + esc(r.nom) + '</h2></div><p class="gl-villes">' + autres.map(x => '<a class="gl-tag" href="' + esc(x.chemin.replace(/^\//, '')) + '">' + esc(x.nom) + '</a>').join(' ') + '</p></section>' : '') +
                (r.salon ? '<p><a class="gl-btn" href="chat.html?theme=' + encodeURIComponent(r.salon) + '">Discuter dans le salon ' + esc(r.nom) + '</a></p>' : ''),
            ld: { '@context': 'https://schema.org', '@graph': [ar.ld, { '@type': 'ItemList', itemListElement: v.lieux.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.nom, url: DOMAINE + (l.url || '/lieu.html?l=' + encodeURIComponent(l.slug)) })) }]
                .concat(sesSoirees.slice(0, 10).map(s => evenementLd(s, lieuxParId.get(s.lieu.id)))) }
        });
        ecrire(v.chemin, html); urls.push(v.chemin);
    }

    // Pages des régions
    for (const r of regionsOk) {
        const vs = villesOk.filter(v => v.region === r.slug).sort((a, b) => b.lieux.length - a.lieux.length);
        const tous = lieux.filter(l => l.region === r.slug);
        const ver = tous.filter(l => l.url);
        const sesSoirees = soirees.filter(s => tous.some(l => l.id === s.lieu.id));
        const ch = cheminRegion(r.slug);
        const ar = ariane([['Guide libertin', '/guide.html'], [r.nom, ch]]);
        const intro = '<p class="gl-intro">' + esc('En ' + r.nom + ', le guide recense ' + pluriel(tous.length, 'lieu libertin', 'lieux libertins') + ', dont ' + pluriel(ver.length, 'fiche vérifiée', 'fiches vérifiées') + ' par l\'équipe. ' +
            'Villes : ' + liste(vs.map(v => v.nom)) + '. ' + (sesSoirees.length ? pluriel(sesSoirees.length, 'soirée est annoncée', 'soirées sont annoncées') + ' dans les semaines à venir.' : '')) + '</p>';
        const html = pageListe(gab, {
            chemin: ch, h1: 'Clubs et saunas libertins en ' + r.nom,
            titre: 'Club libertin ' + r.nom + ' : clubs, saunas et soirées | E-VISIOCAM',
            description: texteCourt('Clubs, saunas et soirées libertines en ' + r.nom + ' : ' + liste(vs.slice(0, 5).map(v => v.nom)) + '. Fiches vérifiées, horaires, tarifs, avis des membres.', 158),
            intro, ariane: ar, carte: 'guide.html?region=' + encodeURIComponent(r.slug),
            soirees: sesSoirees.slice(0, 12).map(s => carteSoiree(s, lieuxParId)).join(''),
            blocs: '<section class="gl-liste-bloc gl-eq-bloc"><div class="gl-liste-tete"><h2>Par ville</h2></div><p class="gl-villes">' + vs.map(v => '<a class="gl-tag" href="' + esc(v.chemin.replace(/^\//, '')) + '">' + esc(v.nom) + ' (' + v.lieux.length + ')</a>').join(' ') + '</p></section>' +
                '<section class="gl-liste-bloc gl-eq-bloc"><div class="gl-liste-tete"><h2>Fiches vérifiées</h2></div><div class="gl-liste">' + ver.map(l => carteLieu(l)).join('') + '</div></section>' +
                (r.salon ? '<p><a class="gl-btn" href="chat.html?theme=' + encodeURIComponent(r.salon) + '">Discuter dans le salon ' + esc(r.nom) + '</a></p>' : ''),
            ld: { '@context': 'https://schema.org', '@graph': [ar.ld].concat(sesSoirees.slice(0, 10).map(s => evenementLd(s, lieuxParId.get(s.lieu.id)))) }
        });
        ecrire(ch, html); urls.push(ch);
    }

    // Page d'accueil des pages fixes : toutes les régions et villes
    if (regionsOk.length) {
        const ch = '/' + RACINE + '/';
        const ar = ariane([['Guide libertin', '/guide.html'], ['Toutes les villes', ch]]);
        const html = pageListe(gab, {
            chemin: ch, h1: 'Clubs et saunas libertins en France, ville par ville',
            titre: 'Clubs et saunas libertins en France : toutes les villes | E-VISIOCAM',
            description: 'Clubs libertins, saunas et soirées en France, région par région et ville par ville : fiches vérifiées, horaires, tarifs et avis des membres.',
            intro: '<p class="gl-intro">' + esc(pluriel(verifies.length, 'fiche vérifiée', 'fiches vérifiées') + ' dans ' + pluriel(villesOk.length, 'ville', 'villes') + ', et de nouvelles chaque semaine.') + '</p>',
            ariane: ar, carte: 'guide.html',
            blocs: regionsOk.map(r => '<section class="gl-liste-bloc gl-eq-bloc"><div class="gl-liste-tete"><h2><a href="' + esc(cheminRegion(r.slug).replace(/^\//, '')) + '">' + esc(r.nom) + '</a></h2></div><p class="gl-villes">' +
                villesOk.filter(v => v.region === r.slug).map(v => '<a class="gl-tag" href="' + esc(v.chemin.replace(/^\//, '')) + '">' + esc(v.nom) + '</a>').join(' ') + '</p></section>').join(''),
            ld: { '@context': 'https://schema.org', '@graph': [ar.ld] }
        });
        ecrire(ch, html); urls.unshift(ch);
    }

    // Sitemap
    const sm = path.join(SITE, 'sitemap.xml');
    if (fs.existsSync(sm) && urls.length) {
        const jour = new Date().toISOString().slice(0, 10);
        const ajout = urls.map(u => '  <url><loc>' + DOMAINE + u + '</loc><lastmod>' + jour + '</lastmod></url>').join('\n');
        fs.writeFileSync(sm, fs.readFileSync(sm, 'utf8').replace('</urlset>', ajout + '\n</urlset>'));
    }
    console.log('generer-guide : ' + verifies.length + ' fiche(s), ' + villesOk.length + ' ville(s), ' + regionsOk.length + ' région(s) — ' + urls.length + ' page(s) ajoutée(s) au sitemap.');
}

principal().catch(e => { console.warn('generer-guide : erreur (' + e.message + ') — site publié sans les pages fixes du guide.'); });
