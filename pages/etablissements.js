// E-VISIOCAM — Page « Établissements » : recherche d'un lieu du guide et code du badge « Lieu vérifié ».
// Le badge renvoie vers la page Google du lieu (/club-libertin/<ville>/<lieu>/), qui n'existe que pour les fiches vérifiées.
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    if (!$('etbQ')) return;
    var DOMAINE = 'https://www.e-visiocam.com';
    var API = (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api') + '/guide';
    var choisi = null, attente = null;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

    function theme() { var r = document.querySelector('input[name="etbTheme"]:checked'); return r ? r.value : 'sombre'; }
    function code(l) {
        var url = DOMAINE + l.url;
        return '<a href="' + url + '" target="_blank" rel="noopener" title="' + esc(l.nom) + ' : fiche vérifiée et avis sur E-VISIOCAM">' +
            '<img src="' + DOMAINE + '/img/badge/verifie-' + theme() + '.svg" width="240" height="72" alt="' + esc(l.nom) + ' : lieu vérifié par le guide E-VISIOCAM"></a>';
    }
    function afficher() {
        var l = choisi;
        $('etbCode').hidden = !(l && l.url);
        $('etbPasVerifie').hidden = !(l && !l.url);
        if (!l) return;
        if (!l.url) {
            $('etbPasVerifie').innerHTML = 'La fiche de <b>' + esc(l.nom) + '</b> n\'est pas encore vérifiée : le badge sera disponible dès qu\'elle le sera. ' +
                '<a class="text-brand-primary font-semibold hover:underline" href="contact.html">Écrivez-nous</a> avec vos horaires et tarifs à jour.';
            return;
        }
        $('etbTexte').value = code(l);
        $('etbApercu').src = 'img/badge/verifie-' + theme() + '.svg';
        $('etbApercuLien').href = l.url;
        $('etbCopie').textContent = '';
    }
    function chercher(q) {
        var zone = $('etbRes');
        if (q.length < 2) { zone.innerHTML = ''; return; }
        fetch(API + '/lieux?q=' + encodeURIComponent(q)).then(function (r) { return r.json(); }).then(function (d) {
            var l = (d.lieux || []).slice(0, 8);
            window.__etbLieux = l;
            zone.innerHTML = l.length ? l.map(function (x, i) {
                return '<button type="button" data-i="' + i + '" aria-pressed="false"><span><b>' + esc(x.nom) + '</b> · ' + esc(x.ville) + '</span><small>' + (x.url ? '✓ vérifiée' : 'non vérifiée') + '</small></button>';
            }).join('') : '<p class="text-slate-500 text-sm">Aucun établissement trouvé. <a class="text-brand-primary font-semibold hover:underline" href="guide.html?proposer=1">Proposer votre lieu</a></p>';
        }).catch(function () { zone.innerHTML = '<p class="text-slate-500 text-sm">Recherche indisponible pour le moment.</p>'; });
    }
    $('etbQ').addEventListener('input', function () { var v = this.value.trim(); clearTimeout(attente); attente = setTimeout(function () { chercher(v); }, 250); });
    $('etbRes').addEventListener('click', function (e) {
        var b = e.target.closest('button[data-i]'); if (!b) return;
        choisi = (window.__etbLieux || [])[+b.getAttribute('data-i')] || null;
        this.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        afficher();
    });
    document.querySelectorAll('input[name="etbTheme"]').forEach(function (r) { r.addEventListener('change', afficher); });
    $('etbCopier').addEventListener('click', function () {
        var t = $('etbTexte');
        var ok = function () { $('etbCopie').textContent = 'Code copié.'; };
        if (navigator.clipboard) navigator.clipboard.writeText(t.value).then(ok, function () { t.select(); });
        else { t.select(); try { document.execCommand('copy'); ok(); } catch (x) {} }
    });
})();
