// ============================================================
// E-VISIOCAM — Programme des soirées (accueil : « Prochaines soirées » ; programme.html : tout le programme)
// ------------------------------------------------------------
// API : GET /api/evenements/prochains (public), POST/DELETE /api/evenements/:id/rappel (membre)
// - compte à rebours de la prochaine soirée (chaque seconde à l'écran ; pour les lecteurs d'écran,
//   une phrase « polie » mise à jour seulement quand la minute change)
// - « Me prévenir » : membre → rappel ; visiteur → connexion puis retour ici (le rappel est alors activé)
// - « Rejoindre » pendant la soirée → chat.html?theme=<salon>
// - programme.html : séances des 14 jours + données structurées Event (JSON-LD) générées depuis l'API
// Dépend de auth-api.js (API_URL, isLoggedIn, showToast). Aucun script inline (CSP stricte).
// ============================================================
(function () {
    'use strict';
    var SITE = 'https://www.e-visiocam.com';
    var zoneUne = document.getElementById('soireeUne');
    var zoneListe = document.getElementById('soireesListe');
    var zoneProg = document.getElementById('programmeJours');
    var annonce = document.getElementById('soireeAnnonce');
    if (!zoneUne && !zoneProg) return;
    var surProgramme = !!zoneProg;
    var PAGE = surProgramme ? 'programme.html' : 'index.html';

    var seances = [];
    var decalage = 0;              // horloge du serveur − horloge du navigateur (ms)
    var derniereMinute = null;
    var chargeLe = 0;

    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var maintenant = function () { return Date.now() + decalage; };
    var connecte = function () { return typeof isLoggedIn === 'function' && isLoggedIn(); };
    var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };
    var ICONES = { soiree: 'fa-compact-disc', quiz: 'fa-brain', blindtest: 'fa-headphones', autre: 'fa-calendar-day' };
    var icone = function (s) { return ICONES[s.type] || 'fa-calendar'; };

    // ---------- Dates (heure de Paris : le site et ses soirées sont en France) ----------
    var fmt = function (o) { try { return new Intl.DateTimeFormat('fr-FR', Object.assign({ timeZone: 'Europe/Paris' }, o)); } catch (e) { return new Intl.DateTimeFormat('fr-FR', o); } };
    var fHeure = fmt({ hour: '2-digit', minute: '2-digit' });
    var fJour = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
    var fJourCourt = fmt({ weekday: 'short' });
    var fNum = fmt({ day: 'numeric' });
    var fCle = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' });
    function quand(s) {
        var d = new Date(s.debut), cle = fCle.format(d), t = maintenant();
        var jour = cle === fCle.format(new Date(t)) ? 'Ce soir' : cle === fCle.format(new Date(t + 86400000)) ? 'Demain' : fJour.format(d);
        if (jour === 'Ce soir' && Number(fmt({ hour: 'numeric', hourCycle: 'h23' }).format(d)) < 18) jour = 'Aujourd’hui';
        return jour.charAt(0).toUpperCase() + jour.slice(1) + ' à ' + fHeure.format(d).replace(':', 'h');
    }
    function morceaux(ms) {
        var s = Math.max(0, Math.floor(ms / 1000));
        return { j: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
    }
    var deux = function (n) { return (n < 10 ? '0' : '') + n; };
    var pluriel = function (n, mot) { return n + ' ' + mot + (n > 1 ? 's' : ''); };
    function phrase(s) {
        var t = maintenant(), debut = Date.parse(s.debut), fin = Date.parse(s.fin);
        if (debut <= t && t < fin) return s.titre + ' a commencé dans « ' + s.salon_nom + ' ». Vous pouvez la rejoindre.';
        var p = morceaux(debut - t), r = [];
        if (p.j) r.push(pluriel(p.j, 'jour'));
        if (p.h) r.push(pluriel(p.h, 'heure'));
        if (!p.j) r.push(pluriel(p.m, 'minute'));
        return 'Prochaine soirée : ' + s.titre + ', dans ' + (r.join(' et ') || 'moins d’une minute') + '.';
    }

    // ---------- Boutons ----------
    function boutonRappel(s, mini) {
        var actif = !!s.rappel;
        var txt = actif ? 'Rappel activé' : 'Me prévenir';
        var etiquette = (actif ? 'Ne plus me prévenir pour ' : 'Me prévenir au début de ') + s.titre;
        if (mini) return '<button type="button" class="ev-mini" data-rappel="' + s.evenement_id + '" aria-pressed="' + actif + '" aria-label="' + esc(etiquette) + '"><i class="fa-' + (actif ? 'solid' : 'regular') + ' fa-bell" aria-hidden="true"></i><span class="ev-mini-txt">' + txt + '</span></button>';
        return '<button type="button" class="ev-btn-ghost" data-rappel="' + s.evenement_id + '" aria-pressed="' + actif + '" aria-label="' + esc(etiquette) + '"><i class="fa-' + (actif ? 'solid' : 'regular') + ' fa-bell" aria-hidden="true"></i>' + txt + '</button>';
    }
    var lienSalon = function (s) { return 'chat.html?theme=' + encodeURIComponent(s.salon_slug); };
    function boutonRejoindre(s, mini) {
        if (mini) return '<a class="ev-mini ev-mini-live" href="' + esc(lienSalon(s)) + '" aria-label="' + esc('Rejoindre ' + s.titre) + '"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i><span class="ev-mini-txt">Rejoindre</span></a>';
        return '<a class="ev-btn" href="' + esc(lienSalon(s)) + '"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>Rejoindre la soirée</a>';
    }
    var enCours = function (s, t) { return Date.parse(s.debut) <= t && t < Date.parse(s.fin); };
    var inscritsTxt = function (s) { return s.inscrits >= 3 ? '<p class="ev-inscrits">' + s.inscrits + ' membres seront prévenus</p>' : ''; };

    // ---------- Rendu ----------
    function rendreUne(s) {
        var t = maintenant(), live = enCours(s, t);
        return '<div class="ev-une-haut">' + (live ? '<span class="ev-badge ev-badge-live">En cours</span>' : '<span class="ev-badge"><i class="fa-solid ' + icone(s) + '" aria-hidden="true"></i>' + esc(s.type_libelle) + '</span>') +
                '<span>' + esc(s.salon_icone) + ' ' + esc(s.salon_nom) + '</span></div>' +
            '<h3>' + esc(s.titre) + '</h3>' +
            '<p class="ev-quand">' + (live ? 'Jusqu’à ' + fHeure.format(new Date(s.fin)).replace(':', 'h') : esc(quand(s))) + '</p>' +
            (s.description ? '<p>' + esc(s.description) + '</p>' : '') +
            (live ? '' : '<div class="ev-compte" aria-hidden="true" data-compte="' + esc(s.debut) + '"></div>') +
            '<div class="ev-actions">' + (live ? boutonRejoindre(s) : '') + boutonRappel(s) + '</div>' + inscritsTxt(s);
    }
    function rendreLigne(s) {
        var d = new Date(s.debut), live = enCours(s, maintenant());
        return '<li class="ev-ligne">' +
            '<span class="ev-date" aria-hidden="true"><b>' + esc(fJourCourt.format(d).replace('.', '')) + '</b><strong>' + esc(fNum.format(d)) + '</strong></span>' +
            '<div class="ev-ligne-txt"><h3><i class="fa-solid ' + icone(s) + '" aria-hidden="true" style="color:var(--h-pink);margin-right:6px"></i>' + esc(s.titre) + '</h3>' +
            '<p>' + (live ? '<span class="ev-badge ev-badge-live" style="padding:1px 7px;font-size:10px">En cours</span> ' : esc(quand(s)) + ' · ') + esc(s.salon_nom) + '</p></div>' +
            (live ? boutonRejoindre(s, true) : '') + boutonRappel(s, true) + '</li>';
    }
    function compteur() {
        var el = document.querySelector('[data-compte]');
        if (!el) return;
        var p = morceaux(Date.parse(el.getAttribute('data-compte')) - maintenant());
        var cases = (p.j ? [[p.j, p.j > 1 ? 'jours' : 'jour']] : []).concat([[deux(p.h), 'h'], [deux(p.m), 'min'], [deux(p.s), 's']]);
        el.innerHTML = cases.map(function (c) { return '<span><b>' + c[0] + '</b><small>' + c[1] + '</small></span>'; }).join('');
    }

    function rendre() {
        var t = maintenant();
        var a_venir = seances.filter(function (s) { return Date.parse(s.fin) > t; });
        if (zoneUne) {
            if (!a_venir.length) {
                zoneUne.innerHTML = '<p class="ev-soirees-vide">Aucune soirée programmée pour le moment. Les salons restent ouverts à toute heure.</p>';
                if (zoneListe) zoneListe.innerHTML = '';
            } else {
                zoneUne.innerHTML = rendreUne(a_venir[0]);
                if (zoneListe) zoneListe.innerHTML = a_venir.slice(1, 4).map(rendreLigne).join('');
            }
        }
        if (zoneProg) rendreProgramme(a_venir);
        compteur();
        derniereMinute = null;
        annoncer();
    }
    function rendreProgramme(liste) {
        if (!liste.length) { zoneProg.innerHTML = '<p class="ev-soirees-vide">Aucune soirée programmée dans les 14 prochains jours.</p>'; return; }
        var html = '', jour = null;
        liste.forEach(function (s) {
            var j = fJour.format(new Date(s.debut));
            if (j !== jour) { if (jour !== null) html += '</ol>'; html += '<h2 class="ev-prog-jour">' + esc(j) + '</h2><ol class="ev-liste">'; jour = j; }
            html += rendreLigne(s);
        });
        zoneProg.innerHTML = html + '</ol>';
    }
    // Lecteurs d'écran : une phrase par minute au plus (pas une annonce chaque seconde)
    function annoncer() {
        if (!annonce) return;
        var m = Math.floor(maintenant() / 60000);
        if (m === derniereMinute) return;
        derniereMinute = m;
        var t = maintenant();
        var s = seances.filter(function (x) { return Date.parse(x.fin) > t; })[0];
        annonce.textContent = s ? phrase(s) : '';
    }

    // ---------- Données structurées (programme.html) ----------
    function jsonLd() {
        if (!surProgramme) return;
        var ancien = document.getElementById('programmeLd');
        if (ancien) ancien.remove();
        var t = maintenant();
        var evts = seances.filter(function (s) { return Date.parse(s.fin) > t; }).slice(0, 20).map(function (s) {
            var url = SITE + '/' + lienSalon(s);
            return {
                '@type': 'Event', name: s.titre + ' — E-VISIOCAM', description: s.description || (s.type_libelle + ' en direct dans le ' + s.salon_nom + ' du tchat E-VISIOCAM.'),
                startDate: s.debut, endDate: s.fin, eventStatus: 'https://schema.org/EventScheduled',
                eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
                location: { '@type': 'VirtualLocation', url: url },
                image: [SITE + '/img/partage.jpg'], inLanguage: 'fr-FR', isAccessibleForFree: true, typicalAgeRange: '18-',
                organizer: { '@type': 'Organization', name: 'E-VISIOCAM', url: SITE + '/' },
                offers: { '@type': 'Offer', price: 0, priceCurrency: 'EUR', availability: 'https://schema.org/InStock', url: SITE + '/programme.html' }
            };
        });
        if (!evts.length) return;
        var el = document.createElement('script');
        el.type = 'application/ld+json'; el.id = 'programmeLd';
        el.textContent = JSON.stringify({ '@context': 'https://schema.org', '@graph': evts });
        document.head.appendChild(el);
    }

    // ---------- Chargement ----------
    async function charger() {
        try {
            var avant = Date.now();
            var r = await fetch(API_URL + '/evenements/prochains?jours=14', { credentials: 'include' });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var d = await r.json();
            var serveur = Date.parse(d.maintenant);
            if (Number.isFinite(serveur)) decalage = serveur - (avant + Date.now()) / 2;
            seances = Array.isArray(d.seances) ? d.seances : [];
            chargeLe = Date.now();
            rendre();
            jsonLd();
        } catch (e) {
            if (!seances.length) {
                var msg = '<p class="ev-soirees-vide">Le programme ne peut pas être affiché pour le moment. <a href="programme.html" style="color:var(--h-yellow);font-weight:700">Voir le programme</a></p>';
                if (zoneUne && !surProgramme) zoneUne.innerHTML = msg;
                if (zoneProg) zoneProg.innerHTML = '<p class="ev-soirees-vide">Le programme ne peut pas être affiché pour le moment. Réessayez dans quelques minutes.</p>';
            }
        }
    }

    // ---------- Me prévenir ----------
    async function basculer(id, activer, bouton) {
        if (bouton) bouton.disabled = true;
        try {
            await apiCall('/evenements/' + id + '/rappel', { method: activer ? 'POST' : 'DELETE' });
            seances.forEach(function (s) { if (s.evenement_id === id) { s.rappel = activer; s.inscrits = Math.max(0, (s.inscrits || 0) + (activer ? 1 : -1)); } });
            rendre();
            var s = seances.find(function (x) { return x.evenement_id === id; });
            toast(activer ? '🔔 C’est noté : nous vous prévenons au début de « ' + (s ? s.titre : 'la soirée') + ' ». Site fermé, activez les notifications dans Mon compte.' : 'Rappel retiré.', 'success');
            var b = document.querySelector('[data-rappel="' + id + '"]');
            if (b) b.focus();
        } catch (e) {
            toast((e && e.message) || 'Action impossible pour le moment', 'error');
            if (bouton) bouton.disabled = false;
        }
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-rappel]');
        if (!b) return;
        var id = Number(b.getAttribute('data-rappel'));
        if (!connecte()) {
            // Après la connexion, retour ici et le rappel s'active tout seul
            location.href = 'login.html?redirect=' + encodeURIComponent(PAGE + '?rappel=' + id + (surProgramme ? '' : '#soirees'));
            return;
        }
        basculer(id, b.getAttribute('aria-pressed') !== 'true', b);
    });

    // Retour de la page de connexion avec ?rappel=<id>
    var demande = Number(new URLSearchParams(location.search).get('rappel'));
    var premierChargement = charger().then(function () {
        if (!demande || !connecte()) return;
        try { history.replaceState(null, '', PAGE + location.hash); } catch (e) {}
        var s = seances.find(function (x) { return x.evenement_id === demande; });
        if (s && !s.rappel) basculer(demande, true, null);
    });
    void premierChargement;

    // ---------- Horloge ----------
    var etaitEnCours = null;
    setInterval(function () {
        if (document.hidden || !seances.length) return;
        var t = maintenant();
        var prochaine = seances.filter(function (x) { return Date.parse(x.fin) > t; })[0];
        var etat = prochaine ? prochaine.evenement_id + '|' + prochaine.debut + '|' + enCours(prochaine, t) : '';
        if (etat !== etaitEnCours) { if (etaitEnCours !== null) rendre(); etaitEnCours = etat; }   // début ou fin d'une soirée
        compteur();
        annoncer();
        if (Date.now() - chargeLe > 5 * 60000) charger();
    }, 1000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - chargeLe > 60000) charger(); });
})();
