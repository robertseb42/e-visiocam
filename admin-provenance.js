// ============================================================
// ADMIN — Statistiques : ce que rapportent les anciens domaines Saligane
// ============================================================
(function () {
    'use strict';
    var table = document.getElementById('provTable');
    if (!table) return;
    var nf = new Intl.NumberFormat('fr-FR');
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function jours() { try { return typeof statsJours !== 'undefined' ? statsJours : 30; } catch (e) { return 30; } }

    async function charger() {
        var periode = document.getElementById('provPeriode'), conseil = document.getElementById('provConseil');
        try {
            var d = await apiCall('/admin/acquisition?days=' + jours());
            periode.textContent = d.jours + ' derniers jours · un visiteur est compté une fois par jour';
            var th = 'class="text-left text-xs font-bold text-slate-500 py-2 px-2" scope="col"';
            var lignes = (d.sources || []).map(function (s) {
                return '<tr class="border-t border-slate-100">' +
                    '<th scope="row" class="text-left py-2 px-2 font-bold text-slate-900">' + esc(s.nom) + '</th>' +
                    '<td class="py-2 px-2 text-right">' + nf.format(s.visite) + '</td>' +
                    '<td class="py-2 px-2 text-right">' + nf.format(s.entree) + ' <span class="text-xs text-slate-500">(' + s.tauxEntree + ' %)</span></td>' +
                    '<td class="py-2 px-2 text-right">' + nf.format(s.inscription) + '</td>' +
                    '<td class="py-2 px-2 text-right">' + nf.format(s.membresTotal) + ' <span class="text-xs text-slate-500">dont ' + nf.format(s.membresActifs) + ' actifs</span></td>' +
                    '</tr>';
            }).join('');
            table.innerHTML = '<thead><tr><th ' + th + '>Domaine</th><th ' + th.replace('text-left', 'text-right') + '>Visites</th><th ' + th.replace('text-left', 'text-right') + '>Clics « Entrer »</th><th ' + th.replace('text-left', 'text-right') + '>Inscriptions</th><th ' + th.replace('text-left', 'text-right') + '>Membres venus (total)</th></tr></thead><tbody>' + lignes + '</tbody>';
            var visites = 0, inscr = 0;
            (d.sources || []).forEach(function (s) { visites += s.visite; inscr += s.inscription; });
            conseil.textContent = !visites
                ? 'Aucune visite pour l’instant. Vérifiez que les redirections IONOS pointent bien vers https://www.e-visiocam.com/saligane.html?d=com et ?d=org.'
                : (inscr ? nf.format(inscr) + ' inscription(s) grâce aux anciens domaines sur la période.' : 'Des visites mais pas encore d’inscription.') +
                  ' Avant le renouvellement (15 € HT/an chacun), gardez un domaine s’il amène encore des visites régulières ou des inscriptions.';
        } catch (e) {
            periode.textContent = 'Indisponible : ' + e.message;
        }
    }

    var origine = window.chargerStats;
    if (typeof origine === 'function') {
        window.chargerStats = function () { var r = origine.apply(this, arguments); charger(); return r; };
    }
    charger();
})();
