// ============================================================
// PANNEAU ADMIN — Gestion des membres
// ------------------------------------------------------------
//  • Liste filtrée / triée / paginée par le serveur (GET /api/admin/users?…)
//  • Fiche d'un membre dans un tiroir : module partagé fiche-membre.js (EvcFicheMembre),
//    aussi utilisé par l'espace Modérateur (moderation.html)
//  • Actions lisibles : « Voir la fiche », « Sanctionner » et un menu « … » avec libellés.
//    Toute action lourde demande un MOTIF (5 caractères au moins), vérifié aussi par le serveur.
//  • Onglet « Journal des actions » (GET /api/admin/audit)
// CSP stricte : aucun code inline, tout est branché ici avec addEventListener.
// Tout texte venant du serveur est échappé (esc) avant d'être inséré.
// ============================================================
(function () {
    'use strict';

    var F = window.EvcFicheMembre;
    var U = F.util;
    var esc = U.esc, dateCourte = U.dateCourte, jour = U.jour, relatif = U.relatif, badgeRole = U.badgeRole, initiale = U.initiale, peutAgir = U.peutAgir, nf = U.nf;
    var detailsTexte = F.detailsTexte;

    var filtres = { q: '', role: '', statut: '', inscrits: '', tri: 'inscription', ordre: '', enLigne: false, signale: false,
        emailNonVerifie: false, photoEnAttente: false, inactifs: false, page: 1, limit: 50 };
    var liste = { users: [], total: 0, pages: 1 };
    var seq = 0;

    function $(id) { return document.getElementById(id); }
    function moi() { try { return getCurrentUser() || {}; } catch (e) { return {}; } }
    function trouver(id) { return F.trouver(id); }
    function ouvrirFiche(id, depuis) { return F.ouvrir(id, { api: '/admin', depuis: depuis }); }
    function ouvrirMenu(u, bouton) { return F.ouvrirMenu(u, bouton); }

    // Fiche partagée : la page Admin lit /api/admin/… ; une action recharge la liste et le journal
    F.configurer({
        api: '/admin',
        trouver: function (id) { return liste.users.find(function (x) { return x.id === id; }) || null; },
        rafraichir: function () { charger(); try { if (typeof loadLogs === 'function') loadLogs(); } catch (e) {} }
    });

    // ============================================================
    // LISTE
    // ============================================================
    function chaine() {
        var p = new URLSearchParams();
        if (filtres.q) p.set('q', filtres.q);
        ['role', 'statut', 'inscrits', 'ordre'].forEach(function (k) { if (filtres[k]) p.set(k, filtres[k]); });
        p.set('tri', filtres.tri || 'inscription');
        if (filtres.enLigne) p.set('enLigne', '1');
        if (filtres.signale) p.set('signale', '1');
        if (filtres.emailNonVerifie) p.set('emailNonVerifie', '1');
        if (filtres.photoEnAttente) p.set('photoEnAttente', '1');
        if (filtres.inactifs) p.set('inactifs', '30j');
        p.set('page', String(filtres.page));
        p.set('limit', String(filtres.limit));
        return p.toString();
    }

    function charger() {
        var tbody = $('usersTable');
        if (!tbody) return;
        var n = ++seq;
        if (!liste.users.length) tbody.innerHTML = '<tr><td colspan="6" class="evm-vide"><i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i> Chargement...</td></tr>';
        tbody.setAttribute('aria-busy', 'true');
        return apiCall('/admin/users?' + chaine()).then(function (d) {
            if (n !== seq) return;
            liste = d;
            if (d.page > d.pages && d.total) { filtres.page = d.pages; return charger(); }
            afficherListe();
        }).catch(function (err) {
            if (n !== seq) return;
            tbody.innerHTML = '<tr><td colspan="6" class="evm-vide" style="color:var(--m-danger)">' + esc(err.message) + '</td></tr>';
        }).then(function () { tbody.removeAttribute('aria-busy'); });
    }

    function badges(u) {
        var b = [];
        if (u.enLigne) b.push('<span class="evm-badge evm-b-ok" title="Connecté en ce moment">🟢 en ligne</span>');
        if (u.signalements > 0) b.push('<span class="evm-badge ' + (u.signalements >= 3 ? 'evm-b-danger' : 'evm-b-warn') + '" title="Signalements en attente ou des 30 derniers jours">⚠️ ' + nf.format(u.signalements) + ' signalement' + (u.signalements > 1 ? 's' : '') + '</span>');
        if (!u.email_verified) b.push('<span class="evm-badge evm-b-warn" title="Adresse e-mail pas encore confirmée">✉️ non vérifié</span>');
        if (u.photo === 'pending') b.push('<span class="evm-badge evm-b-info" title="Photo de profil à valider">📷 photo en attente</span>');
        if (Number(u.must_change_password) === 1) b.push('<span class="evm-badge evm-b-warn" title="Mot de passe réinitialisé : à changer à la prochaine connexion">🔑 à changer</span>');
        return b.length ? '<div class="evm-badges">' + b.join('') + '</div>' : '';
    }

    function boutonsActions(u, dansFiche) {
        var h = '<div class="evm-boutons">';
        if (!dansFiche) h += '<button type="button" class="evm-btn evm-btn-ghost" data-evm="fiche" data-id="' + u.id + '">Voir la fiche</button>';
        if (peutAgir(u)) h += '<button type="button" class="evm-btn evm-btn-danger" data-evm="sanction" data-id="' + u.id + '">Sanctionner</button>';
        h += '<button type="button" class="evm-btn evm-btn-ghost evm-btn-icone" data-evm="menu" data-id="' + u.id + '" aria-haspopup="menu" aria-expanded="false" aria-label="Plus d\'actions pour ' + esc(u.username) + '" title="Plus d\'actions"><span aria-hidden="true" style="font-size:18px;line-height:1">⋯</span></button>';
        return h + '</div>';
    }

    function afficherListe() {
        var tbody = $('usersTable');
        var u = liste.users || [];
        var m = moi();
        $('userCount').textContent = nf.format(liste.total) + ' membre' + (liste.total > 1 ? 's' : '') + (filtresActifs() ? ' correspondant aux filtres' : '') +
            (liste.total ? ' · page ' + liste.page + ' sur ' + liste.pages : '');
        if (!u.length) {
            tbody.innerHTML = '<tr><td colspan="6" class="evm-vide">Aucun membre ne correspond à ces critères.</td></tr>';
        } else {
            tbody.innerHTML = u.map(function (x) {
                var estMoi = m.id === x.id;
                return '<tr class="evm-ligne" data-id="' + x.id + '">' +
                    '<td class="evm-td-membre"><div class="evm-membre"><div class="evm-av" aria-hidden="true">' + initiale(x.username) + '</div><div style="min-width:0">' +
                        '<div class="evm-nom">' + esc(x.username) + (estMoi ? ' <span class="evm-sous">(vous)</span>' : '') + ' <span class="evm-sous">#' + x.id + '</span></div>' +
                        (x.email ? '<div class="evm-sous">' + esc(x.email) + '</div>' : '') + badges(x) + '</div></div></td>' +
                    '<td data-label="Rôle">' + badgeRole(x.role) + '</td>' +
                    '<td data-label="Statut">' + (window.EvcSanction ? EvcSanction.etiquette(x) : esc(x.status)) + '</td>' +
                    '<td data-label="Dernière activité"><span title="' + esc(x.derniereActivite ? dateCourte(x.derniereActivite) : 'Jamais connecté') + '">' + esc(relatif(x.derniereActivite)) + '</span>' +
                        '<div class="evm-sous">inscrit le ' + esc(jour(x.created_at)) + '</div></td>' +
                    '<td data-label="Crédits" class="evm-num">' + nf.format(x.credits || 0) + '</td>' +
                    '<td class="evm-td-actions">' + boutonsActions(x) + '</td></tr>';
            }).join('');
        }
        afficherPages($('evmPages'), liste, function (p) { filtres.page = p; charger(); }, function (l) { filtres.limit = l; filtres.page = 1; charger(); }, filtres.limit);
    }

    function afficherPages(nav, d, allerA, changerLimite, limite) {
        if (!nav) return;
        var p = d.page || 1, n = d.pages || 1;
        nav.innerHTML =
            '<button type="button" class="evm-btn evm-btn-ghost" data-page="' + (p - 1) + '"' + (p <= 1 ? ' disabled' : '') + '><i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Précédente</button>' +
            '<span>Page <b>' + p + '</b> sur ' + n + '</span>' +
            '<button type="button" class="evm-btn evm-btn-ghost" data-page="' + (p + 1) + '"' + (p >= n ? ' disabled' : '') + '>Suivante <i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
            (changerLimite ? '<label>Par page <select data-limite>' + [25, 50, 100, 200].map(function (l) { return '<option' + (l === limite ? ' selected' : '') + '>' + l + '</option>'; }).join('') + '</select></label>' : '');
        nav.querySelectorAll('[data-page]').forEach(function (b) { b.addEventListener('click', function () { allerA(Number(b.getAttribute('data-page'))); }); });
        var s = nav.querySelector('[data-limite]');
        if (s) s.addEventListener('change', function () { changerLimite(Number(s.value)); });
    }

    function filtresActifs() {
        return !!(filtres.q || filtres.role || filtres.statut || filtres.inscrits || filtres.enLigne || filtres.signale || filtres.emailNonVerifie || filtres.photoEnAttente || filtres.inactifs);
    }

    function brancherFiltres() {
        var attente;
        var q = $('evmQ');
        if (!q) return;
        q.addEventListener('input', function () {
            clearTimeout(attente);
            attente = setTimeout(function () { filtres.q = q.value.trim(); filtres.page = 1; charger(); }, 300);
        });
        [['evmRole', 'role'], ['evmStatut', 'statut'], ['evmInscrits', 'inscrits'], ['evmTri', 'tri'], ['evmOrdre', 'ordre']].forEach(function (c) {
            $(c[0]).addEventListener('change', function () { filtres[c[1]] = $(c[0]).value; filtres.page = 1; charger(); });
        });
        [['evmEnLigne', 'enLigne'], ['evmSignale', 'signale'], ['evmNonVerifie', 'emailNonVerifie'], ['evmPhoto', 'photoEnAttente'], ['evmInactifs', 'inactifs']].forEach(function (c) {
            $(c[0]).addEventListener('change', function () { filtres[c[1]] = $(c[0]).checked; filtres.page = 1; charger(); });
        });
        $('evmReset').addEventListener('click', function () {
            q.value = ''; ['evmRole', 'evmStatut', 'evmInscrits', 'evmOrdre'].forEach(function (id) { $(id).value = ''; });
            $('evmTri').value = 'inscription';
            ['evmEnLigne', 'evmSignale', 'evmNonVerifie', 'evmPhoto', 'evmInactifs'].forEach(function (id) { $(id).checked = false; });
            Object.assign(filtres, { q: '', role: '', statut: '', inscrits: '', tri: 'inscription', ordre: '', enLigne: false, signale: false, emailNonVerifie: false, photoEnAttente: false, inactifs: false, page: 1 });
            charger();
        });
        $('evmRafraichir').addEventListener('click', function () { if (typeof loadUsers === 'function') loadUsers(); else charger(); });

        // Clic sur une ligne : la fiche ; sur un bouton : son action
        $('usersTable').addEventListener('click', function (e) {
            var b = e.target.closest('[data-evm]');
            if (b) { e.stopPropagation(); action(b.getAttribute('data-evm'), Number(b.getAttribute('data-id')), b); return; }
            if (e.target.closest('a, button, input, select, label')) return;
            var tr = e.target.closest('tr[data-id]');
            if (tr) ouvrirFiche(Number(tr.getAttribute('data-id')), tr.querySelector('[data-evm="fiche"]'));
        });
    }

    function action(nom, id, bouton) {
        var u = trouver(id);
        if (nom === 'fiche') return ouvrirFiche(id, bouton);
        if (nom === 'sanction') return sanctionner(u);
        if (nom === 'menu') return ouvrirMenu(u, bouton);
    }

    function sanctionner(u, type) { return F.sanctionner(u, type); }

    // ============================================================
    // JOURNAL DES ACTIONS (onglet)
    // ============================================================
    var journal = { acteur: '', cible: '', action: '', page: 1 };
    var seqJ = 0;

    function chargerJournal() {
        var corps = $('evaListe');
        if (!corps) return;
        var p = new URLSearchParams();
        if (journal.acteur) p.set('acteur', journal.acteur);
        if (journal.cible) p.set('cible', journal.cible);
        if (journal.action) p.set('action', journal.action);
        p.set('page', String(journal.page)); p.set('limit', '50');
        var n = ++seqJ;
        corps.setAttribute('aria-busy', 'true');
        return apiCall('/admin/audit?' + p.toString()).then(function (d) {
            if (n !== seqJ) return;
            var sel = $('evaAction');
            var actuel = journal.action;
            sel.innerHTML = '<option value="">Toutes</option>' + (d.actions || []).map(function (a) { return '<option value="' + esc(a.action) + '"' + (a.action === actuel ? ' selected' : '') + '>' + esc(a.libelle) + '</option>'; }).join('');
            $('evaResume').textContent = nf.format(d.total) + ' action' + (d.total > 1 ? 's' : '') + ' enregistrée' + (d.total > 1 ? 's' : '');
            corps.innerHTML = d.entrees.length ? d.entrees.map(function (e) {
                var det = detailsTexte(e);
                return '<tr><td data-label="Date">' + esc(dateCourte(e.date)) + '</td>' +
                    '<td data-label="Auteur"><b>' + esc(e.acteur || '—') + '</b></td>' +
                    '<td data-label="Action">' + esc(e.libelle) + '</td>' +
                    '<td data-label="Membre">' + (e.cibleId ? '<button type="button" class="evm-lien" style="padding:0" data-eva-fiche="' + Number(e.cibleId) + '">' + esc(e.cible || '#' + e.cibleId) + '</button>' : esc(e.cible || '—')) + '</td>' +
                    '<td data-label="Motif et détails">' + (e.motif ? esc(e.motif) : '<span class="evm-sous">—</span>') + (det ? '<div class="evm-details">' + esc(det) + '</div>' : '') + '</td></tr>';
            }).join('') : '<tr><td colspan="5" class="evm-vide">Aucune action ne correspond.</td></tr>';
            afficherPages($('evaPages'), d, function (pg) { journal.page = pg; chargerJournal(); });
        }).catch(function (err) {
            if (n !== seqJ) return;
            corps.innerHTML = '<tr><td colspan="5" class="evm-vide" style="color:var(--m-danger)">' + esc(err.message) + '</td></tr>';
        }).then(function () { corps.removeAttribute('aria-busy'); });
    }

    function brancherJournal() {
        var form = $('evaFiltres');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            journal.acteur = $('evaActeur').value.trim(); journal.cible = $('evaCible').value.trim(); journal.action = $('evaAction').value; journal.page = 1;
            chargerJournal();
        });
        $('evaAction').addEventListener('change', function () { journal.action = $('evaAction').value; journal.page = 1; chargerJournal(); });
        $('evaReset').addEventListener('click', function () {
            $('evaActeur').value = ''; $('evaCible').value = ''; $('evaAction').value = '';
            journal = { acteur: '', cible: '', action: '', page: 1 }; chargerJournal();
        });
        $('evaListe').addEventListener('click', function (e) {
            var b = e.target.closest('[data-eva-fiche]');
            if (b) ouvrirFiche(Number(b.getAttribute('data-eva-fiche')), b);
        });
    }

    // Alertes de modération ouvertes (contournement, rafales de MP…) : compteur sur le bouton du haut
    function compterAlertes() {
        var b = $('alertesModerationBadge');
        if (!b) return;
        apiCall('/mod/alertes/compte').then(function (c) {
            b.textContent = nf.format(c.ouvertes || 0);
            b.classList.toggle('hidden', !c.ouvertes);
            var lien = $('alertesModeration');
            if (lien) lien.setAttribute('aria-label', 'Alertes de modération : ' + (c.ouvertes || 0) + ' ouverte' + (c.ouvertes > 1 ? 's' : ''));
        }).catch(function () {});
    }

    function init() { brancherFiltres(); brancherJournal(); compterAlertes(); setInterval(compterAlertes, 60000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

    window.EvcMembres = {
        charger: charger, ouvrirFiche: ouvrirFiche, fermerFiche: F.fermer, chargerJournal: chargerJournal,
        changerRole: F.changerRole, reinitialiserMdp: F.reinitialiserMdp, supprimer: F.supprimer, sanctionner: sanctionner
    };
})();
