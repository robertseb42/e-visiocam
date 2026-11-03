// ============================================================
// E-VISIOCAM — Guide libertin (guide.html et lieu.html). API : /api/guide
// guide.html?region=bretagne&type=club : carte + liste ; lieu.html?l=<slug> : fiche, avis, bons plans
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var surFiche = !!$('glFiche');
    var REGIONS = [], etat = { region: '', type: '', public: '', q: '' }, carte = null, calque = null, lieuCourant = null;
    var TUILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';   // OpenStreetMap : gratuit, sans clé (assombri en CSS)
    var ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';
    var ICONES = { club: 'fa-champagne-glasses', sauna: 'fa-hot-tub-person', soiree: 'fa-masks-theater', autre: 'fa-location-dot' };
    // Centre de chaque région (quand elle n'a pas encore de lieu placé sur la carte)
    var CENTRES = { 'auvergne-rhone-alpes': [45.45, 4.6], 'bourgogne-franche-comte': [47.2, 5.0], 'bretagne': [48.1, -2.9], 'centre-val-de-loire': [47.5, 1.7],
        'corse': [42.15, 9.1], 'grand-est': [48.7, 5.6], 'hauts-de-france': [50.0, 2.8], 'ile-de-france': [48.75, 2.5], 'normandie': [49.1, 0.1],
        'nouvelle-aquitaine': [45.2, 0.2], 'occitanie': [43.7, 2.2], 'pays-de-la-loire': [47.4, -0.8], 'provence-alpes-cote-d-azur': [43.95, 6.1], 'outre-mer': [14.6, -61.0] };
    // Pastilles de prix : symboles au lieu des mots (le mot reste lu par les lecteurs d'écran et au survol)
    var BOISSON_OFFERTE = /(boisson|conso|verre|soft|coupe|champagne|ap[eé]ritif)[^.·]*offert|offert[^.·]*(boisson|conso|verre|coupe|champagne)/i;   // « une boisson soft offerte » → petites coupes devant la précision
    // Lien vers une fiche : toujours la fiche dynamique (à jour tout de suite). Les pages /club-libertin/… sont
    // publiées pour Google après la republication automatique : y renvoyer trop tôt donnait une page introuvable.
    function lienFiche(l) { return '/lieu.html?l=' + encodeURIComponent(l.slug); }
    var SYMBOLES = { Hommes: ['♂', 'h'], Femmes: ['♀', 'f'], Couples: ['⚤', 'c'], Trans: ['⚧', 't'] };
    var PUBLICS = { couples: 'Couples', femmes: 'Femmes seules', hommes: 'Hommes seuls' };

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function connecte() { return typeof getCurrentUser === 'function' && !!getCurrentUser(); }
    function equipe() { var u = connecte() && getCurrentUser(); return !!u && (u.role === 'moderator' || u.role === 'super_admin'); }
    function toast(t, type) { if (typeof showToast === 'function') showToast(t, type || 'info'); else alert(t); }
    function versConnexion() { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search); }
    async function api(chemin, options) {
        if (typeof apiCall === 'function') return apiCall('/guide' + chemin, options);
        var r = await fetch(API_URL + '/guide' + chemin, options); var d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erreur'); return d;
    }
    function dateFr(d) { return new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(d) ? '' : 'Z')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    function moisFr(v) { if (!/^\d{4}-\d{2}$/.test(v || '')) return ''; var p = v.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
    function etoiles(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="fa-' + (n >= i - 0.25 ? 'solid' : 'regular') + ' fa-star" aria-hidden="true"></i>'; return '<span class="gl-note-etoiles" aria-label="' + (n == null ? 'pas de note' : String(n).replace('.', ',') + ' sur 5') + '">' + s + '</span>'; }
    function note(n) { return n == null ? '—' : String(n).replace('.', ','); }

    // ---------- Fenêtres ----------
    function ouvrir(id) { var f = $(id); f.hidden = false; var e = f.querySelector('.gl-erreur'); if (e) e.hidden = true; var c = f.querySelector('input:not([type=checkbox]),select,textarea'); if (c) c.focus(); }
    function fermer(f) { f.hidden = true; }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fermer]'); if (b) fermer(b.closest('.gl-fond'));
        // Clic sur le fond sombre = fermer, mais seulement si le clic a COMMENCÉ sur le fond :
        // une sélection de texte faite en glissant hors de la fenêtre ne doit pas la fermer (et perdre la saisie)
        if (e.target.classList && e.target.classList.contains('gl-fond') && fondAppuye === e.target) fermer(e.target);
        fondAppuye = null;
    });
    var fondAppuye = null;
    document.addEventListener('mousedown', function (e) { fondAppuye = e.target.classList && e.target.classList.contains('gl-fond') ? e.target : null; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.gl-fond:not([hidden])').forEach(fermer); });
    function erreur(form, msg) { var e = form.querySelector('.gl-erreur'); e.textContent = msg; e.hidden = false; }
    function remplirRegions(defaut) {
        document.querySelectorAll('select[data-regions]').forEach(function (s) {
            s.innerHTML = '<option value="">Choisir…</option>' + REGIONS.map(function (r) { return '<option value="' + r.slug + '"' + (r.slug === defaut ? ' selected' : '') + '>' + esc(r.nom) + '</option>'; }).join('');
        });
    }

    // Étoiles cliquables (formulaire d'avis)
    document.querySelectorAll('.gl-etoiles').forEach(function (z) {
        var nom = z.getAttribute('data-note');
        z.innerHTML = '<input type="hidden" name="' + nom + '" value="">' + [1, 2, 3, 4, 5].map(function (i) {
            return '<button type="button" data-v="' + i + '" aria-label="' + i + ' sur 5" aria-pressed="false"><i class="fa-regular fa-star" aria-hidden="true"></i></button>';
        }).join('');
        z.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-v]'); if (!b) return;
            var v = +b.getAttribute('data-v');
            z.querySelector('input').value = v;
            z.querySelectorAll('button').forEach(function (x) {
                var on = +x.getAttribute('data-v') <= v;
                x.setAttribute('aria-pressed', String(+x.getAttribute('data-v') === v));
                x.firstChild.className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-star';
            });
        });
    });

    // ============================================================
    // HORAIRES ET TARIFS (planning par créneaux)
    // Un créneau : { jours:[1..7] (1 = lundi), espace, debut, fin, titre, public, prix:{hommes,femmes,couples}, note }
    // ============================================================
    var JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
    var JOURS_COURTS = ['', 'L', 'M', 'M', 'J', 'V', 'S', 'D'];
    function maj1(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
    function jourDuJour() { var d = new Date().getDay(); return d === 0 ? 7 : d; }
    function heureFr(h) { return h ? h.replace(':', 'h') : ''; }
    function minutes(h) { if (!h) return null; var p = h.split(':'); return +p[0] * 60 + +p[1]; }
    function prixFr(n) { return n == null ? '' : (n === 0 ? 'gratuit' : String(n).replace('.', ',') + ' €'); }

    // ---- Éditeur (formulaire « Proposer / modifier un lieu ») ----
    function creneauHTML(c) {
        c = c || { jours: [], prix: {} }; var p = c.prix || {};
        var j = ''; for (var i = 1; i <= 7; i++) j += '<button type="button" data-jour="' + i + '" aria-pressed="' + ((c.jours || []).indexOf(i) >= 0) + '" aria-label="' + JOURS[i] + '">' + JOURS_COURTS[i] + '</button>';
        function champ(k, lib, v, attrs) { return '<label class="gl-champ"><span>' + lib + '</span><input data-k="' + k + '" value="' + esc(v == null ? '' : v) + '" ' + (attrs || '') + '></label>'; }
        return '<div class="gl-creneau">' +
            '<div class="gl-creneau-tete"><b>Créneau</b><span><button type="button" class="gl-lien-btn" data-creneau-copie>Dupliquer</button><button type="button" class="gl-lien-btn gl-gris" data-creneau-suppr>Supprimer</button></span></div>' +
            '<div class="gl-jours" role="group" aria-label="Jours du créneau">' + j + '</div>' +
            '<div class="gl-trois">' + champ('espace', 'Espace', c.espace, 'maxlength="40" list="glEspaces" placeholder="Sauna, discothèque…"') +
            champ('debut', 'De', c.debut, 'type="time"') + champ('fin', 'À', c.fin, 'type="time"') + '</div>' +
            '<div class="gl-deux">' + champ('titre', 'Soirée / thème (facultatif)', c.titre, 'maxlength="80" placeholder="ex. Soirée à thème avec repas"') +
            champ('public', 'Public accepté (facultatif)', c.public, 'maxlength="120" placeholder="ex. femmes et couples uniquement"') + '</div>' +
            '<div class="gl-quatre">' + champ('hommes', 'Hommes (€)', p.hommes, 'inputmode="decimal" maxlength="7"') +
            champ('femmes', 'Femmes (€)', p.femmes, 'inputmode="decimal" maxlength="7"') + champ('couples', 'Couples (€)', p.couples, 'inputmode="decimal" maxlength="7"') +
            champ('trans', 'Trans (€)', p.trans, 'inputmode="decimal" maxlength="7"') + '</div>' +
            champ('note', 'Précision (facultatif)', c.note, 'maxlength="200" placeholder="ex. avec une consommation, repas compris…"') +
            '</div>';
    }
    function remplirPlanning(form, planning) {
        var z = form.querySelector('[data-planning]'); if (!z) return;
        z.innerHTML = (planning && planning.length ? planning : [null]).map(creneauHTML).join('');
    }
    function lirePlanningForm(form) {
        return [].slice.call(form.querySelectorAll('.gl-creneau')).map(function (b) {
            var v = function (k) { var i = b.querySelector('[data-k="' + k + '"]'); return i ? i.value.trim() : ''; };
            return {
                jours: [].slice.call(b.querySelectorAll('[data-jour][aria-pressed="true"]')).map(function (x) { return +x.getAttribute('data-jour'); }),
                espace: v('espace'), debut: v('debut'), fin: v('fin'), titre: v('titre'), public: v('public'), note: v('note'),
                prix: { hommes: v('hommes').replace(',', '.'), femmes: v('femmes').replace(',', '.'), couples: v('couples').replace(',', '.'), trans: v('trans').replace(',', '.') }
            };
        }).filter(function (c) { return c.jours.length && (c.debut || c.titre); });
    }
    document.addEventListener('click', function (e) {
        var j = e.target.closest('.gl-jours [data-jour]');
        if (j) { j.setAttribute('aria-pressed', String(j.getAttribute('aria-pressed') !== 'true')); return; }
        var a = e.target.closest('[data-creneau-ajout]');
        if (a) { var z = a.closest('form').querySelector('[data-planning]'); z.insertAdjacentHTML('beforeend', creneauHTML()); z.lastElementChild.querySelector('[data-jour]').focus(); return; }
        var c = e.target.closest('[data-creneau-copie]');
        if (c) {
            var b = c.closest('.gl-creneau'), n = b.cloneNode(true);
            b.querySelectorAll('input').forEach(function (i, k) { n.querySelectorAll('input')[k].value = i.value; });
            n.querySelectorAll('[data-jour]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
            b.after(n); n.querySelector('[data-jour]').focus(); return;
        }
        var s = e.target.closest('[data-creneau-suppr]');
        if (s) { var bl = s.closest('.gl-creneau'), zz = bl.parentNode; bl.remove(); if (!zz.children.length) zz.insertAdjacentHTML('beforeend', creneauHTML()); }
    });

    // ---- Mise en forme des textes longs saisis par les membres ----
    // TEXTE TOUT EN MAJUSCULES → texte normal (plus lisible)
    function adoucir(t) {
        t = String(t || '');
        var lettres = t.replace(/[^A-Za-zÀ-ÿ]/g, '');
        if (lettres.length >= 12 && lettres === lettres.toUpperCase()) {
            return t.toLowerCase().replace(/(^\s*|[.!?:]\s+)([a-zà-ÿ])/g, function (m, a, b) { return a + b.toUpperCase(); });
        }
        // Passages de 4 mots ou plus en majuscules au milieu d'une phrase
        return t.replace(/(?:(?<!\p{L})\p{Lu}[\p{Lu}'’]+(?!\p{L})[\s,;:'’]*){4,}/gu, function (m) { return m.toLowerCase(); });
    }
    // Lignes vides → paragraphes ; liste « Nom : 10 € » → tableau de prix lisible
    var LIGNE_PRIX = /^(.+?)\s*(?::|—|-|…|\.{2,})?\s*(\d[\d\s.,]*\s*€|gratuit|offert)\s*\.?$/i;
    function paragraphes(t, liste) {
        var lignes = String(t || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean);
        var prix = lignes.filter(function (x) { return LIGNE_PRIX.test(x); }).length;
        if (liste && prix >= 3 && prix >= lignes.length * 0.6) {
            var tab = [], autres = [];
            lignes.forEach(function (x) { var m = x.match(LIGNE_PRIX); if (m) tab.push('<div><dt>' + esc(m[1].replace(/\s*:$/, '')) + '</dt><dd>' + esc(m[2].replace(/\s+€/, ' €')) + '</dd></div>'); else autres.push('<p>' + esc(x) + '</p>'); });
            return '<dl class="gl-tarifs-liste">' + tab.join('') + '</dl>' + autres.join('');
        }
        return lignes.map(function (x) { return '<p>' + esc(x) + '</p>'; }).join('');
    }
    function texteRepliable(t, classe, max) {
        var long = String(t).length > max;
        return '<div class="' + classe + (long ? ' gl-replie' : '') + '">' + paragraphes(t) + '</div>' + (long ? '<button type="button" class="gl-lien-btn gl-plus" data-plus aria-expanded="false">Lire la suite</button>' : '');
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-plus]'); if (!b) return;
        var z = b.previousElementSibling, ouvert = z.classList.toggle('gl-replie') === false;
        b.setAttribute('aria-expanded', String(ouvert)); b.textContent = ouvert ? 'Réduire' : 'Lire la suite';
    });

    // ---- Affichage (fiche) ----
    function groupesPlanning(planning) {
        var parJour = [];
        for (var d = 1; d <= 7; d++) {
            var l = planning.filter(function (c) { return c.jours.indexOf(d) >= 0; })
                .sort(function (a, b) { return (minutes(a.debut) || 0) - (minutes(b.debut) || 0); });
            parJour.push({ jour: d, liste: l, cle: JSON.stringify(l.map(function (c) { var x = Object.assign({}, c); delete x.jours; return x; })) });
        }
        var g = [];
        parJour.forEach(function (p) {
            var der = g[g.length - 1];
            if (der && der.cle === p.cle && der.jours[der.jours.length - 1] === p.jour - 1) der.jours.push(p.jour);
            else g.push({ jours: [p.jour], liste: p.liste, cle: p.cle });
        });
        return g;
    }
    function libelleJours(j) {
        if (j.length === 1) return maj1(JOURS[j[0]]);
        if (j.length === 2) return maj1(JOURS[j[0]]) + ' et ' + JOURS[j[1]];
        return 'Du ' + JOURS[j[0]] + ' au ' + JOURS[j[j.length - 1]];
    }
    function etatOuverture(planning) {
        var now = new Date(), m = now.getHours() * 60 + now.getMinutes(), auj = jourDuJour(), hier = auj === 1 ? 7 : auj - 1;
        var enCours = null;
        planning.forEach(function (c) {
            var d = minutes(c.debut), f = minutes(c.fin);
            if (d == null) return;
            var nuit = f != null && f <= d;
            if (c.jours.indexOf(auj) >= 0 && m >= d && (f == null || nuit || m < f)) enCours = c;
            if (nuit && c.jours.indexOf(hier) >= 0 && m < f) enCours = c;
        });
        var aujourdhui = planning.filter(function (c) { return c.jours.indexOf(auj) >= 0 && c.debut; })
            .sort(function (a, b) { return minutes(a.debut) - minutes(b.debut); });
        if (enCours) return '<p class="gl-statut gl-statut-ouvert"><i class="fa-solid fa-circle" aria-hidden="true"></i> Ouvert en ce moment' + (enCours.fin ? ' · jusqu\'à ' + heureFr(enCours.fin) : '') + (enCours.espace ? ' (' + esc(enCours.espace.toLowerCase()) + ')' : '') + '</p>';
        if (aujourdhui.length) return '<p class="gl-statut"><i class="fa-regular fa-clock" aria-hidden="true"></i> Aujourd\'hui : ' + aujourdhui.map(function (c) { return heureFr(c.debut) + (c.fin ? '–' + heureFr(c.fin) : '') + (c.espace ? ' ' + esc(c.espace.toLowerCase()) : ''); }).join(', ') + '</p>';
        return '<p class="gl-statut gl-statut-ferme"><i class="fa-regular fa-clock" aria-hidden="true"></i> Fermé aujourd\'hui</p>';
    }
    function planningHTML(l) {
        var pl = l.planning || [];
        if (!pl.length) return '';
        var auj = jourDuJour();
        var groupes = groupesPlanning(pl);
        var fermes = groupes.filter(function (g) { return !g.liste.length; }).reduce(function (a, g) { return a.concat(g.jours); }, []);
        var html = groupes.filter(function (g) { return g.liste.length; }).map(function (g) {
            var estAuj = g.jours.indexOf(auj) >= 0;
            return '<div class="gl-jour' + (estAuj ? ' gl-jour-auj' : '') + '"><h3>' + libelleJours(g.jours) + (estAuj ? ' <span>Aujourd\'hui</span>' : '') + '</h3>' +
                g.liste.map(function (c) {
                    var p = c.prix || {}, prix = [['Hommes', p.hommes], ['Femmes', p.femmes], ['Couples', p.couples], ['Trans', p.trans]].filter(function (x) { return x[1] != null && x[1] !== ''; });
                    return '<div class="gl-cr"><div class="gl-cr-tete">' + (c.debut ? '<span class="gl-h">' + heureFr(c.debut) + (c.fin ? ' – ' + heureFr(c.fin) : '') + '</span>' : '') + (c.espace ? '<span class="gl-espace">' + esc(c.espace) + '</span>' : '') + '</div>' +
                        (c.titre ? '<strong class="gl-cr-titre">' + esc(adoucir(c.titre)) + '</strong>' : '') +
                        (c.public ? '<p class="gl-cr-public"><i class="fa-solid fa-user-group" aria-hidden="true"></i> ' + esc(adoucir(c.public).replace(/\s*,\s*/g, ', ')) + '</p>' : '') +
                        (prix.length ? '<ul class="gl-prix">' + prix.map(function (x) { return '<li title="' + x[0] + '"><span class="gl-sym gl-sym-' + SYMBOLES[x[0]][1] + '" aria-hidden="true">' + SYMBOLES[x[0]][0] + '</span><span class="gl-sr">' + x[0] + '</span> <b>' + prixFr(x[1]) + '</b></li>'; }).join('') + '</ul>' : '') +
                        (c.note ? texteRepliable((BOISSON_OFFERTE.test(c.note) ? '🥂 ' : '') + adoucir(c.note), 'gl-cr-note', 170) : '') + '</div>';
                }).join('') + '</div>';
        }).join('');
        return '<section class="gl-horaires" aria-labelledby="glHorTitre"><div class="gl-horaires-tete"><h2 id="glHorTitre">Horaires et tarifs</h2>' + etatOuverture(pl) + '</div>' +
            '<div class="gl-jours-grille">' + html + '</div>' +
            (fermes.length ? '<p class="gl-ferme">Fermé le ' + fermes.map(function (d) { return JOURS[d]; }).join(', ') + '.</p>' : '') +
            (l.tarifs ? '<div class="gl-tarifs-note"><h3><i class="fa-solid fa-champagne-glasses" aria-hidden="true"></i> Tarifs et consommations</h3>' + paragraphes(l.tarifs, true) + '</div>' : '') +
            '<p class="gl-maj">Infos données à titre indicatif' + (l.verifieLe && /^\d{4}-\d{2}-\d{2}/.test(l.verifieLe) ? ', vérifiées le ' + esc(dateFr(l.verifieLe)) : l.majLe ? ', mises à jour le ' + esc(dateFr(l.majLe)) : '') + '. Vérifiez auprès de l\'établissement avant de vous déplacer.</p></section>';
    }

    // Boutons « Y aller » : ouvrent le GPS du téléphone (Google Maps, Waze, Plans d'Apple) sur l'adresse du lieu
    function itineraire(l) {
        var pos = l.lat != null ? l.lat + ',' + l.lng : '';
        var adr = [l.adresse, l.ville].filter(Boolean).join(', ');
        if (!pos && !adr) return '';
        var q = encodeURIComponent(pos || adr + ', France');
        var liens = [
            ['Google Maps', 'fa-brands fa-google', 'https://www.google.com/maps/dir/?api=1&destination=' + q],
            ['Waze', 'fa-brands fa-waze', pos ? 'https://waze.com/ul?ll=' + q + '&navigate=yes' : 'https://waze.com/ul?q=' + q + '&navigate=yes'],
            ['Plans (iPhone)', 'fa-brands fa-apple', 'https://maps.apple.com/?daddr=' + q]
        ];
        return '<div class="gl-gps"><b><i class="fa-solid fa-route" aria-hidden="true"></i> Y aller</b><div>' + liens.map(function (x) {
            return '<a class="gl-btn" href="' + x[2] + '" target="_blank" rel="noopener"><i class="' + x[1] + '" aria-hidden="true"></i> ' + x[0] + '</a>';
        }).join('') + '</div></div>';
    }

    // ---- Habitués du lieu : membres qui se déclarent clients (visible des seuls membres connectés) ----
    function habituesHTML(h) {
        h = h || { nombre: 0, moi: false };
        return '<section class="gl-encart gl-habitues" id="glHabitues"><h2><i class="fa-solid fa-user-group" aria-hidden="true"></i> Les habitués <span id="glHabNb">' + (h.nombre ? '(' + h.nombre + ')' : '') + '</span></h2>' +
            '<p>Vous fréquentez ce lieu ? Déclarez-vous client pour échanger avec les autres habitués.</p>' +
            '<button type="button" class="gl-btn ' + (h.moi ? '' : 'gl-btn-jaune') + '" id="glHabBouton" aria-pressed="' + h.moi + '">' + (h.moi ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Je suis client · me retirer' : 'Je suis client de ce lieu') + '</button>' +
            '<div id="glHabListe" class="gl-hab-liste">' + (connecte() ? '' : '<p class="gl-vide-plan"><a class="gl-lien" href="login.html">Connectez-vous</a> pour voir qui fréquente ce lieu.</p>') + '</div>' +
            '<small class="gl-aide">Votre pseudo n\'est visible que des membres connectés. Vous pouvez vous retirer à tout moment.</small></section>';
    }
    async function chargerHabitues(lieu) {
        var z = $('glHabListe'); if (!z || !connecte()) return;
        try {
            var d = await api('/lieux/' + lieu.id + '/habitues');
            z.innerHTML = d.membres.length ? '<ul>' + d.membres.map(function (m) {
                var av = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
                return '<li><a class="gl-hab-membre" href="membre.html?u=' + encodeURIComponent(m.pseudo) + '">' +
                    (av ? '<img src="' + esc(av) + '" alt="" loading="lazy">' : '<span class="gl-hab-init" aria-hidden="true">' + esc(m.pseudo.charAt(0).toUpperCase()) + '</span>') +
                    '<b>' + esc(m.pseudo) + (m.moi ? ' (vous)' : '') + '</b></a>' +
                    (m.moi ? '' : '<a class="gl-hab-ecrire" href="messages.html?ecrire=' + m.id + '" aria-label="Écrire à ' + esc(m.pseudo) + '"><i class="fa-solid fa-envelope" aria-hidden="true"></i></a>') + '</li>';
            }).join('') + '</ul>' : '<p class="gl-vide-plan">Personne ne s\'est encore déclaré client. Soyez le premier !</p>';
        } catch (x) { z.innerHTML = ''; }
    }
    function brancherHabitues(lieu, h) {
        var b = $('glHabBouton'); if (!b) return;
        var moi = !!(h && h.moi);
        chargerHabitues(lieu);
        b.addEventListener('click', async function () {
            if (!connecte()) return versConnexion();
            b.disabled = true;
            try {
                var r = await api('/lieux/' + lieu.id + '/habitue', { method: moi ? 'DELETE' : 'POST' });
                moi = !moi;
                b.setAttribute('aria-pressed', String(moi));
                b.className = 'gl-btn' + (moi ? '' : ' gl-btn-jaune');
                b.innerHTML = moi ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Je suis client · me retirer' : 'Je suis client de ce lieu';
                $('glHabNb').textContent = r.nombre ? '(' + r.nombre + ')' : '';
                toast(moi ? 'Vous apparaissez dans la liste des habitués.' : 'Vous n\'apparaissez plus dans la liste.', 'success');
                chargerHabitues(lieu);
            } catch (x) { toast(x.message, 'error'); }
            b.disabled = false;
        });
    }

    // ============================================================
    // AGENDA DES SOIRÉES (fiche d'un lieu + page du guide)
    // ============================================================
    var MOIS_C = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var JOURS_C = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
    function urlApi(chemin) { return chemin ? String(API_URL).replace(/\/api\/?$/, '') + chemin : ''; }
    // Image choisie → JPEG réduit (1400 px max, ~650 Ko max) prêt à envoyer
    function reduireImage(fichier) {
        return new Promise(function (ok, ko) {
            if (!fichier || !/^image\/(jpeg|png|webp)$/.test(fichier.type)) return ko(new Error('Choisissez une image JPG, PNG ou WebP.'));
            var url = URL.createObjectURL(fichier), img = new Image();
            img.onload = function () {
                var k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
                c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                if (c.width < 200 || c.height < 200) { URL.revokeObjectURL(url); return ko(new Error('Image trop petite (200 × 200 px minimum).')); }
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                var q = 0.86, d = c.toDataURL('image/jpeg', q);
                while (d.length > 880000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
                ok(d);
            };
            img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); };
            img.src = url;
        });
    }
    function soireeHTML(s, avecLieu) {
        var d = new Date(s.date + 'T12:00:00');
        return '<article class="gl-soiree"><div class="gl-soiree-date" aria-hidden="true"><small>' + JOURS_C[d.getDay()] + '</small><b>' + d.getDate() + '</b><small>' + MOIS_C[d.getMonth()] + '</small></div>' +
            '<div class="gl-soiree-txt"><h3>' + esc(adoucir(s.titre)) + (s.recurrenceLibelle ? ' <span class="gl-mini gl-recurrence"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ' + esc(s.recurrenceLibelle) + '</span>' : '') + '</h3>' +
            '<p class="gl-soiree-infos"><span class="gl-sr">' + esc(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })) + ' · </span>' +
            (s.debut ? '<span><i class="fa-regular fa-clock" aria-hidden="true"></i> ' + heureFr(s.debut) + (s.fin ? ' – ' + heureFr(s.fin) : '') + '</span>' : '') +
            (avecLieu ? '<a href="lieu.html?l=' + encodeURIComponent(s.lieu.slug) + '"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + esc(s.lieu.nom) + ' · ' + esc(s.lieu.ville) + '</a>' : '') +
            (s.prix ? '<span class="gl-soiree-prix">' + esc(s.prix) + '</span>' : '') + '</p>' +
            (s.description ? texteRepliable(adoucir(s.description), 'gl-soiree-desc', 160) : '') +
            (equipe() ? '<div class="gl-soiree-equipe"><label class="gl-lien-btn gl-gris">' + (s.visuel ? 'Changer le visuel' : 'Ajouter le visuel') + '<input type="file" accept="image/jpeg,image/png,image/webp" class="gl-sr" data-visuel-soiree="' + s.id + '"></label><button type="button" class="gl-lien-btn gl-rouge" data-suppr-soiree="' + s.id + '">Retirer de l\'agenda</button></div>' : '') + '</div>' +
            (s.visuel ? '<a class="gl-soiree-visuel" href="' + esc(urlApi(s.visuel)) + '" target="_blank" rel="noopener"><img src="' + esc(urlApi(s.visuel)) + '" alt="Affiche : ' + esc(s.titre) + '" loading="lazy"></a>' : '') + '</article>';
    }
    // Bandeau d'affiches en haut de la page du guide : les prochaines soirées de la région (ou de France)
    async function chargerBandeau(r) {
        var sec = $('glBandeau');
        if (!sec) {
            document.querySelector('.gl-filtres').insertAdjacentHTML('beforebegin', '<section id="glBandeau" class="gl-bandeau" aria-labelledby="glBandeauTitre" hidden><div class="gl-bandeau-tete"><h2 id="glBandeauTitre"></h2><div class="gl-bandeau-fleches"><button type="button" data-defiler="-1" aria-label="Soirées précédentes"><i class="fa-solid fa-chevron-left" aria-hidden="true"></i></button><button type="button" data-defiler="1" aria-label="Soirées suivantes"><i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button></div></div><div class="gl-bandeau-piste" id="glBandeauPiste"></div></section>');
            sec = $('glBandeau');
            sec.addEventListener('click', function (e) { var b = e.target.closest('[data-defiler]'); if (!b) return; var p = $('glBandeauPiste'); p.scrollBy({ left: +b.getAttribute('data-defiler') * p.clientWidth * 0.8, behavior: 'smooth' }); });
        }
        $('glBandeauTitre').innerHTML = '<i class="fa-regular fa-calendar" aria-hidden="true"></i> Prochaines soirées ' + (r ? 'en ' + esc(r.nom) : 'en France');
        try {
            var d = await api('/soirees?' + new URLSearchParams(r ? { region: r.slug, jours: 60 } : { jours: 45 }));
            sec.hidden = !d.soirees.length;
            $('glBandeauPiste').innerHTML = d.soirees.map(function (s) {
                var dt = new Date(s.date + 'T12:00:00');
                return '<a class="gl-affiche" href="lieu.html?l=' + encodeURIComponent(s.lieu.slug) + '">' +
                    '<span class="gl-affiche-img">' + (s.visuel ? '<img src="' + esc(urlApi(s.visuel)) + '" alt="" loading="lazy">' : '<span class="gl-affiche-vide" aria-hidden="true"><i class="fa-solid fa-champagne-glasses"></i></span>') +
                    '<span class="gl-affiche-date"><small>' + JOURS_C[dt.getDay()] + '</small><b>' + dt.getDate() + '</b><small>' + MOIS_C[dt.getMonth()] + '</small></span>' +
                    (s.recurrenceLibelle ? '<span class="gl-affiche-rec"><i class="fa-solid fa-rotate" aria-hidden="true"></i> ' + esc(s.recurrenceLibelle) + '</span>' : '') + '</span>' +
                    '<span class="gl-affiche-txt"><b>' + esc(adoucir(s.titre)) + '</b><small>' + esc(s.lieu.nom) + ' · ' + esc(s.lieu.ville) + '</small>' +
                    (s.debut ? '<small class="gl-affiche-h">' + heureFr(s.debut) + (s.fin ? ' – ' + heureFr(s.fin) : '') + '</small>' : '') + '</span></a>';
            }).join('');
        } catch (e) { sec.hidden = true; }
    }

    async function chargerAgenda(zone, params, avecLieu, vide) {
        if (!zone) return [];
        try {
            var d = await api('/soirees?' + new URLSearchParams(params));
            zone.innerHTML = d.soirees.length ? d.soirees.map(function (s) { return soireeHTML(s, avecLieu); }).join('') : '<p class="gl-vide-plan">' + vide + '</p>';
            return d.soirees;
        } catch (e) { zone.innerHTML = ''; return []; }
    }
    document.addEventListener('change', async function (e) {
        var i = e.target.closest('[data-visuel-soiree]'); if (!i || !i.files[0]) return;
        try {
            var d = await reduireImage(i.files[0]);
            await api('/soirees/' + i.getAttribute('data-visuel-soiree') + '/visuel', { method: 'PUT', body: JSON.stringify({ visuel: d }) });
            toast('Visuel enregistré.', 'success');
            if (surFiche) chargerAgendaFiche(); else charger();
        } catch (x) { toast(x.message, 'error'); }
        i.value = '';
    });
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-suppr-soiree]'); if (!b) return;
        b.disabled = true;
        try { await api('/soirees/' + b.getAttribute('data-suppr-soiree'), { method: 'DELETE' }); b.closest('.gl-soiree').remove(); toast('Soirée retirée de l\'agenda.', 'success'); }
        catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });
    // Fenêtres « Proposer une soirée » et « Signaler une fermeture ou une erreur » (ajoutées à la fiche)
    function ajouterFenetresFiche() {
        if ($('glFenetreSoiree')) return;
        var auj = new Date(); var iso = function (d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
        var max = new Date(); max.setFullYear(max.getFullYear() + 1);
        document.body.insertAdjacentHTML('beforeend',
            '<div id="glFenetreSoiree" class="gl-fond" hidden><form id="glFormSoiree" class="gl-fenetre gl-petite" role="dialog" aria-modal="true" aria-labelledby="glTitreSoiree" novalidate>' +
            '<div class="gl-fenetre-tete"><h2 id="glTitreSoiree">Proposer une soirée</h2><button type="button" class="gl-fermer" data-fermer aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="gl-fenetre-corps"><p class="gl-aide">Une soirée à thème, un événement spécial… Elle apparaîtra dans l\'agenda après validation par l\'équipe.</p>' +
            '<label class="gl-champ"><span>Nom de la soirée *</span><input name="titre" maxlength="100" required placeholder="ex. Soirée masquée"></label>' +
            '<div class="gl-trois"><label class="gl-champ"><span>Date *</span><input type="date" name="date" required min="' + iso(auj) + '" max="' + iso(max) + '"></label>' +
            '<label class="gl-champ"><span>De</span><input type="time" name="debut"></label><label class="gl-champ"><span>À</span><input type="time" name="fin"></label></div>' +
            '<div class="gl-deux"><label class="gl-champ"><span>Répétition</span><select name="recurrence" data-recurrence><option value="">Une seule fois</option></select></label>' +
            '<label class="gl-champ" data-jusqu hidden><span>Jusqu\'au (facultatif)</span><input type="date" name="jusquAu" min="' + iso(auj) + '"></label></div>' +
            '<label class="gl-champ"><span>Tarifs</span><input name="prix" maxlength="200" placeholder="ex. Couples 30 €, femmes offert"></label>' +
            '<label class="gl-champ"><span>Description</span><textarea name="description" rows="4" maxlength="1000" placeholder="Thème, tenue demandée, repas…"></textarea></label>' +
            '<div class="gl-champ"><span>Visuel / affiche (facultatif)</span><label class="gl-btn gl-visuel-choisir"><i class="fa-regular fa-image" aria-hidden="true"></i> Choisir une image<input type="file" accept="image/jpeg,image/png,image/webp" class="gl-sr" data-visuel-nouveau></label><div class="gl-visuel-apercu" data-visuel-apercu hidden><img alt="Aperçu du visuel"><button type="button" class="gl-lien-btn gl-gris" data-visuel-retirer>Retirer l\'image</button></div></div>' +
            '<p class="gl-erreur" role="alert" hidden></p></div>' +
            '<div class="gl-fenetre-pied"><button type="submit" class="gl-btn gl-btn-jaune">' + (equipe() ? 'Publier dans l\'agenda' : 'Envoyer à la modération') + '</button></div></form></div>' +
            '<div id="glFenetreCorrection" class="gl-fond" hidden><form id="glFormCorrection" class="gl-fenetre gl-petite" role="dialog" aria-modal="true" aria-labelledby="glTitreCorr" novalidate>' +
            '<div class="gl-fenetre-tete"><h2 id="glTitreCorr">Signaler une fermeture ou une erreur</h2><button type="button" class="gl-fermer" data-fermer aria-label="Fermer"><i class="fa-solid fa-xmark"></i></button></div>' +
            '<div class="gl-fenetre-corps"><fieldset class="gl-champ"><legend>Que se passe-t-il ?</legend>' +
            '<label class="gl-case"><input type="radio" name="motif" value="ferme" checked> Ce lieu a fermé définitivement</label>' +
            '<label class="gl-case"><input type="radio" name="motif" value="erreur"> Une information est fausse (horaires, tarifs, adresse…)</label></fieldset>' +
            '<label class="gl-champ"><span>Précisions</span><textarea name="message" rows="4" maxlength="600" placeholder="Ce qui a changé, depuis quand…"></textarea></label>' +
            '<p class="gl-erreur" role="alert" hidden></p></div>' +
            '<div class="gl-fenetre-pied"><button type="submit" class="gl-btn gl-btn-jaune">Envoyer à l\'équipe</button></div></form></div>');
        // Options de répétition selon le jour choisi : « Tous les mercredis », « Le 2e mercredi du mois », « Le dernier mercredi du mois »
        var fs = $('glFormSoiree');
        function majRepetition() {
            var sel = fs.querySelector('[data-recurrence]'), v = sel.value, dt = fs.date.value;
            var opts = [['', 'Une seule fois']];
            if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
                var d = new Date(dt + 'T12:00:00'), j = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'][d.getDay()];
                var rang = Math.ceil(d.getDate() / 7), apres = new Date(d); apres.setDate(d.getDate() + 7);
                opts.push(['hebdo', 'Toutes les semaines (tous les ' + j + 's)']);
                if (rang <= 4) opts.push(['mensuel-' + rang, 'Tous les mois (le ' + (rang === 1 ? '1er' : rang + 'e') + ' ' + j + ')']);
                if (apres.getMonth() !== d.getMonth()) opts.push(['mensuel-dernier', 'Tous les mois (le dernier ' + j + ')']);
            }
            sel.innerHTML = opts.map(function (o) { return '<option value="' + o[0] + '">' + o[1] + '</option>'; }).join('');
            sel.value = opts.some(function (o) { return o[0] === v; }) ? v : '';
            fs.querySelector('[data-jusqu]').hidden = !sel.value;
        }
        fs.date.addEventListener('change', majRepetition);
        var visuelChoisi = '';
        fs.querySelector('[data-visuel-nouveau]').addEventListener('change', async function () {
            var ap = fs.querySelector('[data-visuel-apercu]');
            try { visuelChoisi = await reduireImage(this.files[0]); ap.querySelector('img').src = visuelChoisi; ap.hidden = false; }
            catch (x) { visuelChoisi = ''; ap.hidden = true; erreur(fs, x.message); }
            this.value = '';
        });
        fs.querySelector('[data-visuel-retirer]').addEventListener('click', function () { visuelChoisi = ''; fs.querySelector('[data-visuel-apercu]').hidden = true; });
        fs.querySelector('[data-recurrence]').addEventListener('change', majRepetition);
        $('glFormSoiree').addEventListener('submit', async function (e) {
            e.preventDefault();
            var f = this, d = Object.fromEntries(new FormData(f).entries()); d.lieuId = lieuCourant.id;
            if (!d.titre || !d.date) { erreur(f, 'Indiquez au moins le nom et la date de la soirée.'); return; }
            if (!d.recurrence) d.jusquAu = '';
            if (visuelChoisi) d.visuel = visuelChoisi;
            try { var r = await api('/soirees', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetreSoiree')); f.reset(); toast(r.message, 'success'); fs.querySelector('[data-jusqu]').hidden = true; visuelChoisi = ''; fs.querySelector('[data-visuel-apercu]').hidden = true; majRepetition(); chargerAgendaFiche(); }
            catch (x) { erreur(f, x.message); }
        });
        $('glFormCorrection').addEventListener('submit', async function (e) {
            e.preventDefault();
            var f = this, d = Object.fromEntries(new FormData(f).entries());
            try { var r = await api('/lieux/' + lieuCourant.id + '/correction', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetreCorrection')); f.reset(); toast(r.message, 'success'); }
            catch (x) { erreur(f, x.message); }
        });
    }
    function chargerAgendaFiche() {
        return chargerAgenda($('glAgendaLieu'), { lieu: lieuCourant.id, jours: 365 }, false, 'Aucune soirée annoncée pour le moment.').then(function (s) { donneesStructurees(lieuCourant, s); });
    }
    document.addEventListener('click', function (e) {
        if (e.target.closest('#glProposerSoiree')) { if (!connecte()) return versConnexion(); ouvrir('glFenetreSoiree'); }
        if (e.target.closest('#glSignalerLieu')) { if (!connecte()) return versConnexion(); ouvrir('glFenetreCorrection'); }
    });
    // Données structurées pour Google (établissement + soirées), d'après les recommandations schema.org
    function donneesStructurees(l, soirees) {
        var ancien = document.getElementById('glLd'); if (ancien) ancien.remove();
        var url = 'https://www.e-visiocam.com/lieu.html?l=' + encodeURIComponent(l.slug);
        var lieu = { '@type': l.type === 'club' ? 'NightClub' : 'LocalBusiness', name: l.nom, url: url,
            address: { '@type': 'PostalAddress', streetAddress: l.adresse || undefined, addressLocality: l.ville, addressRegion: l.regionNom, addressCountry: 'FR' } };
        if (l.telephone) lieu.telephone = l.telephone;
        if (l.lat != null) lieu.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
        if (l.nbAvis) lieu.aggregateRating = { '@type': 'AggregateRating', ratingValue: l.note, reviewCount: l.nbAvis, bestRating: 5, worstRating: 1 };
        var graphe = [Object.assign({ '@context': 'https://schema.org' }, lieu)].concat((soirees || []).slice(0, 10).map(function (s) {
            var ev = { '@context': 'https://schema.org', '@type': 'Event', name: s.titre, startDate: s.date + (s.debut ? 'T' + s.debut : ''), eventStatus: 'https://schema.org/EventScheduled',
                eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode', location: { '@type': 'Place', name: l.nom, address: lieu.address }, url: url };
            if (s.description) ev.description = s.description.slice(0, 300);
            if (s.visuel) ev.image = urlApi(s.visuel);
            return ev;
        }));
        var sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.id = 'glLd'; sc.textContent = JSON.stringify(graphe);
        document.head.appendChild(sc);
    }

    // ---- Formulaire lieu : proposer (POST) ou modifier (PUT, équipe) ----
    function ouvrirFormLieu(l) {
        var f = $('glFormLieu'); if (!f) return;
        f.reset();
        f.dataset.id = l ? l.id : '';
        $('glTitreLieu').textContent = l ? 'Modifier « ' + l.nom + ' »' : 'Proposer un lieu';
        f.querySelector('[type=submit]').textContent = l ? 'Enregistrer' : (equipe() ? 'Publier' : 'Envoyer à la modération');
        var aide = f.querySelector('.gl-aide'); if (aide) aide.textContent = l ? 'Les modifications sont visibles tout de suite sur la fiche.' : (equipe() ? 'Indiquez les informations publiques du lieu. Il sera publié tout de suite et placé sur la carte d\'après son adresse.' : 'Club, sauna ou soirée privée : indiquez les informations publiques du lieu. La fiche sera publiée après vérification par la modération.');
        remplirRegions(l ? l.region : etat.region);
        if (l) {
            ['nom', 'type', 'ville', 'adresse', 'telephone', 'email', 'equipements', 'tenue', 'site', 'description', 'tarifs'].forEach(function (k) { if (f[k]) f[k].value = l[k] || ''; });
            if (f.precisionPublic) f.precisionPublic.value = l.precisionPublic || '';
            f.querySelectorAll('input[name=publics]').forEach(function (c) { c.checked = (l.publics || []).indexOf(c.value) >= 0; });
            f.querySelectorAll('input[name=types]').forEach(function (c) { c.checked = c.value !== l.type && (l.types || []).indexOf(c.value) >= 0; });
            // Anciennes fiches : horaires en texte libre → recopiés dans « précisions » pour ne rien perdre
            if (!(l.planning || []).length && l.horaires && f.tarifs && f.tarifs.value.indexOf(l.horaires) < 0) f.tarifs.value = ('Horaires : ' + l.horaires + (f.tarifs.value ? '\n' + f.tarifs.value : '')).slice(0, 600);
        }
        remplirPlanning(f, l ? l.planning : []);
        var bv = f.querySelector('[data-equipe-seul]');
        if (bv) {
            bv.hidden = !equipe();
            if (f.verifie) f.verifie.checked = false;
            var ev = f.querySelector('[data-verif-etat]');
            if (ev) ev.textContent = l && l.verifieLe ? 'Dernière vérification : ' + dateFr(l.verifieLe) + (l.verifiePar ? ' par ' + l.verifiePar : '') + '.' : 'Cette fiche n\'a encore jamais été vérifiée par l\'équipe.';
        }
        ouvrir('glFenetreLieu');
    }

    // ============================================================
    // HORAIRES COLLÉS EN TEXTE → créneaux (le texte tel qu'il est sur le site du club ou Facebook)
    // Ex. « Mercredi, Vendredi et Samedi AM: 14h -19h » puis « Femme seule : OFFERT », « Homme seul : 50€ avec 2 consos »…
    // ============================================================
    var NOMS_JOURS = { lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5, samedi: 6, dimanche: 7 };
    var RE_PLAGE = /(\d{1,2})\s*(?:h|:)(\d{2})?\s*(?:-|–|—|à|a|jusqu'?à)\s*(\d{1,2})\s*(?:h|:)?(\d{2}(?!\d))?/i;
    function minusc(t) { return String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
    function joursDans(ligne) {
        var t = minusc(ligne), j = [];
        if (/tous les jours|7j\/7|7 jours sur 7/.test(t)) return [1, 2, 3, 4, 5, 6, 7];
        var du = t.match(/du\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+au\s+(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)/);
        if (du) { for (var d = NOMS_JOURS[du[1]]; ; d = d % 7 + 1) { j.push(d); if (d === NOMS_JOURS[du[2]]) break; } }
        Object.keys(NOMS_JOURS).forEach(function (n) { if (new RegExp('\\b' + n + 's?\\b').test(t) && j.indexOf(NOMS_JOURS[n]) < 0) j.push(NOMS_JOURS[n]); });
        return j.sort(function (a, b) { return a - b; });
    }
    function heure(h, m) { h = +h; if (h === 24) h = 0; return (h < 10 ? '0' : '') + h + ':' + (m || '00'); }
    function prixDe(t) {
        var s = minusc(t);
        var m = s.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:€|euros?|eur)/) || s.match(/^\s*(\d+(?:[.,]\d{1,2})?)\b/);
        var g = s.search(/offert|gratuit|free/);
        // « 40 euros (une boisson soft offerte) » : le prix vient avant « offert », c'est bien 40 €
        if (g >= 0 && !(m && s.indexOf(m[0]) < g)) return { prix: 0 };
        if (/pas autoris|non autoris|interdit|non admis|pas admis|refus/.test(s)) return { refuse: true };
        return m ? { prix: Number(m[1].replace(',', '.')) } : null;
    }
    function analyserHoraires(texte) {
        var blocs = [], bloc = null, joursEnAttente = null, sousPrix = null, general = [];
        var CAT = [[/^(trans(genres?)?|travestis?)\b/, 'trans', 'Trans'], [/^femmes?(\s+seules?)?\b/, 'femmes', 'Femmes'], [/^couples?\b/, 'couples', 'Couples'], [/^hommes?(\s+seuls?)?\b/, 'hommes', 'Hommes']];
        function ajouterNote(b, t) { t = t.trim(); if (!t) return; b.note = (b.note ? b.note + ' · ' : '') + t; }
        String(texte || '').split(/\r?\n/).forEach(function (brut) {
            var l = brut.trim(); if (!l) return;
            var t = minusc(l).replace(/^[-•*\s]+/, '');
            var jours = joursDans(l), plage = l.match(RE_PLAGE);
            // 1) En-tête de créneau : des jours (ou des jours mis en attente) + une plage horaire
            if ((jours.length || joursEnAttente) && plage && !CAT.some(function (c) { return c[0].test(t); })) {
                var titre = l.replace(RE_PLAGE, ' ').replace(/\*/g, ' ')
                    .replace(/\b(du|au|et|de|à|a partir|tous les jours|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)s?\b/gi, ' ')
                    .replace(/(^|\s)(am|pm|apr[eè]s[- ]midi|soir|matin|midi|journ[ée]e)(?=\s|$|[:,+])/gi, ' ')
                    .replace(/[,:+&\/–—-]/g, ' ').replace(/\s+/g, ' ').trim();
                bloc = { jours: jours.length ? jours : joursEnAttente, espace: '', debut: heure(plage[1], plage[2]), fin: heure(plage[3], plage[4]), titre: titre, public: '', note: '', prix: { hommes: '', femmes: '', couples: '', trans: '' } };
                blocs.push(bloc); joursEnAttente = null; sousPrix = null; return;
            }
            // 2) Des jours seuls (l'horaire est sur la ligne suivante)
            if (jours.length && !plage && !CAT.some(function (c) { return c[0].test(t); }) && t.length < 60) { joursEnAttente = jours; return; }
            // 3) Renvoi « * Sauf… » : précision sur le créneau précédent
            if (/^\*/.test(l)) { if (bloc) ajouterNote(bloc, l.replace(/^\*+\s*/, '')); else general.push(l.replace(/^\*+\s*/, '')); return; }
            if (!bloc) { general.push(l); return; }
            // 4) Ligne de prix : « Homme seul : 50€ avec 2 consos »
            var cat = null; CAT.forEach(function (c) { if (!cat && c[0].test(t)) cat = c; });
            if (cat) {
                var reste = l.replace(/^[-•*\s]*/, '').replace(/^[^:]*:\s*/, l.indexOf(':') >= 0 ? '' : '$&');
                if (l.indexOf(':') < 0) reste = l.replace(/^[-•*\s]*\S+(\s+seule?s?)?(\s+f\/h|\s+h\/f)?/i, '');
                var p = prixDe(reste);
                if (p && p.refuse) { bloc.prix[cat[1]] = ''; bloc.public = (bloc.public ? bloc.public + ' · ' : '') + ({ hommes: 'Hommes seuls', femmes: 'Femmes seules', couples: 'Couples', trans: 'Personnes trans' })[cat[1]] + ' non admis'; sousPrix = null; return; }
                if (p) bloc.prix[cat[1]] = p.prix;
                var detail = reste.replace(/^\s*(offert|gratuit)\s*/i, '').replace(/^\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?\s*/i, '').trim();
                if (detail) ajouterNote(bloc, cat[2] + ' : ' + detail);
                sousPrix = p ? null : cat; // pas de prix sur la ligne → les lignes « - 40€ avant 19h » suivent
                return;
            }
            // 5) Sous-lignes de prix (« - 40€ avant 19h ») ou précision libre
            if (sousPrix && /^[-•]/.test(l)) {
                var sp = prixDe(l);
                if (sp && !sp.refuse && bloc.prix[sousPrix[1]] === '') bloc.prix[sousPrix[1]] = sp.prix;
                ajouterNote(bloc, sousPrix[2] + ' : ' + l.replace(/^[-•\s]+/, ''));
                return;
            }
            ajouterNote(bloc, l);
        });
        blocs.forEach(function (b) { b.note = b.note.slice(0, 200); b.titre = b.titre.slice(0, 80); b.public = b.public.slice(0, 120); });
        return { creneaux: blocs, reste: general.join('\n') };
    }
    // Deuxième forme courante : tarifs rangés PAR PUBLIC (« Hommes seuls » puis « Après-midi : 25 € », « Soir à partir de 20h : 30 €»…)
    function analyserParPublic(texte) {
        var RUB = [[/travesti|trans\b|transgenre/, 'trans', 'Trans'], [/couples?.*(dames?|femmes?)|(dames?|femmes?).*couples?/, 'couples+femmes', ''],
            [/^(les\s+)?(dames?|femmes?)(\s+seules?)?\b/, 'femmes', ''], [/^(les\s+)?couples?\b/, 'couples', ''], [/^(les\s+)?(hommes?|messieurs)(\s+seuls?)?\b/, 'hommes', '']];
        var rubrique = null, periodes = {}, ordre = [], general = [], partout = [];
        function cle(p) { return p.jours.join('') + '|' + p.debut + '|' + p.fin + '|' + p.titre; }
        function periodeDe(t) {
            var s = minusc(t), j = joursDans(t), plage = t.match(RE_PLAGE), dep = s.match(/(?:a partir de|apres|des|des)\s*(\d{1,2})\s*h\s*(\d{2})?/);
            var titre = /apres[- ]?midi|journee|\bam\b/.test(s) ? 'Après-midi' : /soir|nuit/.test(s) ? 'Soirée' : /matin/.test(s) ? 'Matinée' : '';
            return { jours: j.length ? j : [1, 2, 3, 4, 5, 6, 7], debut: plage ? heure(plage[1], plage[2]) : dep ? heure(dep[1], dep[2]) : '', fin: plage ? heure(plage[3], plage[4]) : '', titre: titre };
        }
        function appliquer(per, prix, detail) {
            var k = cle(per);
            if (!periodes[k]) { periodes[k] = { jours: per.jours, espace: '', debut: per.debut, fin: per.fin, titre: per.titre, public: '', note: '', prix: { hommes: '', femmes: '', couples: '', trans: '' } }; ordre.push(k); }
            remplir(periodes[k], prix, detail);
        }
        function remplir(c, prix, detail) {
            var cibles = rubrique[1] === 'couples+femmes' ? ['couples', 'femmes'] : [rubrique[1]];
            if (rubrique[1] === 'autre') { c.note = (c.note ? c.note + ' · ' : '') + rubrique[2] + ' : ' + (prix && prix.prix === 0 ? 'offert' : prix ? String(prix.prix).replace('.', ',') + ' €' : detail); return; }
            cibles.forEach(function (x) { if (prix && !prix.refuse) c.prix[x] = prix.prix; });
            if (prix && prix.refuse) c.public = (c.public ? c.public + ' · ' : '') + ({ hommes: 'Hommes seuls', femmes: 'Femmes seules', couples: 'Couples', trans: 'Personnes trans' })[cibles[0]] + ' non admis';
            if (detail) c.note = (c.note ? c.note + ' · ' : '') + detail;
        }
        String(texte || '').split(/\r?\n/).forEach(function (brut) {
            var l = brut.replace(/^[\s*•·-]+/, '').trim(); if (!l) return;
            var t = minusc(l), prix = prixDe(l.indexOf(':') >= 0 ? l.slice(l.indexOf(':') + 1) : l);
            var r = null; RUB.forEach(function (x) { if (!r && x[0].test(t)) r = x; });
            if (r && !prix && l.length < 50) { rubrique = r; return; }            // titre de rubrique
            if (!rubrique || !prix || (l.indexOf(':') < 0 && l.length > 50)) { general.push(l); return; }
            var avant = l.indexOf(':') >= 0 ? l.slice(0, l.indexOf(':')) : '';
            var detail = (l.indexOf(':') >= 0 ? l.slice(l.indexOf(':') + 1) : l).replace(/^\s*(entr[ée]e\s+)?(offerte?|gratuite?)\s*/i, '').replace(/^\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?\s*/i, '').replace(/^tous les jours\.?$/i, '').trim();
            var generique = !avant || /tarif unique|tous les jours|entree|prix/.test(minusc(avant)) && !joursDans(avant).length && !/soir|midi|nuit|matin/.test(minusc(avant));
            if (generique) partout.push({ rubrique: rubrique, prix: prix, detail: detail });
            else appliquer(periodeDe(avant), prix, detail);
        });
        // Un tarif « soir » général ne s'applique pas aux jours qui ont leur propre tarif du soir
        ordre.forEach(function (k) {
            var p = periodes[k]; if (p.jours.length !== 7) return;
            ordre.forEach(function (k2) { var q = periodes[k2]; if (q !== p && q.titre === p.titre && q.jours.length < 7) p.jours = p.jours.filter(function (d) { return q.jours.indexOf(d) < 0; }); });
        });
        if (!ordre.length && partout.length) appliquer({ jours: [1, 2, 3, 4, 5, 6, 7], debut: '', fin: '', titre: 'Tous les jours' }, null, '');
        var garde = rubrique;
        partout.forEach(function (x) { rubrique = x.rubrique; ordre.forEach(function (k) { remplir(periodes[k], x.prix, ''); }); });
        rubrique = garde;
        var cr = ordre.map(function (k) { return periodes[k]; }).filter(function (c) { return c.jours.length; });
        cr.forEach(function (b) { b.note = b.note.slice(0, 200); b.public = b.public.slice(0, 120); });
        return { creneaux: cr, reste: general.join('\n') };
    }

    // Troisième forme : une rubrique « Horaires » (« lundi 12h à 18h et de 20h30 à 1h ») et des rubriques
    // « Tarifs après-midi » / « Tarifs en soirée » avec des groupes de jours (« Lundis, mardis… » puis « Vendredis, samedis »).
    // Chaque jour reçoit les heures de sa ligne et les prix de son groupe ; les jours identiques sont regroupés en un créneau.
    var RE_PLAGES = /(\d{1,2})\s*(?:h|:)?\s*(\d{2})?\s*(?:-|–|—|à|a|jusqu'?à)\s*(\d{1,2})\s*(?:h|:)?\s*(\d{2}(?!\d))?/gi;
    function periodeDeTexte(t) { t = minusc(t); return /apres[- ]?midi|journee|\bam\b|midi/.test(t) ? 'am' : /soir|nuit|\bpm\b/.test(t) ? 'soir' : ''; }
    function estGrilleTarifs(texte) {
        var t = minusc(texte);
        return /(^|\n)\s*horaires?\s*:?\s*($|\n)/.test(t) && /(^|\n)\s*tarifs?\b/.test(t);
    }
    function analyserGrilles(texte) {
        var CAT = [[/^(trans(genres?)?|travestis?)\b/, 'trans', 'Trans'], [/^(dames?|femmes?)(\s+seules?)?\b/, 'femmes', 'Femmes'], [/^couples?\b/, 'couples', 'Couples'], [/^(hommes?|messieurs)(\s+seuls?)?\b/, 'hommes', 'Hommes']];
        var TOUS = [1, 2, 3, 4, 5, 6, 7], general = [];
        var horaires = {};              // jour → [{debut, fin, per}]
        var groupes = [];               // {per, jours, prix:{}, notes:[]}
        var section = '', per = '', groupe = null, gratuits = [];
        function nouveauGroupe(jours) { groupe = { per: per, jours: jours, prix: { hommes: '', femmes: '', couples: '', trans: '' }, notes: [] }; groupes.push(groupe); return groupe; }
        String(texte || '').split(/\r?\n/).forEach(function (brut) {
            var l = brut.replace(/^[\s*•·-]+/, '').trim(); if (!l) return;
            var t = minusc(l), jours = joursDans(l);
            if (/^horaires?\b/.test(t) && l.length < 40) { section = 'horaires'; return; }
            if (/^tarifs?\b/.test(t) && l.length < 60) { section = 'tarifs'; per = periodeDeTexte(l); groupe = null; return; }
            if (section === 'horaires' && jours.length) {
                var plages = [], m; RE_PLAGES.lastIndex = 0;
                while ((m = RE_PLAGES.exec(l))) plages.push({ debut: heure(m[1], m[2]), fin: heure(m[3], m[4]) });
                plages.forEach(function (p, i) {
                    var h = +p.debut.slice(0, 2);
                    p.per = plages.length > 1 ? (i === 0 ? 'am' : 'soir') : (h >= 19 || h < 6 ? 'soir' : 'am');
                    jours.forEach(function (j) { (horaires[j] = horaires[j] || []).push(p); });
                });
                if (!plages.length) general.push(l);
                return;
            }
            if (section !== 'tarifs') { general.push(l); return; }
            var cat = null; CAT.forEach(function (c) { if (!cat && c[0].test(t)) cat = c; });
            // « Gratuit pour les Dames » : vaut pour toute la rubrique
            var g = t.match(/^(gratuit|offert|entree offerte)\s+(pour\s+)?(les\s+)?(dames?|femmes?|couples?|hommes?)/);
            if (g) { var k = /dame|femme/.test(g[4]) ? 'femmes' : /couple/.test(g[4]) ? 'couples' : 'hommes'; gratuits.push({ per: per, cat: k }); return; }
            // Ligne de jours seule : « Lundis, Mardis, … » ou « Dimanches après midi : »
            if (jours.length && !cat && !prixDe(l)) { var p2 = periodeDeTexte(l); if (p2) per = p2; nouveauGroupe(jours); return; }
            if (cat) {
                var reste = l.indexOf(':') >= 0 ? l.slice(l.indexOf(':') + 1) : l.replace(/^\S+(\s+seule?s?)?/i, '');
                var pr = prixDe(reste);
                if (!groupe) nouveauGroupe(TOUS.slice());
                if (pr && pr.refuse) groupe.notes.push(cat[2] + ' non admis');
                else if (pr) groupe.prix[cat[1]] = pr.prix;
                var detail = reste.replace(/^\s*\d+(?:[.,]\d{1,2})?\s*(?:€|euros?|eur)?\s*/i, '').replace(/^\s*\(\s*|\s*\)\s*$/g, '').trim();
                if (detail && !/^(offerte?|gratuite?)$/i.test(detail)) groupe.notes.push(cat[2] + ' : ' + detail);
                return;
            }
            general.push(l);
        });
        gratuits.forEach(function (x) { groupes.forEach(function (gr) { if (gr.per === x.per && gr.prix[x.cat] === '') gr.prix[x.cat] = 0; }); });
        function groupeDe(per, j) {
            var trouve = null;
            groupes.forEach(function (gr) { if ((gr.per === per || !gr.per) && gr.jours.indexOf(j) >= 0) trouve = gr; });
            return trouve;
        }
        // Une note commune (« une boisson soft offerte » pour tous) est dite une seule fois
        function noteDe(gr) {
            if (!gr) return '';
            var d = gr.notes.map(function (n) { return n.replace(/^[^:]+:\s*/, ''); });
            return d.length > 1 && d.every(function (x) { return x === d[0]; }) && gr.notes.length === Object.keys(gr.prix).filter(function (k) { return gr.prix[k] !== '' && gr.prix[k] !== 0; }).length ? d[0] : gr.notes.join(' · ');
        }
        var cr = {}, ordre = [];
        TOUS.forEach(function (j) {
            (horaires[j] || []).forEach(function (p) {
                var gr = groupeDe(p.per, j), note = noteDe(gr);
                var cle = p.per + '|' + p.debut + '|' + p.fin + '|' + JSON.stringify(gr ? gr.prix : {}) + '|' + note;
                if (!cr[cle]) { cr[cle] = { jours: [], espace: '', debut: p.debut, fin: p.fin, titre: p.per === 'soir' ? 'Soirée' : 'Après-midi', public: '', note: note.slice(0, 200), prix: gr ? Object.assign({}, gr.prix) : { hommes: '', femmes: '', couples: '', trans: '' } }; ordre.push(cle); }
                cr[cle].jours.push(j);
            });
        });
        var liste = ordre.map(function (k) { return cr[k]; });
        liste.sort(function (a, b) { return (a.titre === b.titre ? 0 : a.titre === 'Après-midi' ? -1 : 1) || a.jours[0] - b.jours[0]; });
        return { creneaux: liste, reste: general.filter(function (x, i) { return general.indexOf(x) === i; }).join('\n') };
    }
    // Choisit la bonne lecture selon la forme du texte
    function analyserTexteHoraires(texte) {
        var r = estGrilleTarifs(texte) ? analyserGrilles(texte) : { creneaux: [] };
        if (!r.creneaux.length) r = analyserHoraires(texte);
        if (!r.creneaux.length) r = analyserParPublic(texte);
        return r;
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-coller-go]'); if (!b) return;
        var f = b.closest('form'), zone = f.querySelector('[data-coller]'), msg = f.querySelector('[data-coller-msg]');
        var r = analyserTexteHoraires(zone.value);
        if (!r.creneaux.length) { msg.textContent = 'Rien de reconnu. Il faut soit des jours avec leurs heures (« Samedi : 21h - 5h » puis « Couple : 20 € »), soit des rubriques par public (« Hommes seuls » puis « Soir à partir de 20h : 30 € »).'; return; }
        // Les créneaux déjà saisis sont GARDÉS : les nouveaux s'ajoutent à la suite (ex. le matin d'abord, puis le soir).
        // Un créneau identique (mêmes jours, heures et titre) n'est pas ajouté deux fois.
        var avant = lirePlanningForm(f).filter(function (c) {
            var vide = !c.titre && !c.note && !c.public && ['hommes', 'femmes', 'couples', 'trans'].every(function (k) { return c.prix[k] === ''; });
            return !(vide && r.creneaux.some(function (n) { return n.debut === c.debut && n.fin === c.fin && n.jours.some(function (j) { return c.jours.indexOf(j) >= 0; }); }));
        });
        var cle = function (c) { return c.jours.join(',') + '|' + c.debut + '|' + c.fin + '|' + (c.titre || '').toLowerCase() + '|' + (c.espace || '').toLowerCase(); };
        var vus = avant.map(cle);
        var nouveaux = r.creneaux.filter(function (c) { var k = cle(c); if (vus.indexOf(k) >= 0) return false; vus.push(k); return true; });
        f._dernierCollage = r.creneaux;
        remplirPlanning(f, avant.concat(nouveaux));
        if (r.reste && f.tarifs && f.tarifs.value.indexOf(r.reste) < 0) f.tarifs.value = (f.tarifs.value ? f.tarifs.value + '\n' : '') + r.reste;
        var manque = nouveaux.some(function (c) { return !c.debut || !c.fin; }) ? ', ajoutez les heures d\'ouverture qui manquent' : '';
        msg.innerHTML = nouveaux.length + ' créneau(x) ajouté(s)' + (avant.length ? ' à la suite des ' + avant.length + ' déjà saisi(s)' : '') +
            (nouveaux.length < r.creneaux.length ? ' (' + (r.creneaux.length - nouveaux.length) + ' déjà présent(s), ignoré(s))' : '') +
            '. Vérifiez-les ci-dessous' + manque + ', puis enregistrez.' +
            (avant.length ? ' <button type="button" class="gl-lien-btn" data-coller-remplacer>Remplacer plutôt les anciens créneaux</button>' : '');
        var cible = f.querySelectorAll('.gl-creneau')[avant.length] || f.querySelector('.gl-creneau');
        if (cible) cible.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-coller-remplacer]'); if (!b) return;
        var f = b.closest('form'); if (!f._dernierCollage) return;
        remplirPlanning(f, f._dernierCollage);
        f.querySelector('[data-coller-msg]').textContent = 'Anciens créneaux remplacés par les ' + f._dernierCollage.length + ' du texte collé. Vérifiez puis enregistrez.';
        f.querySelector('.gl-creneau').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // ---------- Proposer un lieu / un bon plan ----------
    function brancherFormulaires() {
        var fl = $('glFormLieu');
        if (fl) fl.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fl).entries());
            d.publics = [].slice.call(fl.querySelectorAll('input[name=publics]:checked')).map(function (x) { return x.value; });
            d.planning = lirePlanningForm(fl);
            d.verifie = !!(fl.verifie && fl.verifie.checked && equipe());
            d.types = [].slice.call(fl.querySelectorAll('input[name=types]:checked')).map(function (x) { return x.value; });
            var id = fl.dataset.id;
            try {
                var r = await api(id ? '/lieux/' + id : '/lieux', { method: id ? 'PUT' : 'POST', body: JSON.stringify(d) });
                fermer($('glFenetreLieu')); fl.reset(); toast(id ? 'Fiche enregistrée.' : r.message, 'success');
                if (surFiche) chargerFiche(); else if ($('glEquipe')) chargerEquipe(); else if (equipe()) charger();
            }
            catch (x) { erreur(fl, x.message); }
        });
        var fp = $('glFormPlan');
        if (fp) fp.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fp).entries());
            if (lieuCourant) d.lieuId = lieuCourant.id;
            try { var r = await api('/bons-plans', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetrePlan')); fp.reset(); toast(r.message, 'success'); }
            catch (x) { erreur(fp, x.message); }
        });
        var fa = $('glFormAvis');
        if (fa) fa.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fa).entries());
            if (!d.note) { erreur(fa, 'Donnez une note générale (de 1 à 5 étoiles).'); return; }
            try { var r = await api('/lieux/' + lieuCourant.id + '/avis', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetreAvis')); toast(r.message, 'success'); chargerFiche(); }
            catch (x) { erreur(fa, x.message); }
        });
    }

    // ============================================================
    // PAGE GUIDE
    // ============================================================
    function urlEtat() {
        var p = new URLSearchParams();
        if (etat.region) p.set('region', etat.region);
        if (etat.type) p.set('type', etat.type);
        if (etat.public) p.set('public', etat.public);
        try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); } catch (e) {}
    }
    function dessinerRegions() {
        $('glRegions').innerHTML = REGIONS.map(function (r) {
            return '<button type="button" data-region="' + r.slug + '" aria-pressed="' + (r.slug === etat.region) + '" class="gl-r gl-r-' + r.slug + '"><b>' + esc(r.nom) + '</b><small>' + (r.lieux ? r.lieux + (r.lieux > 1 ? ' lieux' : ' lieu') : 'à découvrir') + '</small></button>';
        }).join('');
    }
    async function charger() {
        urlEtat();
        dessinerRegions();
        var r = REGIONS.filter(function (x) { return x.slug === etat.region; })[0];
        $('glListeTitre').textContent = r ? r.nom : 'Tous les lieux';
        var titre = r ? 'Clubs, saunas et soirées libertines en ' + r.nom : 'Clubs, saunas et soirées libertines en France';
        $('glTitre').textContent = titre;
        document.title = (r ? 'Club libertin ' + r.nom + ' : ' : 'Guide libertin : ') + 'clubs, saunas, soirées — E-VISIOCAM';
        var s = $('glSalon');
        if (r) { s.hidden = false; s.href = 'chat.html?theme=' + encodeURIComponent(r.salon); s.textContent = 'Discuter dans le salon ' + r.nom + ' →'; } else s.hidden = true;
        var liste = $('glListe');
        liste.innerHTML = '<p class="gl-vide"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
        try {
            var q = new URLSearchParams();
            ['region', 'type', 'public', 'q'].forEach(function (k) { if (etat[k]) q.set(k, etat[k]); });
            var d = await api('/lieux?' + q);
            var l = (d.lieux || []).filter(function (x) { return !etat.ouvert || (x.jours || []).indexOf(jourDuJour()) >= 0; });
            liste.innerHTML = l.length ? l.map(carteLieu).join('') :
                '<div class="gl-vide-bloc"><i class="fa-regular fa-map" aria-hidden="true"></i><p>' + (etat.q || etat.type || etat.public || etat.ouvert ? 'Aucun lieu ne correspond à ces filtres.' : 'Pas encore de lieu ' + (r ? 'en ' + esc(r.nom) : 'dans le guide') + '.') + '</p><p>Vous connaissez un club, un sauna ou une soirée ? <button type="button" class="gl-lien-btn" data-proposer>Proposez-le</button>, la communauté vous remerciera.</p></div>';
            placerSurCarte(l, r);
            chargerBandeau(r);
            var plans = d.bonsPlans || [];
            $('glPlans').hidden = !r;
            $('glPlansListe').innerHTML = plans.length ? plans.map(function (b) {
                return '<li><p>' + esc(b.texte) + '</p><small>' + (b.lieu ? '<a href="lieu.html?l=' + encodeURIComponent(b.lieu.slug) + '">' + esc(b.lieu.nom) + '</a> · ' : '') + esc(dateFr(b.date)) + '</small></li>';
            }).join('') : '<li class="gl-vide-plan">Pas encore de bon plan dans cette région.</li>';
        } catch (e) {
            liste.innerHTML = '<p class="gl-vide">Le guide ne peut pas être affiché pour le moment.</p>';
        }
    }
    function carteLieu(l) {
        var pub = (l.publics || []).map(function (p) { return PUBLICS[p]; }).filter(Boolean).join(', ');
        var NOMS_TYPES = { club: 'Club', sauna: 'Sauna', soiree: 'Soirées', autre: 'Lieu' };
        var badges = (l.types || [l.type]).map(function (t) { return '<span class="gl-mini gl-mini-' + t + '">' + (NOMS_TYPES[t] || 'Lieu') + '</span>'; }).join('') +
            ((l.jours || []).indexOf(jourDuJour()) >= 0 ? '<span class="gl-mini gl-ouvert">Ouvert aujourd\'hui</span>' : '') +
            (l.verifie ? '<span class="gl-mini gl-verifie"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Vérifiée</span>' : '');
        return '<a class="gl-lieu" href="' + lienFiche(l) + '">' +
            '<span class="gl-lieu-ico" aria-hidden="true"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '"></i></span>' +
            '<span class="gl-lieu-txt"><b>' + esc(l.nom) + '</b>' +
            '<span class="gl-lieu-ville"><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ' + esc(l.ville) + (etat.region ? '' : ' · ' + esc(l.regionNom)) + '</span>' +
            '<span class="gl-lieu-badges">' + badges + '</span>' +
            (l.equipementsCourt ? '<small>' + esc(l.equipementsCourt) + '</small>' : (pub || l.precisionPublic ? '<small>' + esc(pub) + (l.precisionPublic ? ' — ' + esc(l.precisionPublic) : '') + '</small>' : '')) + '</span>' +
            '<span class="gl-lieu-note">' + (l.nbAvis ? '<b>' + note(l.note) + '</b><small>' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</span></a>';
    }
    function initCarte() {
        if (carte || !window.L || !$('glCarte')) return;
        carte = L.map('glCarte', { scrollWheelZoom: false, attributionControl: true }).setView([46.6, 2.4], 5);
        L.tileLayer(TUILES, { attribution: ATTRIB, maxZoom: 18 }).addTo(carte);
        calque = L.layerGroup().addTo(carte);
    }
    function placerSurCarte(lieux, region) {
        initCarte();
        if (!carte) return;
        calque.clearLayers();
        var pts = [];
        var om = region && region.slug === 'outre-mer';
        lieux.forEach(function (l) {
            if (l.lat == null || l.lng == null) return;
            // Hors Outre-mer, on ne cadre que sur la France métropolitaine (Corse comprise)
            var metropole = l.lat > 41 && l.lat < 51.6 && l.lng > -5.6 && l.lng < 10;
            if (om || metropole) pts.push([l.lat, l.lng]); else if (l.region !== 'outre-mer') return;
            L.circleMarker([l.lat, l.lng], { radius: 8, color: '#111113', weight: 2, fillColor: '#ff1680', fillOpacity: 0.95 })
                .bindPopup('<b>' + esc(l.nom) + '</b><br>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + '<br><a href="' + lienFiche(l) + '">Voir la fiche</a>')
                .addTo(calque);
        });
        if (!region && !om) carte.fitBounds([[42.2, -4.9], [51.2, 8.4]], { padding: [10, 10] });
        else if (pts.length > 1) carte.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
        else if (pts.length === 1) carte.setView(pts[0], 10);
        else if (region && CENTRES[region.slug]) carte.setView(CENTRES[region.slug], region.slug === 'outre-mer' ? 3 : 7);
        else carte.setView([46.6, 2.4], 5);
        setTimeout(function () { carte.invalidateSize(); }, 50);
    }

    // ---------- Modération (équipe) ----------
    async function chargerModeration() {
        if (!equipe() || !$('glModeration')) return;
        try {
            var d = await api('/moderation');
            d.lieux.forEach(function (l) { LIEUX_EQ[l.id] = l; });
            d.soirees = d.soirees || []; d.corrections = d.corrections || [];
            var total = d.lieux.length + d.avis.length + d.bonsPlans.length + d.signales.length + d.soirees.length + d.corrections.length;
            $('glModeration').hidden = false;
            if (!total) { $('glModContenu').innerHTML = '<p class="gl-vide">Rien à valider pour le moment.</p>'; return; }
            var bloc = function (titre, items, rendu) { return items.length ? '<h3>' + titre + ' (' + items.length + ')</h3>' + items.map(rendu).join('') : ''; };
            var boutons = function (quoi, id, garder) {
                return '<div class="gl-mod-actions">' + (garder ? '<button type="button" class="gl-btn" data-mod="' + quoi + '" data-id="' + id + '" data-d="garder">Garder l\'avis</button><button type="button" class="gl-btn gl-btn-rouge" data-mod="' + quoi + '" data-id="' + id + '" data-d="refuser">Retirer l\'avis</button>'
                    : '<button type="button" class="gl-btn gl-btn-jaune" data-mod="' + quoi + '" data-id="' + id + '" data-d="publier">Publier</button><button type="button" class="gl-btn gl-btn-rouge" data-mod="' + quoi + '" data-id="' + id + '" data-d="refuser">Refuser</button>') + '</div>';
            };
            $('glModContenu').innerHTML =
                bloc('Lieux proposés', d.lieux, function (l) { return '<article class="gl-mod"><b>' + esc(l.nom) + '</b> · ' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + ' (' + esc(l.regionNom) + ')<p>' + esc(l.adresse) + (l.site ? ' · ' + esc(l.site) : '') + '</p><p>' + esc(l.description) + '</p><small>Proposé par ' + esc(l.proposePar) + '</small>' + boutons('lieu', l.id).replace(/<\/div>$/, '<button type="button" class="gl-btn" data-edit-lieu="' + l.id + '">Corriger</button></div>') + '</article>'; }) +
                bloc('Avis à relire', d.avis, function (a) { return '<article class="gl-mod"><b>' + esc(a.lieu.nom) + '</b> · ' + a.note + '/5 · par ' + esc(a.auteur) + '<p><b>' + esc(a.titre) + '</b> ' + esc(a.texte) + '</p>' + boutons('avis', a.id) + '</article>'; }) +
                bloc('Bons plans', d.bonsPlans, function (b) { return '<article class="gl-mod">' + esc(b.lieu || b.region) + ' · par ' + esc(b.auteur) + '<p>' + esc(b.texte) + '</p>' + boutons('bon-plan', b.id) + '</article>'; }) +
                bloc('Avis signalés', d.signales, function (s) { return '<article class="gl-mod"><b>' + esc(s.lieu.nom) + '</b> · ' + s.nb + ' signalement(s) : ' + esc(s.motifs) + '<p><b>' + esc(s.titre) + '</b> ' + esc(s.texte) + '</p>' + boutons('signalement', s.id, true) + '</article>'; }) +
                bloc('Soirées proposées', d.soirees, function (x) { return '<article class="gl-mod">' + (x.visuel ? '<a href="' + esc(urlApi(x.visuel)) + '" target="_blank" rel="noopener"><img class="gl-mod-visuel" src="' + esc(urlApi(x.visuel)) + '" alt="Visuel proposé"></a>' : '') + '<b>' + esc(x.titre) + '</b> · ' + (x.recurrenceLibelle ? esc(x.recurrenceLibelle) + ' à partir du ' : '') + esc(dateFr(x.dateDebut || x.date)) + (x.debut ? ' · ' + heureFr(x.debut) : '') + ' · <a href="lieu.html?l=' + encodeURIComponent(x.lieu.slug) + '">' + esc(x.lieu.nom) + '</a> (' + esc(x.lieu.ville) + ') · par ' + esc(x.auteur) + (x.prix ? '<p>' + esc(x.prix) + '</p>' : '') + (x.description ? '<p>' + esc(x.description) + '</p>' : '') + boutons('soiree', x.id) + '</article>'; }) +
                bloc('Fermetures et erreurs signalées', d.corrections, function (c) { return '<article class="gl-mod"><b><a href="lieu.html?l=' + encodeURIComponent(c.lieu.slug) + '">' + esc(c.lieu.nom) + '</a></b> (' + esc(c.lieu.ville) + ') · ' + (c.motif === 'ferme' ? '<span class="gl-manque">Signalé fermé</span>' : 'Information fausse') + ' · par ' + esc(c.auteur) + (c.message ? '<p>' + esc(c.message) + '</p>' : '') + '<div class="gl-mod-actions"><a class="gl-btn" href="lieu.html?l=' + encodeURIComponent(c.lieu.slug) + '">Ouvrir et corriger la fiche</a>' + (c.motif === 'ferme' ? '<button type="button" class="gl-btn gl-btn-rouge" data-mod="lieu" data-id="' + c.lieu.id + '" data-d="refuser">Retirer le lieu du guide</button>' : '') + '<button type="button" class="gl-btn" data-mod="correction" data-id="' + c.id + '" data-d="traiter">Marquer comme traité</button></div></article>'; });
        } catch (e) {}
    }
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-mod]');
        if (!b) return;
        var d = b.getAttribute('data-d'), motif = '';
        if (d === 'refuser') { motif = prompt('Motif (visible par l\'équipe) :', '') ; if (motif === null) return; }
        b.disabled = true;
        try { await api('/moderation/' + b.getAttribute('data-mod') + '/' + b.getAttribute('data-id'), { method: 'POST', body: JSON.stringify({ decision: d, motif: motif }) }); toast('C\'est fait', 'success'); chargerModeration(); if (surFiche) chargerFiche(); else if ($('glEquipe')) chargerEquipe(); else chargerRegions(); }
        catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });

    // ============================================================
    // ESPACE ÉQUIPE (guide-equipe.html) : tous les lieux, correction, retrait
    // ============================================================
    var LIEUX_EQ = {}, filtreEq = { q: '', statut: '', region: '', manque: '' }, choisis = {};
    var STATUTS = { publie: 'Publié', attente: 'En attente', refuse: 'Retiré' };
    async function chargerEquipe() {
        var z = $('glEqListe'); if (!z) return;
        try {
            var p = new URLSearchParams(); ['q', 'statut', 'region', 'manque'].forEach(function (k) { if (filtreEq[k]) p.set(k, filtreEq[k]); });
            var d = await api('/equipe/lieux?' + p);
            var c = d.compte || {};
            $('glEqCompte').textContent = (c.publie || 0) + ' publié(s) · ' + (c.attente || 0) + ' en attente · ' + (c.refuse || 0) + ' retiré(s)';
            d.lieux.forEach(function (l) { LIEUX_EQ[l.id] = l; });
            z.innerHTML = d.lieux.length ? d.lieux.map(function (l) {
                var nbCr = (l.planning || []).length;
                return '<article class="gl-eq-lieu"><label class="gl-eq-case"><input type="checkbox" data-choix="' + l.id + '"' + (choisis[l.id] ? ' checked' : '') + '><span class="gl-sr">Sélectionner ' + esc(l.nom) + '</span></label><div class="gl-eq-txt"><b>' + esc(l.nom) + ' <span class="gl-pastille gl-st-' + l.statut + '">' + STATUTS[l.statut] + '</span></b>' +
                    '<small>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + ' · ' + esc(l.regionNom) + ' · ' + (l.nbAvis ? l.nbAvis + ' avis' : 'aucun avis') + ' · ' + (nbCr ? nbCr + ' créneau(x) horaires' : '<span class="gl-manque">horaires à compléter</span>') + ' · ' + (l.verifie ? '<span class="gl-ok"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> vérifiée le ' + esc(dateFr(l.verifieLe)) + '</span>' : '<span class="gl-manque">non vérifiée</span>') + (l.lat == null ? ' · <span class="gl-manque">pas encore sur la carte</span>' : '') + '</small></div>' +
                    '<div class="gl-mod-actions"><button type="button" class="gl-btn gl-btn-jaune" data-edit-lieu="' + l.id + '"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>' +
                    (l.statut === 'publie' ? '<a class="gl-btn" href="lieu.html?l=' + encodeURIComponent(l.slug) + '">Voir</a><button type="button" class="gl-btn gl-btn-rouge" data-mod="lieu" data-id="' + l.id + '" data-d="refuser">Retirer</button>'
                        : '<button type="button" class="gl-btn" data-mod="lieu" data-id="' + l.id + '" data-d="publier">Publier</button>') + '</div></article>';
            }).join('') : '<p class="gl-vide">Aucun lieu pour ces critères. Cliquez sur « Ajouter un lieu » pour commencer.</p>';
            listeEq = d.lieux.map(function (l) { return l.id; });
            majLot();
        } catch (x) { z.innerHTML = '<p class="gl-vide">' + esc(x.message) + '</p>'; }
    }
    var listeEq = [], confirmerSuppr = false;
    function majLot() {
        var n = Object.keys(choisis).length, b = $('glEqLot'); if (!b) return;
        b.hidden = !n; $('glEqLotNb').textContent = n + ' lieu(x) sélectionné(s)';
        confirmerSuppr = false; $('glEqSuppr').textContent = 'Supprimer définitivement';
        var tout = $('glEqTout'); if (tout) tout.checked = listeEq.length > 0 && listeEq.every(function (id) { return choisis[id]; });
    }
    document.addEventListener('change', function (e) {
        var c = e.target.closest('[data-choix]');
        if (c) { if (c.checked) choisis[c.getAttribute('data-choix')] = 1; else delete choisis[c.getAttribute('data-choix')]; majLot(); return; }
        if (e.target.id === 'glEqTout') {
            listeEq.forEach(function (id) { if (e.target.checked) choisis[id] = 1; else delete choisis[id]; });
            document.querySelectorAll('[data-choix]').forEach(function (x) { x.checked = e.target.checked; });
            majLot();
        }
    });
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-lot]'); if (!b) return;
        var action = b.getAttribute('data-lot'), ids = Object.keys(choisis).map(Number);
        if (!ids.length) return;
        if (action === 'supprimer' && !confirmerSuppr) { confirmerSuppr = true; b.textContent = 'Confirmer : supprimer ' + ids.length + ' lieu(x) et leurs avis'; return; }
        if (action === 'aucun') { choisis = {}; document.querySelectorAll('[data-choix]').forEach(function (x) { x.checked = false; }); majLot(); return; }
        b.disabled = true;
        try {
            var r = await api('/equipe/lieux/action', { method: 'POST', body: JSON.stringify({ ids: ids, action: action }) });
            toast(r.n + ' lieu(x) ' + ({ publier: 'publié(s)', retirer: 'retiré(s) du guide', supprimer: 'supprimé(s)', verifier: 'marqué(s) comme vérifié(s)' })[action], 'success');
            choisis = {}; chargerEquipe(); chargerModeration();
        } catch (x) { toast(x.message, 'error'); }
        b.disabled = false;
    });
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-edit-lieu]'); if (!b) return;
        var l = LIEUX_EQ[b.getAttribute('data-edit-lieu')]; if (l) ouvrirFormLieu(l);
    });

    // ============================================================
    // IMPORT CSV (espace équipe)
    // ============================================================
    var COLONNES = ['nom', 'categorie', 'adresse', 'code_postal', 'ville', 'departement', 'telephone', 'email', 'site', 'reseaux', 'horaires', 'tarifs', 'statut', 'verifie_le', 'source', 'description'];
    var SYNONYMES = { etablissement: 'nom', nom_de_l_etablissement: 'nom', type: 'categorie', cp: 'code_postal', codepostal: 'code_postal', dep: 'departement', dept: 'departement',
        tel: 'telephone', telephones: 'telephone', site_internet: 'site', site_web: 'site', url: 'site', reseaux_sociaux: 'reseaux', facebook: 'reseaux', instagram: 'reseaux',
        mail: 'email', e_mail: 'email', courriel: 'email', adresse_mail: 'email', adresse_e_mail: 'email', horaires_et_tarifs: 'horaires', horaire: 'horaires', heures: 'horaires', horaires_tarifs: 'horaires', planning: 'horaires', precisions_tarifs: 'tarifs', precisions_sur_les_tarifs: 'tarifs', consommations: 'tarifs',
        date_de_derniere_verification: 'verifie_le', derniere_verification: 'verifie_le', date_verification: 'verifie_le', date: 'verifie_le' };
    function sansAccentJs(t) { return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(); }
    function lireCsv(texte) {
        texte = texte.replace(/^﻿/, '');
        var premiere = texte.split(/\r?\n/)[0] || '';
        var sep = [';', ',', '\t'].sort(function (a, b) { return premiere.split(b).length - premiere.split(a).length; })[0];
        var lignes = [], champ = '', ligne = [], guillemets = false;
        for (var i = 0; i < texte.length; i++) {
            var c = texte[i];
            if (guillemets) {
                if (c === '"' && texte[i + 1] === '"') { champ += '"'; i++; }
                else if (c === '"') guillemets = false;
                else champ += c;
            } else if (c === '"') guillemets = true;
            else if (c === sep) { ligne.push(champ); champ = ''; }
            else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; }
            else champ += c;
        }
        if (champ || ligne.length) { ligne.push(champ); lignes.push(ligne); }
        lignes = lignes.filter(function (l) { return l.some(function (x) { return x.trim(); }); });
        if (lignes.length < 2) return { entetes: [], objets: [] };
        var entetes = lignes[0].map(function (h) { var k = sansAccentJs(h).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); return SYNONYMES[k] || k; });
        var objets = lignes.slice(1).map(function (l) {
            var o = {};
            entetes.forEach(function (h, k) { var v = (l[k] || '').trim(); if (!v) return; o[h] = h === 'reseaux' && o[h] ? o[h] + ' ' + v : v; });
            // Horaires en texte (retours à la ligne dans la cellule, ou séparés par « | ») → créneaux, comme « coller les horaires »
            if (o.horaires) {
                var texte = o.horaires.replace(/\s*\|\s*/g, '\n');
                var r = analyserTexteHoraires(texte);
                o.planning = r.creneaux;
                if (r.reste) o.tarifs = (o.tarifs ? o.tarifs + '\n' : '') + r.reste;
                if (!r.creneaux.length) o.tarifs = (o.tarifs ? o.tarifs + '\n' : '') + texte;   // illisible : gardé tel quel dans les précisions
                delete o.horaires;
            }
            return o;
        });
        return { entetes: entetes, objets: objets };
    }
    function telechargerModele() {
        var lignes = [COLONNES.join(';'),
            'Le Velvet;club;9 Imp. du Château-Rouge;69530;Brignais;69;06 99 23 24 06;;;"Vendredi : 21h30 - 5h\nFemme seule : 10€\nCouple : 20€\nHomme seul : 10€ sur réservation\nSamedi : 21h30 - 5h Spécial rencontres\nCouple : 20€";Verre alcool et bières : 10 €;actif confirmé;2026-11-02;fiche existante;Discothèque libertine',
            'Exemple sauna;sauna;1 rue Exemple;42000;Saint-Étienne;42;;https://www.exemple.fr;https://www.facebook.com/exemple;Du lundi au samedi : 14h - 20h | Couple : offert | Homme seul : 30€ avec une conso;;à vérifier;;site officiel;'];
        var b = new Blob(['﻿' + lignes.join('\r\n')], { type: 'text/csv;charset=utf-8' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'guide-libertin-modele.csv';
        document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    var importEnAttente = [];
    function brancherImport() {
        if (!$('glImpFichier')) return;
        $('glImpModele').addEventListener('click', telechargerModele);
        $('glImpFichier').addEventListener('change', function () {
            var f = this.files && this.files[0]; if (!f) return;
            var lecteur = new FileReader();
            lecteur.onload = function () {
                var r = lireCsv(String(lecteur.result || ''));
                var z = $('glImpApercu');
                importEnAttente = r.objets.filter(function (o) { return o.nom; });
                var manque = ['nom', 'ville'].filter(function (c) { return r.entetes.indexOf(c) < 0; });
                if (manque.length || !importEnAttente.length) { z.innerHTML = '<p class="gl-erreur">' + (manque.length ? 'Colonnes obligatoires absentes : ' + manque.join(', ') + '.' : 'Aucune ligne lisible dans ce fichier.') + ' Téléchargez le modèle pour voir le format attendu.</p>'; return; }
                var vues = r.entetes.filter(function (h) { return COLONNES.indexOf(h) >= 0; });
                z.innerHTML = '<p><b>' + importEnAttente.length + ' établissement(s)</b> lus dans « ' + esc(f.name) + ' ». Colonnes reconnues : ' + esc(vues.join(', ')) + '.</p>' +
                    '<div class="gl-imp-tableau"><table><thead><tr><th>Nom</th><th>Catégorie</th><th>Ville</th><th>CP</th><th>Téléphone</th><th>Horaires</th><th>Statut</th></tr></thead><tbody>' +
                    importEnAttente.slice(0, 8).map(function (o) { return '<tr><td>' + esc(o.nom) + '</td><td>' + esc(o.categorie || '') + '</td><td>' + esc(o.ville || '') + '</td><td>' + esc(o.code_postal || o.departement || '') + '</td><td>' + esc(o.telephone || '') + '</td><td>' + ((o.planning || []).length ? o.planning.length + ' créneau(x)' : '—') + '</td><td>' + esc(o.statut || 'à vérifier') + '</td></tr>'; }).join('') +
                    '</tbody></table></div>' + (importEnAttente.length > 8 ? '<p class="gl-aide">… et ' + (importEnAttente.length - 8) + ' autre(s).</p>' : '') +
                    '<button type="button" class="gl-btn gl-btn-jaune" id="glImpGo">Importer ' + importEnAttente.length + ' établissement(s)</button>';
            };
            lecteur.readAsText(f, 'utf-8');
            this.value = '';
        });
        document.addEventListener('click', async function (e) {
            var b = e.target.closest('#glImpGo'); if (!b) return;
            b.disabled = true; b.textContent = 'Import en cours…';
            var total = { ajoutes: 0, completes: 0, doublons: 0, fermes: 0, erreurs: [] };
            try {
                for (var i = 0; i < importEnAttente.length; i += 100) {
                    var r = await api('/equipe/import', { method: 'POST', body: JSON.stringify({ lignes: importEnAttente.slice(i, i + 100) }) });
                    ['ajoutes', 'completes', 'doublons', 'fermes'].forEach(function (k) { total[k] += r[k] || 0; });
                    total.erreurs = total.erreurs.concat((r.erreurs || []).map(function (m) { return m.replace(/Ligne (\d+)/, function (x, n) { return 'Ligne ' + (+n + i); }); }));
                }
                $('glImpApercu').innerHTML = '<div class="gl-imp-bilan"><p><b>Import terminé.</b></p><ul>' +
                    '<li>' + total.ajoutes + ' établissement(s) ajouté(s)</li><li>' + total.completes + ' fiche(s) existante(s) complétée(s)</li>' +
                    '<li>' + total.doublons + ' doublon(s) déjà à jour</li><li>' + total.fermes + ' établissement(s) fermé(s) ignoré(s)</li></ul>' +
                    (total.erreurs.length ? '<p class="gl-erreur">' + total.erreurs.length + ' ligne(s) non importée(s) :<br>' + total.erreurs.slice(0, 20).map(esc).join('<br>') + '</p>' : '') +
                    '<p class="gl-aide">Les lieux « actifs confirmés » sont publiés et placés sur la carte dans les minutes qui suivent. Les autres attendent dans « Tous les lieux » (statut « En attente ») : vérifiez-les puis cliquez sur Publier.</p></div>';
                importEnAttente = [];
                chargerEquipe(); chargerModeration();
            } catch (x) { toast(x.message, 'error'); b.disabled = false; b.textContent = 'Réessayer l\'import'; }
        });
    }

    async function chargerRegions() {
        try { REGIONS = (await api('/regions')).regions || []; } catch (e) { REGIONS = []; }
        remplirRegions(etat.region);
        if ($('glEqRegion') && $('glEqRegion').options.length < 2) $('glEqRegion').insertAdjacentHTML('beforeend', REGIONS.map(function (r) { return '<option value="' + r.slug + '">' + esc(r.nom) + ' (' + r.lieux + ')</option>'; }).join(''));
        if ($('glListe')) charger();
    }

    // ============================================================
    // FICHE D'UN LIEU
    // ============================================================
    async function chargerFiche() {
        // lieu.html?l=<slug>, ou page fixe /club-libertin/<ville>/<lieu>/ (le slug est dans data-slug)
        var slug = new URLSearchParams(location.search).get('l') || ($('glFiche') && $('glFiche').getAttribute('data-slug')) || '';
        var zone = $('glFiche');
        try {
            var d = await api('/lieux/' + encodeURIComponent(slug));
            var l = lieuCourant = d.lieu;
            // Référencement : lieu.html?l=… renvoie vers la page fixe du lieu si elle existe ; sinon (fiche non vérifiée) pas d'indexation
            if (!$('glFiche').getAttribute('data-slug')) {
                var can = document.querySelector('link[rel="canonical"]');
                if (l.url && can) can.href = 'https://www.e-visiocam.com' + l.url;
                else if (!l.url && !document.querySelector('meta[name="robots"]')) document.head.insertAdjacentHTML('beforeend', '<meta name="robots" content="noindex, follow">');
            }
            document.title = l.nom + ' — ' + l.typeLibelle + ' libertin à ' + l.ville + ' | Guide E-VISIOCAM';
            if ($('glArianeRegion')) { $('glArianeRegion').textContent = l.regionNom; $('glArianeRegion').href = 'guide.html?region=' + encodeURIComponent(l.region); }
            if ($('glArianeLieu')) $('glArianeLieu').textContent = l.nom;
            var pub = (l.publics || []).map(function (p) { return '<span class="gl-tag">' + PUBLICS[p] + '</span>'; }).join('');
            var aPlanning = (l.planning || []).length;
            var infos = [['Adresse', l.adresse], ['Horaires', aPlanning ? '' : l.horaires], ['Tarifs', aPlanning ? '' : l.tarifs], ['Équipements', l.equipements], ['Tenue', l.tenue]]
                .filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('');
            if (l.telephone) infos += '<dt>Téléphone</dt><dd><a href="tel:' + esc(l.telephone.replace(/[^0-9+]/g, '')) + '">' + esc(l.telephone) + '</a></dd>';
            if ((l.reseaux || []).length) infos += '<dt>Réseaux</dt><dd class="gl-reseaux">' + l.reseaux.map(function (u) { var h = u.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]; var n = /facebook|fb\./.test(h) ? 'Facebook' : /instagram/.test(h) ? 'Instagram' : /tiktok/.test(h) ? 'TikTok' : /twitter|x\.com/.test(h) ? 'X' : h; return '<a href="' + esc(u) + '" target="_blank" rel="noopener nofollow">' + esc(n) + '</a>'; }).join(' · ') + '</dd>';
            if (l.email) infos += '<dt>E-mail</dt><dd><a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a></dd>';
            if (l.site) infos += '<dt>Site</dt><dd><a href="' + esc(l.site) + '" target="_blank" rel="noopener nofollow ugc">' + esc(l.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a></dd>';
            var mon = d.monAvis;
            var avis = d.avis.map(function (a) {
                return '<article class="gl-avis"><div class="gl-avis-tete"><span><b>' + esc(a.auteur) + '</b>' + (a.profil ? ' · ' + ({ couple: 'en couple', femme: 'femme seule', homme: 'homme seul' })[a.profil] : '') + (a.visite ? ' · visite en ' + esc(moisFr(a.visite)) : '') + '</span><span>Avis du ' + esc(dateFr(a.date)) + (a.modifie ? ' (modifié)' : '') + '</span></div>' +
                    '<div class="gl-avis-titre">' + etoiles(a.note) + (a.titre ? ' <b>' + esc(a.titre) + '</b>' : '') + '</div>' +
                    '<p>' + esc(a.texte) + '</p>' +
                    (a.reponse ? '<div class="gl-reponse"><b>Réponse de l\'établissement</b> · ' + esc(dateFr(a.reponse.date)) + '<p>' + esc(a.reponse.texte) + '</p></div>' : '') +
                    '<div class="gl-avis-actions"><button type="button" class="gl-lien-btn" data-utile="' + a.id + '">Utile (' + a.utiles + ')</button><button type="button" class="gl-lien-btn gl-gris" data-signaler="' + a.id + '">Signaler cet avis</button>' +
                    (equipe() ? '<button type="button" class="gl-lien-btn gl-gris" data-reponse="' + a.id + '">Saisir la réponse du lieu</button><button type="button" class="gl-lien-btn gl-rouge" data-mod="avis" data-id="' + a.id + '" data-d="refuser">Retirer l\'avis</button>' : '') + '</div></article>';
            }).join('');
            var dn = d.notes || {}; var notes = [['Accueil', dn.accueil], ['Ambiance', dn.ambiance], ['Propreté', dn.proprete], ['Rapport qualité-prix', dn.prix]];
            zone.innerHTML =
                '<div class="gl-fiche-grille"><div class="gl-fiche-principal">' +
                (l.statut !== 'publie' ? '<p class="gl-attente">Fiche en attente de validation (visible par l\'équipe uniquement).</p>' : '') +
                '<div class="gl-fiche-tete"><div><span class="gl-type"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '" aria-hidden="true"></i> ' + esc(l.typeLibelle) + '</span><h1>' + esc(l.nom) + '</h1><p class="gl-ville">' + esc(l.ville) + ' · ' + esc(l.regionNom) + '</p><div class="gl-tags">' + pub + (l.precisionPublic ? '<span class="gl-tag">' + esc(l.precisionPublic) + '</span>' : '') + '</div></div>' +
                (equipe() ? '<button type="button" class="gl-btn gl-btn-equipe" id="glModifierLieu"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier la fiche</button>' : '') +
                '<div class="gl-note-bloc">' + (l.nbAvis ? '<b>' + note(l.note) + '</b><small>sur 5 · ' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</div></div>' +
                (l.description ? texteRepliable(l.description, 'gl-description', 380) : '') +
                planningHTML(l) +
                '<section class="gl-agenda-fiche" aria-labelledby="glAgTitre"><div class="gl-avis-entete"><h2 id="glAgTitre"><i class="fa-regular fa-calendar" aria-hidden="true"></i> Prochaines soirées</h2><button type="button" class="gl-btn" id="glProposerSoiree"><i class="fa-solid fa-plus" aria-hidden="true"></i> Proposer une soirée</button></div><div id="glAgendaLieu" class="gl-agenda"></div></section>' +
                (l.nbAvis ? '<div class="gl-notes-detail">' + notes.map(function (n) { return '<div><small>' + n[0] + '</small><b>' + note(n[1]) + '</b></div>'; }).join('') + '</div>' : '') +
                '<section class="gl-avis-bloc"><div class="gl-avis-entete"><h2>Avis des membres</h2><button type="button" class="gl-btn gl-btn-jaune" id="glDonnerAvis">' + (mon ? 'Modifier mon avis' : 'Donner mon avis') + '</button></div>' +
                (mon && mon.statut !== 'publie' ? '<p class="gl-attente">' + (mon.statut === 'attente' ? 'Votre avis est en cours de relecture par la modération.' : 'Votre avis n\'a pas été publié' + (mon.motif ? ' : ' + esc(mon.motif) : '.') + ' Vous pouvez le modifier.') + '</p>' : '') +
                (avis || '<p class="gl-vide">Soyez le premier à donner votre avis sur ce lieu.</p>') + '</section></div>' +
                '<aside class="gl-fiche-cote">' +
                '<section class="gl-encart"><h2>Infos pratiques</h2><dl>' + (infos || '<dt></dt><dd>Infos à compléter.</dd>') + '</dl><div id="glMiniCarte" class="gl-mini-carte"' + (l.lat == null ? ' hidden' : '') + '></div>' + itineraire(l) + '<button type="button" class="gl-lien-btn gl-gris gl-signaler-lieu" id="glSignalerLieu"><i class="fa-regular fa-flag" aria-hidden="true"></i> Signaler une fermeture ou une erreur</button></section>' +
                habituesHTML(d.habitues) +
                '<section class="gl-encart"><h2>Bons plans</h2>' + (d.bonsPlans.length ? '<ul class="gl-plans-fiche">' + d.bonsPlans.map(function (b) { return '<li>' + esc(b.texte) + '<small>' + esc(dateFr(b.date)) + '</small></li>'; }).join('') + '</ul>' : '<p class="gl-vide-plan">Pas encore de bon plan.</p>') + '<button type="button" class="gl-lien-btn" id="glPlanLieu">Partager un bon plan →</button></section>' +
                '<section class="gl-encart gl-pointille"><b>Vous gérez ce lieu ?</b><p>Contactez-nous pour mettre la fiche à jour, ajouter vos photos officielles et répondre aux avis.</p><a class="gl-lien" href="contact.html">Revendiquer cette fiche →</a></section>' +
                (l.salon ? '<a class="gl-btn gl-large" href="chat.html?theme=' + encodeURIComponent(l.salon) + '">Discuter dans le salon ' + esc(l.regionNom) + '</a>' : '') +
                '</aside></div>';
            if (l.lat != null && window.L) {
                var m = L.map('glMiniCarte', { scrollWheelZoom: false, zoomControl: false }).setView([l.lat, l.lng], 14);
                L.tileLayer(TUILES, { attribution: ATTRIB }).addTo(m);
                L.circleMarker([l.lat, l.lng], { radius: 9, color: '#111113', weight: 2, fillColor: '#ff1680', fillOpacity: 1 }).addTo(m);
            }
            $('glDonnerAvis').addEventListener('click', function () {
                if (!connecte()) return versConnexion();
                var f = $('glFormAvis');
                if (mon) {
                    f.titre.value = mon.titre || ''; f.texte.value = mon.texte || ''; f.profil.value = mon.profil || ''; f.visite.value = mon.visite || '';
                    var vals = { note: mon.note, accueil: mon.notes.accueil, ambiance: mon.notes.ambiance, proprete: mon.notes.proprete, prix: mon.notes.prix };
                    Object.keys(vals).forEach(function (k) { var b = f.querySelector('[data-note="' + k + '"] button[data-v="' + vals[k] + '"]'); if (b) b.click(); });
                }
                ouvrir('glFenetreAvis');
            });
            if ($('glModifierLieu')) $('glModifierLieu').addEventListener('click', function () { ouvrirFormLieu(l); });
            brancherHabitues(l, d.habitues);
            ajouterFenetresFiche();
            chargerAgendaFiche();
            $('glPlanLieu').addEventListener('click', function () { if (!connecte()) return versConnexion(); ouvrir('glFenetrePlan'); });
        } catch (e) {
            if (window.console) console.warn('Guide', e);
            if (zone.getAttribute('data-slug')) return;   // page fixe : son contenu (déjà affiché) reste en place
            zone.innerHTML = '<div class="gl-vide-bloc"><p>Ce lieu est introuvable ou n\'est pas encore publié.</p><a class="gl-lien" href="guide.html">← Retour au guide</a></div>';
        }
    }
    document.addEventListener('click', async function (e) {
        var u = e.target.closest('[data-utile]'), s = e.target.closest('[data-signaler]'), rp = e.target.closest('[data-reponse]');
        if (!u && !s && !rp) return;
        if (!connecte()) return versConnexion();
        try {
            if (u) { var r = await api('/avis/' + u.getAttribute('data-utile') + '/utile', { method: 'POST' }); u.textContent = 'Utile (' + r.utiles + ')'; }
            if (s) { var m = prompt('Pourquoi signalez-vous cet avis ? (faux avis, attaque personnelle, propos déplacés…)'); if (m === null) return; var r2 = await api('/avis/' + s.getAttribute('data-signaler') + '/signaler', { method: 'POST', body: JSON.stringify({ motif: m }) }); toast(r2.message, 'success'); }
            if (rp) { var t = prompt('Réponse de l\'établissement (laisser vide pour retirer) :'); if (t === null) return; await api('/avis/' + rp.getAttribute('data-reponse') + '/reponse', { method: 'POST', body: JSON.stringify({ texte: t }) }); chargerFiche(); }
        } catch (x) { toast(x.message, 'error'); }
    });

    // ---------- Démarrage ----------
    document.addEventListener('DOMContentLoaded', function () {
        brancherFormulaires();
        if (surFiche) { chargerRegions(); chargerFiche(); return; }
        if ($('glEquipe')) {
            if (!equipe()) { $('glEquipe').innerHTML = '<div class="gl-vide-bloc"><p>Cet espace est réservé à l\'équipe de modération. Connectez-vous avec un compte modérateur ou administrateur.</p><a class="gl-lien" href="guide.html">← Retour au guide</a></div>'; return; }
            chargerRegions(); chargerModeration(); chargerEquipe();
            var att;
            $('glEqQ').addEventListener('input', function () { clearTimeout(att); var v = this.value.trim(); att = setTimeout(function () { filtreEq.q = v; chargerEquipe(); }, 300); });
            $('glEqStatut').addEventListener('change', function () { filtreEq.statut = this.value; chargerEquipe(); });
            $('glEqRegion').addEventListener('change', function () { filtreEq.region = this.value; chargerEquipe(); });
            $('glEqManque').addEventListener('change', function () { filtreEq.manque = this.value; chargerEquipe(); });
            $('glEqAjouter').addEventListener('click', function () { ouvrirFormLieu(null); });
            brancherImport();
            return;
        }
        var p = new URLSearchParams(location.search);
        etat.region = p.get('region') || ''; etat.type = p.get('type') || ''; etat.public = p.get('public') || '';
        document.querySelectorAll('[data-type]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === etat.type));
            b.addEventListener('click', function () {
                etat.type = b.getAttribute('data-type');
                document.querySelectorAll('[data-type]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                charger();
            });
        });
        $('glOuvert').addEventListener('click', function () { etat.ouvert = !etat.ouvert; this.setAttribute('aria-pressed', String(etat.ouvert)); charger(); });
        $('glPublic').value = etat.public;
        $('glPublic').addEventListener('change', function () { etat.public = this.value; charger(); });
        var attente;
        $('glQ').addEventListener('input', function () { clearTimeout(attente); var v = this.value.trim(); attente = setTimeout(function () { etat.q = v; charger(); }, 300); });
        $('glFiltres').addEventListener('submit', function (e) { e.preventDefault(); });
        $('glRegions').addEventListener('click', function (e) {
            var b = e.target.closest('[data-region]'); if (!b) return;
            var s = b.getAttribute('data-region');
            etat.region = etat.region === s ? '' : s;
            charger();
        });
        document.addEventListener('click', function (e) {
            if (e.target.closest('#glProposer, [data-proposer]')) { if (!connecte()) return versConnexion(); ouvrirFormLieu(null); }
            if (e.target.closest('#glAjouterPlan')) { if (!connecte()) return versConnexion(); remplirRegions(etat.region); ouvrir('glFenetrePlan'); }
        });
        if (equipe() && $('glLienEquipe')) $('glLienEquipe').hidden = false;
        chargerRegions();
        chargerModeration();
        // Lien « Ajouter un lieu » depuis l'accueil : guide.html?proposer=1
        if (/[?&]proposer=1/.test(location.search)) window.addEventListener('load', function () { setTimeout(function () { var b = $('glProposer'); if (b) b.click(); }, 400); });
        // Leaflet est chargé en « defer » : on redessine la carte dès qu'il est prêt
        if (!window.L) window.addEventListener('load', function () { if (!carte) charger(); });
    });
})();
