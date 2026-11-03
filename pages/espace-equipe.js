// E-VISIOCAM — Espace équipe : Vue d'ensemble « À traiter » (étape P1 de la refonte de l'administration).
// Réutilise les compteurs déjà fournis par le serveur (modération, guide, contact, salons…) : aucune donnée nouvelle.
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    if (!$('evxEspace')) return;
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!u) { location.href = 'login.html?redirect=espace-equipe.html'; return; }
    if (['moderator', 'super_admin', 'guide_editor', 'animateur'].indexOf(u.role) < 0) {
        $('evxEspace').innerHTML = '<div class="evx-contenu"><h1>Accès réservé</h1><p class="gl-intro">Cet espace est réservé à l\'équipe du site.</p><a class="gl-btn gl-btn-jaune" href="index.html">Retour à l\'accueil</a></div>';
        return;
    }
    var SUPER = u.role === 'super_admin', MOD = SUPER || u.role === 'moderator', GUIDE = MOD || u.role === 'guide_editor', ANIM = SUPER || u.role === 'animateur';
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var nb = function (n) { return Number(n || 0).toLocaleString('fr-FR'); };
    function lire(chemin) { return typeof apiCall === 'function' ? apiCall(chemin).catch(function () { return null; }) : Promise.resolve(null); }
    function public_(chemin) { return fetch(API_URL + chemin).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }
    function longueur(x) { return Array.isArray(x) ? x.length : 0; }

    $('evxBonjour').textContent = 'Bonjour ' + (u.username || '') + ' 👋';

    // Une carte « à traiter » : nombre, libellé, lien direct
    var PRIS = {};
    function carte(n, lib, lien, ico, inconnu, types) {
        var vide = !inconnu && !n;
        var pris = (types || []).reduce(function (a, t) { return a + (PRIS[t] || 0); }, 0);
        return '<a class="evx-carte' + (vide ? ' evx-carte-vide' : '') + '" href="' + lien + '">' +
            '<span class="evx-carte-ico" aria-hidden="true"><i class="fa-solid ' + ico + '"></i></span>' +
            '<span class="evx-carte-txt"><b>' + (inconnu ? '–' : nb(n)) + '</b><span>' + esc(lib) + '</span>' + (pris && n ? '<span class="evx-pris">✋ ' + nb(pris) + ' pris en charge</span>' : '') + '</span>' +
            '<i class="fa-solid fa-chevron-right evx-carte-fleche" aria-hidden="true"></i></a>';
    }
    function niveau(titre, aide, classe, cartes) {
        return '<div class="evx-niveau ' + classe + '"><h3>' + titre + ' <small>' + aide + '</small></h3><div class="evx-cartes">' + cartes.join('') + '</div></div>';
    }

    async function charger() {
        var r = await Promise.all([
            MOD ? lire('/mod/alertes/compte') : null, MOD ? lire('/mod/reports/count') : null, MOD ? lire('/mod/appeals/count') : null, MOD ? lire('/avatars/pending') : null,
            MOD ? lire('/equipe/candidatures/count') : null, GUIDE ? lire('/guide/moderation') : null,
            SUPER ? lire('/contact/admin/unread-count') : null, SUPER ? lire('/salons/access-requests') : null, GUIDE ? lire('/espace/prises') : null
        ]);
        PRIS = {}; ((r[8] && r[8].prises) || []).forEach(function (p) { PRIS[p.type] = (PRIS[p.type] || 0) + 1; });
        var al = r[0], rep = r[1], app = r[2], ph = r[3], cand = r[4], gu = r[5], con = r[6], vip = r[7];
        var c = {
            alertes: al ? al.ouvertes : null, signalements: rep ? rep.pending : null, contestations: app ? app.pending : null,
            photos: ph ? ph.total : null, candidatures: cand ? cand.pending : null,
            lieux: gu ? longueur(gu.lieux) : null, avis: gu ? longueur(gu.avis) : null, plans: gu ? longueur(gu.bonsPlans) : null,
            avisSignales: gu ? longueur(gu.signales) : null, soirees: gu ? longueur(gu.soirees) : null, corrections: gu ? longueur(gu.corrections) : null,
            contact: con ? con.count : null, vip: Array.isArray(vip) ? vip.filter(function (x) { return x.status === 'pending'; }).length : null
        };
        var html = (MOD ? niveau('Urgent', 'à regarder en premier', 'evx-urgent', [
                carte(c.alertes, 'Alertes de modération ouvertes', 'moderation.html#alertes', 'fa-triangle-exclamation', c.alertes == null, ['alerte']),
                carte(c.signalements, 'Signalements en attente', 'moderation.html#reports', 'fa-flag', c.signalements == null, ['signalement'])]) +
            niveau('Ordinaire', 'dans la journée', 'evx-ordinaire', [
                carte(c.contestations, 'Contestations de sanction', 'moderation.html#contestations', 'fa-scale-balanced', c.contestations == null, ['contestation']),
                carte(c.photos, 'Photos de profil à valider', 'moderation.html#photos', 'fa-image-portrait', c.photos == null, ['photo']),
                carte(c.candidatures, 'Candidatures de modérateur', 'moderation.html#candidatures', 'fa-user-plus', c.candidatures == null)]
                .concat(SUPER ? [carte(c.vip, 'Demandes d\'accès aux salons VIP', 'moderation-salons.html', 'fa-lock', c.vip == null),
                                 carte(c.contact, 'Messages de contact non lus', 'admin.html#contact', 'fa-envelope', c.contact == null)] : [])) : '') +
            (GUIDE ? niveau('Éditorial', 'guide libertin', 'evx-editorial', [
                carte(c.lieux, 'Lieux proposés', 'guide-equipe.html#glModeration', 'fa-location-dot', c.lieux == null, ['guide-lieu']),
                carte(c.avis, 'Avis à valider', 'guide-equipe.html#glModeration', 'fa-star', c.avis == null, ['guide-avis']),
                carte(c.avisSignales, 'Avis signalés', 'guide-equipe.html#glModeration', 'fa-comment-slash', c.avisSignales == null, ['guide-signalement']),
                carte(c.soirees, 'Soirées proposées', 'guide-equipe.html#glModeration', 'fa-calendar', c.soirees == null, ['guide-soiree']),
                carte(c.corrections, 'Fermetures et erreurs signalées', 'guide-equipe.html#glModeration', 'fa-pen-to-square', c.corrections == null, ['guide-correction']),
                carte(c.plans, 'Bons plans à valider', 'guide-equipe.html#glModeration', 'fa-lightbulb', c.plans == null, ['guide-bon-plan'])]) : '') +
            (ANIM && !SUPER ? niveau('Animation', 'vos outils', 'evx-ordinaire', [
                carte(null, 'Programme du site (soirées, quiz, blind tests)', 'communaute.html#programme', 'fa-calendar-days', true),
                carte(null, 'Radios du site', 'communaute.html#radios', 'fa-radio', true)]) : '');
        $('evxTraiter').innerHTML = html;
        var total = Object.keys(c).reduce(function (a, k) { return a + (c[k] || 0); }, 0);
        var urgents = (c.alertes || 0) + (c.signalements || 0);
        $('evxTotal').innerHTML = total ? '<b>' + nb(total) + '</b> en attente' + (urgents ? ' · <span class="evx-rouge">' + nb(urgents) + ' urgent' + (urgents > 1 ? 's' : '') + '</span>' : '') : '<span class="evx-vert"><i class="fa-solid fa-circle-check" aria-hidden="true"></i> Rien en attente</span>';
        document.title = (total ? '(' + total + ') ' : '') + 'Espace équipe | E-VISIOCAM';
        if (SUPER) chargerAdmin();
    }

    async function chargerAdmin() {
        var r = await Promise.all([lire('/admin/stats?days=1'), lire('/guide/equipe/stats?jours=1'), public_('/maintenance'), lire('/admin/backup')]);
        var st = r[0], fr = r[1], ma = r[2], bk = r[3];
        var t = function (lib, n, aide) { return '<div class="evx-tuile"><span>' + lib + '</span><b>' + (n == null ? '–' : nb(n)) + '</b>' + (aide ? '<em>' + aide + '</em>' : '') + '</div>'; };
        var auj = st && st.aujourdhui || {};
        $('evxJour').innerHTML = t('Connectés maintenant', st && st.maintenant ? st.maintenant.membres : null, st && st.maintenant ? nb(st.maintenant.lives) + ' caméra' + (st.maintenant.lives > 1 ? 's' : '') + ' en direct' : '') +
            t('Inscriptions', st ? auj.inscriptions : null) + t('Membres actifs', st ? auj.actifs : null) +
            t('Visites du site', fr && fr.totaux ? fr.totaux.visites : null, fr && fr.totaux ? nb(fr.totaux.clics) + ' clics vers les clubs' : '');
        $('evxJourBloc').hidden = false;
        var etat = function (ok, titre, texte, lien) { return '<a class="evx-etat ' + (ok ? 'evx-ok' : 'evx-ko') + '" href="' + lien + '"><i class="fa-solid ' + (ok ? 'fa-circle-check' : 'fa-circle-exclamation') + '" aria-hidden="true"></i><span><b>' + titre + '</b><small>' + esc(texte) + '</small></span></a>'; };
        var dateFr = function (d) { return new Date(d).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); };
        var sauvOk = bk && bk.lastOk && !bk.lastError && (Date.now() - Date.parse(bk.lastOk)) < 36 * 3600 * 1000;
        $('evxSysteme').innerHTML =
            etat(!(ma && ma.enabled), 'Site ' + (ma && ma.enabled ? 'en maintenance' : 'ouvert'), ma && ma.enabled ? (ma.message || 'Les visiteurs voient la page de maintenance') : 'Accessible à tous', 'admin.html#systeme') +
            etat(sauvOk, 'Sauvegarde', !bk ? 'État inconnu' : bk.lastError ? 'Erreur : ' + bk.lastError : bk.lastOk ? 'Dernière réussie : ' + dateFr(bk.lastOk) + (bk.emailConfigure ? '' : ' (envoi par e-mail non configuré)') : 'Aucune sauvegarde pour l\'instant', 'admin.html#systeme');
        $('evxSystemeBloc').hidden = false;
    }

    $('evxActualiser').addEventListener('click', charger);
    charger();
    setInterval(function () { if (!document.hidden) charger(); }, 60000);
})();
