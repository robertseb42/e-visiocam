// ============================================================
// MODÉRATION — Alertes automatiques (onglet « Alertes »)
// ------------------------------------------------------------
//  GET /api/mod/alertes?status=&type=&page=   liste filtrée
//  GET /api/mod/alertes/compte                compteur du badge
//  PUT /api/mod/alertes/:id { status, commentaire }
// Une alerte est un signal à vérifier, jamais une preuve : l'équipe ouvre la fiche et décide.
// Temps réel : moderation.js relaie l'événement socket « mod:alerte » à EvcAlertes.nouvelle().
// CSP stricte : aucun code inline ; tout texte venant du serveur est échappé.
// ============================================================
(function () {
    'use strict';

    var TYPES = {
        contournement: 'Contournement de sanction possible',
        rafale_mp: 'Rafale de messages privés',
        signalements_multiples: 'Signalements multiples',
        multi_comptes_bonus: 'Comptes multiples (bonus)'
    };
    var ICONES = { contournement: 'fa-user-secret', rafale_mp: 'fa-envelopes-bulk', signalements_multiples: 'fa-flag', multi_comptes_bonus: 'fa-users-rays' };
    var STATUTS = { nouvelle: ['evm-b-danger', 'Nouvelle'], vue: ['evm-b-warn', 'Vue'], traitee: ['evm-b-ok', 'Traitée'] };
    var SANCTIONS = { ban: 'banni', kick: 'exclu' };
    var etat = { status: 'ouvertes', type: '', page: 1 };
    var cache = [];
    var seq = 0;

    function $(id) { return document.getElementById(id); }
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t); }
    function U() { return window.EvcFicheMembre ? EvcFicheMembre.util : null; }
    function dateCourte(v) { return U() ? U().dateCourte(v) : String(v || ''); }
    function relatif(v) { return U() ? U().relatif(v) : ''; }
    function nf(n) { return new Intl.NumberFormat('fr-FR').format(n || 0); }
    function lien(id, nom) {
        return '<button type="button" class="evm-lien" style="padding:0" data-fiche-membre="' + Number(id) + '">' + esc(nom || ('#' + id)) + '</button>';
    }

    // ---------- Compteur (badge de l'onglet) ----------
    function compter() {
        return apiCall('/mod/alertes/compte').then(majBadge).catch(function () {});
    }
    function majBadge(c) {
        var b = $('alertesBadge');
        if (!b || !c) return;
        b.textContent = nf(c.ouvertes);
        b.classList.toggle('hidden', !c.ouvertes);
        var bouton = $('alertesTabBtn');
        if (bouton) bouton.setAttribute('aria-label', 'Alertes : ' + (c.ouvertes || 0) + ' ouverte' + (c.ouvertes > 1 ? 's' : ''));
    }

    // ---------- Liste ----------
    function charger() {
        var liste = $('alListe');
        if (!liste) return;
        var p = new URLSearchParams();
        if (etat.status) p.set('status', etat.status);
        if (etat.type) p.set('type', etat.type);
        p.set('page', String(etat.page));
        var n = ++seq;
        liste.setAttribute('aria-busy', 'true');
        if (!cache.length) liste.innerHTML = '<p class="evm-vide"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Chargement…</p>';
        return apiCall('/mod/alertes?' + p.toString()).then(function (d) {
            if (n !== seq) return;
            cache = d.alertes || [];
            majBadge(d.compteurs);
            $('alResume').textContent = nf(d.total) + ' alerte' + (d.total > 1 ? 's' : '') + (d.total ? ' · page ' + d.page + ' sur ' + d.pages : '');
            liste.innerHTML = cache.length ? cache.map(carte).join('') : '<p class="evm-vide">Aucune alerte' + (etat.status === 'ouvertes' ? ' ouverte' : '') + '.</p>';
            pages(d);
        }).catch(function (err) {
            if (n !== seq) return;
            liste.innerHTML = '<p class="evm-vide" style="color:var(--m-danger)">' + esc(err.message) + '</p>';
        }).then(function () { liste.removeAttribute('aria-busy'); });
    }

    function detail(a) {
        var d = a.details || {};
        switch (a.type) {
            case 'contournement':
                return 'Même connexion Internet que : ' + (d.comptes || []).map(function (c) {
                    return lien(c.id, c.username) + ' <span class="evm-sous">(' + esc(SANCTIONS[c.sanction] || c.sanction) + (c.definitif ? ' définitivement' : '') + ', lien ' + esc(c.force) + ')</span>';
                }).join(', ') + (d.force === 'faible' ? '<div class="evm-sous" style="margin-top:2px">Lien faible : même connexion seulement (réseau partagé possible).</div>' : '');
            case 'rafale_mp':
                return nf(d.messages) + ' messages privés à ' + nf(d.destinataires) + ' personnes en ' + nf(d.minutes) + ' minutes' +
                    (d.compteCreeLe ? ' · compte créé ' + esc(relatif(d.compteCreeLe)) : '');
            case 'signalements_multiples':
                return nf(d.auteurs) + ' membres différents l\'ont signalé en ' + nf(d.heures) + ' h (' + nf(d.signalements) + ' signalement' + (d.signalements > 1 ? 's' : '') + ')';
            case 'multi_comptes_bonus':
                return nf(d.nombre) + ' comptes créés depuis la même connexion en ' + nf(d.jours) + ' jours : ' + (d.comptes || []).map(function (c) { return lien(c.id, c.username); }).join(', ');
            default: return '';
        }
    }

    function carte(a) {
        var st = STATUTS[a.statut] || ['', a.statut];
        var h = '<article class="evm-carte" data-alerte="' + Number(a.id) + '" style="padding:12px 14px">' +
            '<div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">' +
                '<div style="min-width:0"><b><i class="fa-solid ' + (ICONES[a.type] || 'fa-bell') + '" aria-hidden="true" style="margin-right:6px"></i>' + esc(TYPES[a.type] || a.libelle || a.type) + '</b>' +
                ' · ' + (a.userId ? lien(a.userId, a.pseudo) : '<span class="evm-sous">compte supprimé</span>') + '</div>' +
                '<div class="evm-badges" style="margin-top:0"><span class="evm-badge ' + st[0] + '">' + esc(st[1]) + '</span>' +
                '<span class="evm-sous" title="' + esc(dateCourte(a.date)) + '">' + esc(relatif(a.date)) + '</span></div></div>' +
            '<p style="margin-top:6px;font-size:12px">' + detail(a) + '</p>';
        if (a.statut === 'traitee') {
            h += '<p class="evm-sous" style="margin-top:6px">Traitée par ' + esc(a.traitePar || '?') + ' le ' + esc(dateCourte(a.traiteLe)) + (a.commentaire ? ' — « ' + esc(a.commentaire) + ' »' : '') + '</p>';
        }
        h += '<div class="evm-boutons" style="justify-content:flex-start;flex-wrap:wrap;margin-top:8px">';
        if (a.userId) h += '<button type="button" class="evm-btn evm-btn-ghost" data-al="fiche" data-id="' + Number(a.id) + '">Voir la fiche</button>';
        if (a.statut !== 'traitee') h += '<button type="button" class="evm-btn evm-btn-primaire" data-al="traiter" data-id="' + Number(a.id) + '">Marquer comme traitée</button>';
        else h += '<button type="button" class="evm-btn evm-btn-ghost" data-al="rouvrir" data-id="' + Number(a.id) + '">Rouvrir</button>';
        return h + '</div></article>';
    }

    function pages(d) {
        var nav = $('alPages');
        if (!nav) return;
        if ((d.pages || 1) <= 1) { nav.innerHTML = ''; return; }
        nav.innerHTML = '<button type="button" class="evm-btn evm-btn-ghost" data-al-page="' + (d.page - 1) + '"' + (d.page <= 1 ? ' disabled' : '') + '>Précédente</button>' +
            '<span>Page <b>' + d.page + '</b> sur ' + d.pages + '</span>' +
            '<button type="button" class="evm-btn evm-btn-ghost" data-al-page="' + (d.page + 1) + '"' + (d.page >= d.pages ? ' disabled' : '') + '>Suivante</button>';
    }

    function changer(id, status, commentaire) {
        return apiCall('/mod/alertes/' + id, { method: 'PUT', body: JSON.stringify({ status: status, commentaire: commentaire || '' }) })
            .then(function (r) { majBadge(r.compteurs); return r; });
    }

    function traiter(a) {
        if (!window.EvcFicheMembre) return;
        EvcFicheMembre.dialogueMotif({
            titre: 'Marquer l\'alerte comme traitée',
            texte: (TYPES[a.type] || a.type) + (a.pseudo ? ' · ' + a.pseudo : '') + '. Le commentaire est gardé dans le journal des actions.',
            motifLibelle: 'Commentaire', motifFacultatif: true,
            motifExemple: 'Ex. : vérifié, même famille ; ou : compte banni pour contournement',
            motifAide: 'Facultatif. Visible par l\'équipe seulement.',
            bouton: 'Marquer comme traitée',
            valider: function (commentaire) {
                return changer(a.id, 'traitee', commentaire).then(function () { toast('✅ Alerte traitée'); charger(); });
            }
        });
    }

    function brancher() {
        var liste = $('alListe');
        if (!liste) return;
        $('alStatut').addEventListener('change', function () { etat.status = $('alStatut').value; etat.page = 1; charger(); });
        $('alType').addEventListener('change', function () { etat.type = $('alType').value; etat.page = 1; charger(); });
        $('alRafraichir').addEventListener('click', charger);
        $('alPages').addEventListener('click', function (e) {
            var b = e.target.closest('[data-al-page]');
            if (b && !b.disabled) { etat.page = Number(b.getAttribute('data-al-page')); charger(); }
        });
        liste.addEventListener('click', function (e) {
            var b = e.target.closest('[data-al]');
            if (!b) return;
            var a = cache.find(function (x) { return x.id === Number(b.getAttribute('data-id')); });
            if (!a) return;
            var nom = b.getAttribute('data-al');
            if (nom === 'fiche') {
                if (window.EvcFicheMembre) EvcFicheMembre.ouvrir(a.userId, { api: '/mod', depuis: b });
                if (a.statut === 'nouvelle') changer(a.id, 'vue').then(function () { a.statut = 'vue'; var c = liste.querySelector('[data-alerte="' + a.id + '"]'); if (c) c.outerHTML = carte(a); }).catch(function () {});
            } else if (nom === 'traiter') traiter(a);
            else if (nom === 'rouvrir') changer(a.id, 'vue').then(charger).catch(function (err) { toast(err.message, 'error'); });
        });
        compter();
        setInterval(compter, 60000);
    }

    // Alerte reçue en direct (socket « mod:alerte »)
    function nouvelle(data) {
        data = data || {};
        toast('🚨 ' + (TYPES[data.type] || 'Nouvelle alerte') + (data.pseudo ? ' : ' + data.pseudo : ''), 'warning');
        var tab = $('tab-alertes');
        if (tab && !tab.classList.contains('hidden')) charger(); else compter();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher); else brancher();
    window.EvcAlertes = { charger: charger, compter: compter, nouvelle: nouvelle };
})();
