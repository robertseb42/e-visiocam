// E-VISIOCAM — Espace équipe (P2) : « Je m'en occupe » sur chaque dossier en attente.
// Ajoute une petite barre sur les cartes des listes déjà existantes (signalements, alertes, contestations,
// photos de profil, éléments du guide à valider) sans changer leur fonctionnement. Serveur : /api/espace/prises.
(function () {
    'use strict';
    var u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
    if (!u || ['moderator', 'super_admin', 'guide_editor'].indexOf(u.role) < 0 || typeof apiCall !== 'function') return;
    var prises = {}, dureeMin = 30;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };

    // Où trouver les dossiers dans les pages existantes : [sélecteur du repère, type, numéro, carte]
    var REPERES = [
        ['.rep-traiter[data-rep-id]', function () { return 'signalement'; }, function (e) { return e.dataset.repId; }, function (e) { return e.closest('.rounded-xl'); }],
        ['article[data-alerte]', function () { return 'alerte'; }, function (e) { return e.getAttribute('data-alerte'); }, function (e) { return e.querySelector('[data-al="traiter"]') ? e : null; }],
        ['[data-mod="deciderContestation"][data-mod-args*="accepted"]', function () { return 'contestation'; }, function (e) { try { return String(JSON.parse(e.getAttribute('data-mod-args'))[0]); } catch (x) { return null; } }, function (e) { return e.closest('.rounded-2xl'); }],
        ['[data-photo]', function () { return 'photo'; }, function (e) { return e.getAttribute('data-photo'); }, function (e) { return e; }],
        ['#glModContenu [data-mod][data-id]', function (e) { return 'guide-' + e.getAttribute('data-mod'); }, function (e) { return e.getAttribute('data-id'); }, function (e) { return e.closest('.gl-mod'); }]
    ];
    var TYPES_GUIDE = ['guide-lieu', 'guide-avis', 'guide-bon-plan', 'guide-signalement', 'guide-soiree', 'guide-correction'];

    function depuis(iso) { var m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000)); return m < 1 ? 'à l\'instant' : 'depuis ' + m + ' min'; }
    function barre(type, ref) {
        var p = prises[type + '|' + ref];
        if (!p) return '<span class="evp-libre">Personne ne s\'en occupe</span><button type="button" class="evp-btn" data-evp="prendre">✋ Je m\'en occupe</button>';
        if (p.moi) return '<span class="evp-moi">✋ Vous vous en occupez ' + depuis(p.depuis) + '</span><button type="button" class="evp-btn evp-gris" data-evp="liberer">Libérer</button>';
        return '<span class="evp-autre">🔒 Pris en charge par <b>' + esc(p.par) + '</b> ' + depuis(p.depuis) + '</span><button type="button" class="evp-btn evp-gris" data-evp="forcer">Prendre quand même</button>';
    }
    function decorer() {
        REPERES.forEach(function (r) {
            document.querySelectorAll(r[0]).forEach(function (e) {
                var type = r[1](e), ref = r[2](e), carte = r[3](e);
                if (!carte || !ref || (type.indexOf('guide-') === 0 && TYPES_GUIDE.indexOf(type) < 0)) return;
                var b = carte.querySelector(':scope > .evp');
                if (!b) { b = document.createElement('div'); b.className = 'evp'; carte.appendChild(b); }
                b.dataset.type = type; b.dataset.ref = ref;
                var p = prises[type + '|' + ref], etat = p ? (p.moi ? 'moi' : 'autre') : 'libre';
                var cle = etat + (p ? depuis(p.depuis) : '');
                if (b.dataset.etat !== cle) { b.innerHTML = barre(type, ref); b.dataset.etat = cle; }
                carte.classList.toggle('evp-pris-autre', etat === 'autre');
            });
        });
    }
    function charger() {
        return apiCall('/espace/prises').then(function (d) {
            prises = {}; dureeMin = d.dureeMinutes || 30;
            (d.prises || []).forEach(function (p) { prises[p.type + '|' + p.ref] = p; });
            decorer();
        }).catch(function () {});
    }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-evp]'); if (!b) return;
        var zone = b.closest('.evp'), type = zone.dataset.type, ref = zone.dataset.ref, quoi = b.getAttribute('data-evp');
        b.disabled = true;
        var req = quoi === 'liberer'
            ? apiCall('/espace/prises/' + encodeURIComponent(type) + '/' + encodeURIComponent(ref), { method: 'DELETE' })
            : apiCall('/espace/prises', { method: 'POST', body: JSON.stringify({ type: type, ref: ref, forcer: quoi === 'forcer' }) });
        req.catch(function (x) { if (typeof showToast === 'function') showToast(x.message, 'error'); }).then(charger);
    });
    // Les listes se redessinent souvent (filtres, actualisation) : on repose les barres à chaque changement
    var attente = null;
    new MutationObserver(function (muts) {
        if (muts.every(function (m) { return m.target.closest && m.target.closest('.evp'); })) return;
        clearTimeout(attente); attente = setTimeout(decorer, 120);
    }).observe(document.body, { childList: true, subtree: true });
    charger();
    setInterval(function () { if (!document.hidden) charger(); }, 20000);
})();
