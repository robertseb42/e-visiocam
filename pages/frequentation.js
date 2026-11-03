// E-VISIOCAM — Espace équipe du guide : « Fréquentation » (mesure d'audience anonyme, voir mesure.js)
(function () {
    'use strict';
    var bloc = document.getElementById('evFreq');
    if (!bloc) return;
    var $ = function (s) { return bloc.querySelector(s); };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var nb = function (n) { return Number(n || 0).toLocaleString('fr-FR'); };
    var PAGES = { index: 'Accueil', guide: 'Guide libertin (liste)', lieu: 'Fiche d\'un lieu', 'club-libertin/fiche': 'Fiche (page Google)', 'club-libertin/liste': 'Ville / région (page Google)',
        salons: 'Salons', chat: 'Salon de chat', live: 'En direct', modeles: 'Modèles', programme: 'Programme des soirées', messages: 'Messagerie', credits: 'Récompenses',
        'guide-equipe': 'Espace équipe guide', 'tchat-regions': 'Chat par région', register: 'Inscription', login: 'Connexion', profile: 'Profil', membre: 'Profil d\'un membre',
        'guide-chat-webcam': 'Guide pour débuter', 'securite-chat-webcam': 'Conseils de sécurité', aide: 'Centre d\'aide', roulette: 'Roulette', compte: 'Mon compte' };
    var SOURCES = { google: 'Google', direct: 'Accès direct / favoris', interne: 'Lien interne', 'autres moteurs': 'Autres moteurs (Bing, Qwant…)', 'réseaux sociaux': 'Réseaux sociaux', 'autres sites': 'Autres sites' };
    function nomPage(p) { return PAGES[p] || (/^tchat-/.test(p) ? 'Chat ' + p.replace(/^tchat-/, '').replace(/-/g, ' ') : p); }

    function evolution(n, avant) {
        if (!avant) return n ? '<small class="evf-neutre">nouveau</small>' : '';
        var v = Math.round((n - avant) / avant * 100);
        return '<small class="' + (v >= 0 ? 'evf-hausse' : 'evf-baisse') + '">' + (v >= 0 ? '▲ +' : '▼ ') + v + ' %</small>';
    }
    function tuile(lib, n, avant, aide) {
        return '<div class="evf-tuile"><span>' + lib + '</span><b>' + nb(n) + '</b>' + evolution(n, avant) + (aide ? '<em>' + aide + '</em>' : '') + '</div>';
    }
    // Liste classée avec barre (une seule couleur : c'est une grandeur, pas une identité)
    function classement(titre, lignes, vide) {
        var max = Math.max.apply(null, lignes.map(function (l) { return l.n; }).concat([1]));
        var tot = lignes.reduce(function (a, l) { return a + l.n; }, 0) || 1;
        return '<div class="evf-carte"><h3>' + titre + '</h3>' + (lignes.length ? '<ol class="evf-rang">' + lignes.map(function (l) {
            return '<li title="' + esc(l.nom) + ' : ' + nb(l.n) + ' (' + Math.round(l.n / tot * 100) + ' %)"><span class="evf-nom">' + (l.lien ? '<a href="' + esc(l.lien) + '">' + esc(l.nom) + '</a>' : esc(l.nom)) + '</span>' +
                '<span class="evf-barre"><i style="width:' + Math.max(2, l.n / max * 100) + '%"></i></span><b>' + nb(l.n) + '</b></li>';
        }).join('') + '</ol>' : '<p class="evf-vide">' + (vide || 'Pas encore de données.') + '</p>') + '</div>';
    }
    // Courbe des visites par jour : barres fines, survol = date + chiffres
    function graphique(d) {
        var jours = [], t = new Date(); t.setHours(12, 0, 0, 0);
        for (var i = d.jours - 1; i >= 0; i--) { var x = new Date(t); x.setDate(t.getDate() - i); jours.push(x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')); }
        var v = {}, p = {}; d.parJour.forEach(function (r) { (r.type === 'visite' ? v : p)[r.jour] = r.n; });
        var max = Math.max.apply(null, jours.map(function (j) { return v[j] || 0; }).concat([1]));
        var fmt = function (j) { return new Date(j + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); };
        return '<div class="evf-carte evf-large"><h3>Visites par jour <small>(survolez une barre)</small></h3><div class="evf-graph" role="img" aria-label="Visites par jour sur ' + d.jours + ' jours">' +
            jours.map(function (j) {
                var n = v[j] || 0;
                return '<div class="evf-col" tabindex="0" data-info="' + esc(fmt(j)) + ' · ' + nb(n) + ' visite' + (n > 1 ? 's' : '') + ' · ' + nb(p[j] || 0) + ' pages vues"><i style="height:' + (n ? Math.max(3, n / max * 100) : 0) + '%"></i></div>';
            }).join('') + '<div class="evf-bulle" hidden></div></div>' +
            '<div class="evf-axe"><span>' + fmt(jours[0]) + '</span><span>max ' + nb(max) + ' / jour</span><span>' + fmt(jours[jours.length - 1]) + '</span></div></div>';
    }
    function conseils(d) {
        var out = [], vis = d.totaux.visites || 0;
        var src = {}; d.sources.forEach(function (s) { src[s.cle] = s.n; });
        if (vis >= 20) {
            var g = Math.round((src.google || 0) / vis * 100);
            out.push(g < 25 ? 'Google n\'apporte que ' + g + ' % des visites : continuer les fiches vérifiées (chacune crée une page Google) et compléter horaires + description.' : 'Google apporte ' + g + ' % des visites : le référencement fonctionne, continuez à vérifier des fiches.');
            var mob = (d.appareils.filter(function (a) { return a.cle === 'mobile'; })[0] || {}).n || 0;
            if (mob / vis > 0.6) out.push(Math.round(mob / vis * 100) + ' % des visiteurs sont sur mobile : vérifiez chaque nouveauté sur téléphone en priorité.');
        }
        if (d.regions.length) out.push('Région la plus consultée dans le guide : ' + d.regions[0].nom + '. C\'est là qu\'il faut le plus de fiches complètes et de soirées.');
        var sansClic = d.fiches.filter(function (f) { return f.vues >= 10 && !Object.keys(f.clics).length; }).slice(0, 3);
        if (sansClic.length) out.push('Fiches très vues mais sans aucun clic (téléphone, site) : ' + sansClic.map(function (f) { return f.nom; }).join(', ') + '. Ajoutez téléphone et site pour qu\'elles servent.');
        if (!out.length) out.push('Les premières données arrivent : revenez dans quelques jours pour voir les tendances.');
        return '<div class="evf-carte evf-large evf-conseils"><h3><i class="fa-solid fa-lightbulb" aria-hidden="true"></i> Ce que ça veut dire</h3><ul>' + out.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('') + '</ul></div>';
    }
    function fichesHTML(f) {
        if (!f.length) return '<div class="evf-carte evf-large"><h3>Fiches du guide les plus vues</h3><p class="evf-vide">Pas encore de données.</p></div>';
        var c = function (x, k) { return x.clics[k] ? nb(x.clics[k]) : '<span class="evf-zero">0</span>'; };
        return '<div class="evf-carte evf-large"><h3>Fiches du guide les plus vues</h3><div class="evf-tableau"><table><thead><tr><th>Lieu</th><th>Vues</th><th title="Clics sur le téléphone">📞 Tél.</th><th title="Clics vers le site du lieu">🌐 Site</th><th title="Clics sur l\'itinéraire">🧭 Itinéraire</th><th title="Clics vers les réseaux sociaux">Réseaux</th></tr></thead><tbody>' +
            f.map(function (x) { return '<tr><td><a href="/lieu.html?l=' + encodeURIComponent(x.slug) + '">' + esc(x.nom) + '</a></td><td><b>' + nb(x.vues) + '</b></td><td>' + c(x, 'tel') + '</td><td>' + c(x, 'site') + '</td><td>' + c(x, 'itineraire') + '</td><td>' + c(x, 'reseau') + '</td></tr>'; }).join('') +
            '</tbody></table></div></div>';
    }
    async function charger() {
        var jours = $('#evFreqJours').value, zone = $('#evFreqContenu');
        zone.innerHTML = '<p class="evf-vide">Chargement…</p>';
        try {
            var d = typeof apiCall === 'function' ? await apiCall('/guide/equipe/stats?jours=' + jours) : null;
            if (!d) throw new Error();
            var pv = d.totaux.visites ? (d.totaux.pages / d.totaux.visites).toFixed(1).replace('.', ',') : '–';
            zone.innerHTML =
                '<div class="evf-tuiles">' + tuile('Visites', d.totaux.visites, d.precedent.visites, pv + ' pages par visite') + tuile('Pages vues', d.totaux.pages, d.precedent.pages) +
                tuile('Vues de fiches du guide', d.totaux.fiches, d.precedent.fiches) + tuile('Clics de contact', d.totaux.clics, d.precedent.clics, 'téléphone, site, itinéraire') + '</div>' +
                '<p class="evf-compare">Évolution comparée aux ' + d.jours + ' jours précédents.</p>' +
                '<div class="evf-grille">' + graphique(d) + conseils(d) +
                classement('D\'où viennent les visiteurs', d.sources.map(function (s) { return { nom: SOURCES[s.cle] || s.cle, n: s.n }; })) +
                classement('Appareils', d.appareils.map(function (s) { return { nom: s.cle === 'mobile' ? 'Téléphone / tablette' : 'Ordinateur', n: s.n }; })) +
                classement('Pages les plus vues', d.pages.map(function (s) { return { nom: nomPage(s.cle), n: s.n }; })) +
                classement('Pages d\'arrivée (1re page de la visite)', d.entrees.map(function (s) { return { nom: nomPage(s.cle), n: s.n }; })) +
                classement('Régions consultées dans le guide', d.regions.map(function (r) { return { nom: r.nom, n: r.n, lien: '/guide.html?region=' + encodeURIComponent(r.slug) }; })) +
                fichesHTML(d.fiches) + '</div>';
        } catch (e) { zone.innerHTML = '<p class="evf-vide">Statistiques indisponibles pour le moment.</p>'; }
    }
    // Bulle au survol / au focus d'une barre du graphique
    bloc.addEventListener('mouseover', montrer); bloc.addEventListener('focusin', montrer);
    bloc.addEventListener('mouseleave', function () { var b = $('.evf-bulle'); if (b) b.hidden = true; });
    function montrer(e) {
        var c = e.target.closest && e.target.closest('.evf-col'), b = $('.evf-bulle'); if (!b) return;
        if (!c) { if (!e.target.closest('.evf-graph')) b.hidden = true; return; }
        bloc.querySelectorAll('.evf-col.actif').forEach(function (x) { x.classList.remove('actif'); }); c.classList.add('actif');
        b.textContent = c.getAttribute('data-info'); b.hidden = false;
        var g = c.parentNode.getBoundingClientRect(), r = c.getBoundingClientRect();
        b.style.left = Math.min(Math.max(0, r.left - g.left + r.width / 2 - b.offsetWidth / 2), g.width - b.offsetWidth) + 'px';
    }
    $('#evFreqJours').addEventListener('change', charger);
    function demarrer() {
        var u = typeof getCurrentUser === 'function' && getCurrentUser();
        if (!u || (u.role !== 'moderator' && u.role !== 'super_admin')) return;
        bloc.hidden = false; charger();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();
