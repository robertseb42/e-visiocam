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
        if (e.target.classList && e.target.classList.contains('gl-fond')) fermer(e.target);
    });
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
            '<div class="gl-trois">' + champ('hommes', 'Hommes (€)', p.hommes, 'inputmode="decimal" maxlength="7"') +
            champ('femmes', 'Femmes (€)', p.femmes, 'inputmode="decimal" maxlength="7"') + champ('couples', 'Couples (€)', p.couples, 'inputmode="decimal" maxlength="7"') + '</div>' +
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
                prix: { hommes: v('hommes').replace(',', '.'), femmes: v('femmes').replace(',', '.'), couples: v('couples').replace(',', '.') }
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
                    var p = c.prix || {}, prix = [['Hommes', p.hommes], ['Femmes', p.femmes], ['Couples', p.couples]].filter(function (x) { return x[1] != null; });
                    return '<div class="gl-cr"><div class="gl-cr-txt"><b>' + (c.debut ? '<span class="gl-h">' + heureFr(c.debut) + (c.fin ? ' – ' + heureFr(c.fin) : '') + '</span>' : '') + (c.espace ? '<em>' + esc(c.espace) + '</em>' : '') + '</b>' +
                        (c.titre ? '<strong>' + esc(c.titre) + '</strong>' : '') + (c.public ? '<small>' + esc(c.public) + '</small>' : '') + (c.note ? '<small class="gl-cr-note">' + esc(c.note) + '</small>' : '') + '</div>' +
                        (prix.length ? '<dl class="gl-prix">' + prix.map(function (x) { return '<div><dt>' + x[0] + '</dt><dd>' + prixFr(x[1]) + '</dd></div>'; }).join('') + '</dl>' : '') + '</div>';
                }).join('') + '</div>';
        }).join('');
        return '<section class="gl-horaires" aria-labelledby="glHorTitre"><div class="gl-horaires-tete"><h2 id="glHorTitre">Horaires et tarifs</h2>' + etatOuverture(pl) + '</div>' +
            '<div class="gl-jours-grille">' + html + '</div>' +
            (fermes.length ? '<p class="gl-ferme">Fermé le ' + fermes.map(function (d) { return JOURS[d]; }).join(', ') + '.</p>' : '') +
            (l.tarifs ? '<p class="gl-tarifs-note">' + esc(l.tarifs) + '</p>' : '') +
            '<p class="gl-maj">Infos données à titre indicatif' + (l.majLe ? ', mises à jour le ' + esc(dateFr(l.majLe)) : '') + '. Vérifiez auprès de l\'établissement avant de vous déplacer.</p></section>';
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
            ['nom', 'type', 'ville', 'adresse', 'telephone', 'equipements', 'tenue', 'site', 'description', 'tarifs'].forEach(function (k) { if (f[k]) f[k].value = l[k] || ''; });
            if (f.precisionPublic) f.precisionPublic.value = l.precisionPublic || '';
            f.querySelectorAll('input[name=publics]').forEach(function (c) { c.checked = (l.publics || []).indexOf(c.value) >= 0; });
            f.querySelectorAll('input[name=types]').forEach(function (c) { c.checked = c.value !== l.type && (l.types || []).indexOf(c.value) >= 0; });
            // Anciennes fiches : horaires en texte libre → recopiés dans « précisions » pour ne rien perdre
            if (!(l.planning || []).length && l.horaires && f.tarifs && f.tarifs.value.indexOf(l.horaires) < 0) f.tarifs.value = ('Horaires : ' + l.horaires + (f.tarifs.value ? '\n' + f.tarifs.value : '')).slice(0, 600);
        }
        remplirPlanning(f, l ? l.planning : []);
        ouvrir('glFenetreLieu');
    }

    // ---------- Proposer un lieu / un bon plan ----------
    function brancherFormulaires() {
        var fl = $('glFormLieu');
        if (fl) fl.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fl).entries());
            d.publics = [].slice.call(fl.querySelectorAll('input[name=publics]:checked')).map(function (x) { return x.value; });
            d.planning = lirePlanningForm(fl);
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
        return '<a class="gl-lieu" href="lieu.html?l=' + encodeURIComponent(l.slug) + '">' +
            '<span class="gl-lieu-ico" aria-hidden="true"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '"></i></span>' +
            '<span class="gl-lieu-txt"><b>' + esc(l.nom) + ((l.jours || []).indexOf(jourDuJour()) >= 0 ? ' <em class="gl-ouvert">Ouvert aujourd\'hui</em>' : '') + '</b><span>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + (etat.region ? '' : ' · ' + esc(l.regionNom)) + '</span>' +
            (pub || l.precisionPublic ? '<small>' + esc(pub) + (l.precisionPublic ? ' — ' + esc(l.precisionPublic) : '') + '</small>' : '') + '</span>' +
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
        lieux.forEach(function (l) {
            if (l.lat == null || l.lng == null) return;
            pts.push([l.lat, l.lng]);
            L.circleMarker([l.lat, l.lng], { radius: 8, color: '#111113', weight: 2, fillColor: '#ff1680', fillOpacity: 0.95 })
                .bindPopup('<b>' + esc(l.nom) + '</b><br>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + '<br><a href="lieu.html?l=' + encodeURIComponent(l.slug) + '">Voir la fiche</a>')
                .addTo(calque);
        });
        if (pts.length > 1) carte.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
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
            var total = d.lieux.length + d.avis.length + d.bonsPlans.length + d.signales.length;
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
                bloc('Avis signalés', d.signales, function (s) { return '<article class="gl-mod"><b>' + esc(s.lieu.nom) + '</b> · ' + s.nb + ' signalement(s) : ' + esc(s.motifs) + '<p><b>' + esc(s.titre) + '</b> ' + esc(s.texte) + '</p>' + boutons('signalement', s.id, true) + '</article>'; });
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
    var LIEUX_EQ = {}, filtreEq = { q: '', statut: '' };
    var STATUTS = { publie: 'Publié', attente: 'En attente', refuse: 'Retiré' };
    async function chargerEquipe() {
        var z = $('glEqListe'); if (!z) return;
        try {
            var p = new URLSearchParams(); if (filtreEq.q) p.set('q', filtreEq.q); if (filtreEq.statut) p.set('statut', filtreEq.statut);
            var d = await api('/equipe/lieux?' + p);
            var c = d.compte || {};
            $('glEqCompte').textContent = (c.publie || 0) + ' publié(s) · ' + (c.attente || 0) + ' en attente · ' + (c.refuse || 0) + ' retiré(s)';
            d.lieux.forEach(function (l) { LIEUX_EQ[l.id] = l; });
            z.innerHTML = d.lieux.length ? d.lieux.map(function (l) {
                var nbCr = (l.planning || []).length;
                return '<article class="gl-eq-lieu"><div class="gl-eq-txt"><b>' + esc(l.nom) + ' <span class="gl-pastille gl-st-' + l.statut + '">' + STATUTS[l.statut] + '</span></b>' +
                    '<small>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + ' · ' + esc(l.regionNom) + ' · ' + (l.nbAvis ? l.nbAvis + ' avis' : 'aucun avis') + ' · ' + (nbCr ? nbCr + ' créneau(x) horaires' : '<span class="gl-manque">horaires à compléter</span>') + (l.lat == null ? ' · <span class="gl-manque">pas encore sur la carte</span>' : '') + '</small></div>' +
                    '<div class="gl-mod-actions"><button type="button" class="gl-btn gl-btn-jaune" data-edit-lieu="' + l.id + '"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button>' +
                    (l.statut === 'publie' ? '<a class="gl-btn" href="lieu.html?l=' + encodeURIComponent(l.slug) + '">Voir</a><button type="button" class="gl-btn gl-btn-rouge" data-mod="lieu" data-id="' + l.id + '" data-d="refuser">Retirer</button>'
                        : '<button type="button" class="gl-btn" data-mod="lieu" data-id="' + l.id + '" data-d="publier">Publier</button>') + '</div></article>';
            }).join('') : '<p class="gl-vide">Aucun lieu pour ces critères. Cliquez sur « Ajouter un lieu » pour commencer.</p>';
        } catch (x) { z.innerHTML = '<p class="gl-vide">' + esc(x.message) + '</p>'; }
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-edit-lieu]'); if (!b) return;
        var l = LIEUX_EQ[b.getAttribute('data-edit-lieu')]; if (l) ouvrirFormLieu(l);
    });

    async function chargerRegions() {
        try { REGIONS = (await api('/regions')).regions || []; } catch (e) { REGIONS = []; }
        remplirRegions(etat.region);
        if ($('glListe')) charger();
    }

    // ============================================================
    // FICHE D'UN LIEU
    // ============================================================
    async function chargerFiche() {
        var slug = new URLSearchParams(location.search).get('l') || '';
        var zone = $('glFiche');
        try {
            var d = await api('/lieux/' + encodeURIComponent(slug));
            var l = lieuCourant = d.lieu;
            document.title = l.nom + ' — ' + l.typeLibelle + ' libertin à ' + l.ville + ' | Guide E-VISIOCAM';
            $('glArianeRegion').textContent = l.regionNom; $('glArianeRegion').href = 'guide.html?region=' + encodeURIComponent(l.region);
            $('glArianeLieu').textContent = l.nom;
            var pub = (l.publics || []).map(function (p) { return '<span class="gl-tag">' + PUBLICS[p] + '</span>'; }).join('');
            var aPlanning = (l.planning || []).length;
            var infos = [['Adresse', l.adresse], ['Horaires', aPlanning ? '' : l.horaires], ['Tarifs', aPlanning ? '' : l.tarifs], ['Équipements', l.equipements], ['Tenue', l.tenue]]
                .filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('');
            if (l.telephone) infos += '<dt>Téléphone</dt><dd><a href="tel:' + esc(l.telephone.replace(/[^0-9+]/g, '')) + '">' + esc(l.telephone) + '</a></dd>';
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
                (l.description ? '<p class="gl-description">' + esc(l.description) + '</p>' : '') +
                planningHTML(l) +
                (l.nbAvis ? '<div class="gl-notes-detail">' + notes.map(function (n) { return '<div><small>' + n[0] + '</small><b>' + note(n[1]) + '</b></div>'; }).join('') + '</div>' : '') +
                '<section class="gl-avis-bloc"><div class="gl-avis-entete"><h2>Avis des membres</h2><button type="button" class="gl-btn gl-btn-jaune" id="glDonnerAvis">' + (mon ? 'Modifier mon avis' : 'Donner mon avis') + '</button></div>' +
                (mon && mon.statut !== 'publie' ? '<p class="gl-attente">' + (mon.statut === 'attente' ? 'Votre avis est en cours de relecture par la modération.' : 'Votre avis n\'a pas été publié' + (mon.motif ? ' : ' + esc(mon.motif) : '.') + ' Vous pouvez le modifier.') + '</p>' : '') +
                (avis || '<p class="gl-vide">Soyez le premier à donner votre avis sur ce lieu.</p>') + '</section></div>' +
                '<aside class="gl-fiche-cote">' +
                '<section class="gl-encart"><h2>Infos pratiques</h2><dl>' + (infos || '<dt></dt><dd>Infos à compléter.</dd>') + '</dl><div id="glMiniCarte" class="gl-mini-carte"' + (l.lat == null ? ' hidden' : '') + '></div>' + itineraire(l) + '</section>' +
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
            $('glPlanLieu').addEventListener('click', function () { if (!connecte()) return versConnexion(); ouvrir('glFenetrePlan'); });
        } catch (e) {
            if (window.console) console.warn('Guide', e);
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
            $('glEqAjouter').addEventListener('click', function () { ouvrirFormLieu(null); });
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
        // Leaflet est chargé en « defer » : on redessine la carte dès qu'il est prêt
        if (!window.L) window.addEventListener('load', function () { if (!carte) charger(); });
    });
})();
