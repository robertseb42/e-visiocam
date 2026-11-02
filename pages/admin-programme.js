// ============================================================
// E-VISIOCAM — Panneau Admin > Programme (rendez-vous réguliers : soirées, quiz, blind tests)
// API Super Admin : GET/POST /api/evenements, PUT/DELETE /api/evenements/:id
// Les heures sont saisies et affichées à l'heure de Paris (champ debut_local), quel que soit
// le fuseau de l'ordinateur de l'administrateur.
// Dépend de auth-api.js (apiCall, showToast). Aucun script inline (CSP stricte).
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    if (!$('tab-programme')) return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };
    var liste = [], salonsCharges = false;
    var fJour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long' });
    var fDate = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    var fHeure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    var LIB = { soiree: 'Soirée', quiz: 'Quiz', blindtest: 'Blind test', autre: 'Autre' };

    function quand(ev) {
        var d = new Date(ev.debut);
        var h = fHeure.format(d) + ' · ' + ev.duree_min + ' min';
        return ev.recurrence === 'hebdo' ? 'Chaque ' + fJour.format(d) + ' à ' + h + '<br><small>depuis le ' + esc(fDate.format(d)) + '</small>' : esc(fDate.format(d)) + ' à ' + h;
    }

    async function chargerSalons() {
        if (salonsCharges) return;
        try {
            var d = await apiCall('/salons/list');
            var publics = (d.salons || []).filter(function (s) { return !s.isPrivate; });
            $('evpSalon').innerHTML = publics.map(function (s) { return '<option value="' + esc(s.slug) + '">' + esc((s.icon || '') + ' ' + s.name) + '</option>'; }).join('');
            salonsCharges = true;
        } catch (e) {
            $('evpSalon').innerHTML = '<option value="general">Salon Général</option><option value="musique">Salon Musique</option>';
        }
    }

    async function charger() {
        chargerSalons();
        $('evpListe').innerHTML = '<tr><td colspan="6" class="evm-vide">Chargement...</td></tr>';
        try {
            var d = await apiCall('/evenements');
            liste = d.evenements || [];
            rendre();
        } catch (e) {
            $('evpListe').innerHTML = '<tr><td colspan="6" class="evm-vide">' + esc(e.message) + '</td></tr>';
        }
    }

    function rendre() {
        $('evpResume').textContent = liste.length + ' rendez-vous · ' + liste.filter(function (e) { return e.actif; }).length + ' actif(s)';
        if (!liste.length) { $('evpListe').innerHTML = '<tr><td colspan="6" class="evm-vide">Aucun rendez-vous. Créez le premier !</td></tr>'; return; }
        $('evpListe').innerHTML = liste.map(function (ev) {
            return '<tr data-id="' + ev.id + '">' +
                '<td data-label="Rendez-vous"><strong>' + esc(ev.titre) + '</strong><br><small>' + esc(LIB[ev.type] || ev.type) + (ev.description ? ' · ' + esc(ev.description) : '') + '</small></td>' +
                '<td data-label="Quand">' + quand(ev) + '</td>' +
                '<td data-label="Salon">' + esc(ev.salon_icone + ' ' + ev.salon_nom) + '</td>' +
                '<td data-label="Rappels">' + (ev.inscrits || 0) + '</td>' +
                '<td data-label="État">' + (ev.actif ? '🟢 Actif' : '⏸️ En pause') + '</td>' +
                '<td data-label="Actions" style="white-space:nowrap">' +
                    '<button type="button" class="evm-btn evm-btn-ghost" data-evp="modifier" aria-label="Modifier ' + esc(ev.titre) + '"><i class="fa-solid fa-pen" aria-hidden="true"></i> Modifier</button> ' +
                    '<button type="button" class="evm-btn evm-btn-ghost" data-evp="pause" aria-label="' + (ev.actif ? 'Mettre en pause ' : 'Réactiver ') + esc(ev.titre) + '">' + (ev.actif ? 'Pause' : 'Réactiver') + '</button> ' +
                    '<button type="button" class="evm-btn evm-btn-danger" data-evp="supprimer" aria-label="Supprimer ' + esc(ev.titre) + '"><i class="fa-solid fa-trash" aria-hidden="true"></i> Supprimer</button>' +
                '</td></tr>';
        }).join('');
    }

    // Prochaine heure ronde (+1 h), à l'heure de Paris, au format du champ datetime-local
    function parDefaut() {
        var p = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit' })
            .formatToParts(new Date(Date.now() + 3600000)).forEach(function (x) { p[x.type] = x.value; });
        return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':00';
    }

    async function ouvrir(ev) {
        await chargerSalons();
        $('evpForm').hidden = false;
        $('evpId').value = ev ? ev.id : '';
        $('evpTitre').value = ev ? ev.titre : '';
        $('evpType').value = ev ? ev.type : 'soiree';
        $('evpSalon').value = ev ? ev.salon_slug : 'musique';
        $('evpDebut').value = ev ? ev.debut_local : parDefaut();
        $('evpDuree').value = ev ? ev.duree_min : 60;
        $('evpRecurrence').value = ev ? ev.recurrence : 'hebdo';
        $('evpActif').value = ev && !ev.actif ? '0' : '1';
        $('evpDescription').value = ev ? ev.description : '';
        $('evpEnregistrer').textContent = ev ? 'Enregistrer les modifications' : 'Créer le rendez-vous';
        $('evpTitre').focus();
    }
    function fermer() { $('evpForm').hidden = true; $('evpForm').reset(); $('evpId').value = ''; }

    $('evpNouveau').addEventListener('click', function () { ouvrir(null); });
    $('evpAnnuler').addEventListener('click', fermer);
    $('evpForm').addEventListener('submit', async function (e) {
        e.preventDefault();
        var id = $('evpId').value;
        var corps = {
            titre: $('evpTitre').value, type: $('evpType').value, salon_slug: $('evpSalon').value,
            debut_local: $('evpDebut').value, duree_min: Number($('evpDuree').value), recurrence: $('evpRecurrence').value,
            actif: $('evpActif').value === '1', description: $('evpDescription').value
        };
        var b = $('evpEnregistrer'); b.disabled = true;
        try {
            await apiCall(id ? '/evenements/' + id : '/evenements', { method: id ? 'PUT' : 'POST', body: JSON.stringify(corps) });
            toast(id ? 'Rendez-vous modifié' : 'Rendez-vous créé', 'success');
            fermer();
            await charger();
        } catch (err) { toast(err.message, 'error'); }
        b.disabled = false;
    });
    $('evpListe').addEventListener('click', async function (e) {
        var b = e.target.closest('[data-evp]');
        if (!b) return;
        var id = Number(b.closest('tr').getAttribute('data-id'));
        var ev = liste.find(function (x) { return x.id === id; });
        if (!ev) return;
        var action = b.getAttribute('data-evp');
        if (action === 'modifier') return ouvrir(ev);
        try {
            if (action === 'pause') {
                await apiCall('/evenements/' + id, { method: 'PUT', body: JSON.stringify({ actif: !ev.actif }) });
                toast(ev.actif ? 'Rendez-vous mis en pause' : 'Rendez-vous réactivé', 'success');
            } else if (action === 'supprimer') {
                if (!confirm('Supprimer « ' + ev.titre + ' » ? Les rappels des membres seront effacés.')) return;
                await apiCall('/evenements/' + id, { method: 'DELETE' });
                toast('Rendez-vous supprimé', 'success');
            }
            await charger();
        } catch (err) { toast(err.message, 'error'); }
    });

    window.EvcProgramme = { charger: charger };
})();
