// ============================================================
// E-VISIOCAM — « Mes voyages et déplacements » dans Mon compte
//   Ville (annuaire officiel des communes, ville-departement.js), dates d'arrivée et de départ ; 5 voyages au plus.
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var liste = $('voyListe');
    if (!liste || typeof API_URL === 'undefined' || !window.EvcVille) return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var ville = null;
    var champ = EvcVille.monter($('voyVille'), { label: 'Ville du voyage', classeChamp: 'w-full px-3 py-2 bg-slate-100 rounded-xl text-sm', onChange: function (c, v) { ville = v || null; } });
    var auj = new Date().toISOString().slice(0, 10);
    $('voyDu').min = auj; $('voyAu').min = auj;
    $('voyDu').addEventListener('change', function () { $('voyAu').min = this.value || auj; if (!$('voyAu').value || $('voyAu').value < this.value) $('voyAu').value = this.value; });
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    function dateFr(j) { var d = new Date(j + 'T12:00:00'); return isNaN(d) ? j : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }); }
    async function api(chemin, opts) {
        var r = await fetch(API_URL + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = {}; try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(d.error || 'Erreur, réessayez dans un instant.');
        return d;
    }
    function rendre(v) {
        liste.innerHTML = v.length ? v.map(function (x) {
            return '<div class="alb-ligne"><span>✈️ <b>' + esc(x.ville) + '</b> · du ' + esc(dateFr(x.du)) + ' au ' + esc(dateFr(x.au)) + '</span><div><button type="button" class="cert-btn cert-btn-2" data-voy-suppr="' + Number(x.id) + '">Supprimer</button></div></div>';
        }).join('') : '<p class="text-xs text-slate-500">Aucun voyage prévu.</p>';
    }
    $('voyAjouter').addEventListener('click', async function () {
        if (!ville) { toast('Choisissez la ville dans la liste proposée', 'error'); return; }
        if (!$('voyDu').value || !$('voyAu').value) { toast('Indiquez les dates d’arrivée et de départ', 'error'); return; }
        this.disabled = true;
        try {
            var d = await api('/models/mes-voyages', { method: 'POST', body: JSON.stringify({ ville: ville, du: $('voyDu').value, au: $('voyAu').value }) });
            rendre(d.voyages); toast('Voyage ajouté', 'success');
            ville = null; champ.definir('', null); $('voyDu').value = ''; $('voyAu').value = '';
            var input = $('voyVille').querySelector('input'); if (input) input.value = '';
        } catch (x) { toast(x.message, 'error'); }
        this.disabled = false;
    });
    liste.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-voy-suppr]'); if (!b) return;
        try { rendre((await api('/models/mes-voyages/' + b.getAttribute('data-voy-suppr'), { method: 'DELETE' })).voyages); } catch (x) { toast(x.message, 'error'); }
    });
    api('/models/mes-voyages').then(function (d) { rendre(d.voyages); }).catch(function () { liste.innerHTML = ''; });
})();
