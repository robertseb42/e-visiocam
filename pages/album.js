// ============================================================
// E-VISIOCAM — « Mon album privé » dans Mon compte
//   12 photos au plus, visibles seulement par les membres que j'autorise, et seulement après vérification par l'équipe.
//   Demandes d'accès reçues (accepter / refuser) et accès donnés (retirer à tout moment).
// ============================================================
(function () {
    'use strict';
    var zone = document.getElementById('albumZone');
    if (!zone || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var BASE = String(API_URL).replace(/\/api\/?$/, ''), blobs = [], d = null, envoi = false;
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    async function appel(chemin, opts) {
        var r = await fetch(API_URL + '/albums' + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var j = {}; try { j = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(j.error || 'Erreur, réessayez dans un instant.');
        return j;
    }
    // Les photos privées se chargent avec la session (jamais d'adresse publique)
    function chargerImages() {
        zone.querySelectorAll('img[data-src]').forEach(function (img) {
            fetch(BASE + img.getAttribute('data-src'), { credentials: 'include' }).then(function (r) { return r.ok ? r.blob() : null; })
                .then(function (b) { if (b) { var u = URL.createObjectURL(b); blobs.push(u); img.src = u; } }).catch(function () {});
        });
    }
    function personnes(liste, boutons) {
        return '<div class="alb-liste">' + liste.map(function (m) { return '<div class="alb-ligne"><span>' + esc(m.username) + '</span><div>' + boutons(m) + '</div></div>'; }).join('') + '</div>';
    }
    function rendre() {
        blobs.forEach(function (u) { URL.revokeObjectURL(u); }); blobs = [];
        var plein = d.photos.length >= d.max;
        zone.innerHTML =
            '<p class="alb-regles">Vos photos ne sont visibles que par les membres que <b>vous autorisez</b>, et seulement <b>après vérification par l’équipe</b>. ' +
            'Interdit : <b>toute personne mineure</b>, toute personne photographiée sans son accord, coordonnées et publicité. Tout manquement entraîne le bannissement et un signalement aux autorités.</p>' +
            '<div class="alb-grille">' + d.photos.map(function (p) {
                return '<div class="alb-photo"><img data-src="' + esc(p.url) + '" alt="' + esc(p.legende || 'Photo de votre album') + '">' +
                    (p.enAttente ? '<span class="alb-attente">En vérification</span>' : '') +
                    '<button type="button" data-alb-suppr="' + Number(p.id) + '" title="Supprimer cette photo" aria-label="Supprimer cette photo">✕</button></div>';
            }).join('') +
            (plein ? '' : '<label class="alb-ajout">' + (envoi ? 'Envoi…' : '＋ Ajouter des photos<br><small>' + d.photos.length + '/' + d.max + '</small>') + '<input type="file" accept="image/*" multiple data-alb-fichier hidden></label>') + '</div>' +
            (d.demandes.length ? '<p class="alb-sous">Demandes d’accès (' + d.demandes.length + ')</p>' + personnes(d.demandes, function (m) {
                return '<button type="button" class="cert-btn" data-alb-accepter="' + Number(m.id) + '">Accepter</button><button type="button" class="cert-btn cert-btn-2" data-alb-refuser="' + Number(m.id) + '">Refuser</button>';
            }) : '') +
            (d.acces.length ? '<p class="alb-sous">Ont accès à mon album (' + d.acces.length + ')</p>' + personnes(d.acces, function (m) {
                return '<button type="button" class="cert-btn cert-btn-2" data-alb-retirer="' + Number(m.id) + '">Retirer l’accès</button>';
            }) : '');
        chargerImages();
    }
    function reduire(fichier) {
        return new Promise(function (ok, ko) {
            var img = new Image(), url = URL.createObjectURL(fichier);
            img.onload = function () {
                var k = Math.min(1, 1600 / Math.max(img.width, img.height));
                var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
                var q = 0.85, s = c.toDataURL('image/jpeg', q);
                while (s.length > 1150000 && q > 0.4) { q -= 0.1; s = c.toDataURL('image/jpeg', q); }
                if (Math.min(c.width, c.height) < 200) return ko(new Error('Photo trop petite (200 px minimum).'));
                ok(s);
            };
            img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible : utilisez une photo JPG ou PNG.')); };
            img.src = url;
        });
    }
    async function charger() { try { d = await appel('/moi'); rendre(); } catch (e) { zone.innerHTML = '<p class="text-xs text-slate-500">L’album privé est indisponible pour le moment.</p>'; } }

    zone.addEventListener('change', async function (e) {
        if (!e.target.hasAttribute('data-alb-fichier')) return;
        var fichiers = [].slice.call(e.target.files || []).slice(0, d.max - d.photos.length);
        if (!fichiers.length) return;
        envoi = true; rendre();
        var n = 0;
        for (var i = 0; i < fichiers.length; i++) {
            try { var image = await reduire(fichiers[i]); var r = await appel('/moi/photos', { method: 'POST', body: JSON.stringify({ image: image }) }); d.photos = r.photos; n++; }
            catch (x) { toast(x.message, 'error'); }
        }
        envoi = false; rendre();
        if (n) toast(n + ' photo' + (n > 1 ? 's ajoutées' : ' ajoutée') + ' : visible' + (n > 1 ? 's' : '') + ' après vérification par l’équipe', 'success');
    });
    zone.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-alb-suppr],[data-alb-accepter],[data-alb-refuser],[data-alb-retirer]'); if (!b) return;
        b.disabled = true;
        try {
            if (b.hasAttribute('data-alb-suppr')) { d.photos = (await appel('/moi/photos/' + b.getAttribute('data-alb-suppr'), { method: 'DELETE' })).photos; rendre(); return; }
            if (b.hasAttribute('data-alb-accepter')) await appel('/moi/demandes/' + b.getAttribute('data-alb-accepter'), { method: 'POST', body: JSON.stringify({ accepter: true }) });
            if (b.hasAttribute('data-alb-refuser')) await appel('/moi/demandes/' + b.getAttribute('data-alb-refuser'), { method: 'POST', body: JSON.stringify({ accepter: false }) });
            if (b.hasAttribute('data-alb-retirer')) await appel('/moi/acces/' + b.getAttribute('data-alb-retirer'), { method: 'DELETE' });
            charger();
        } catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });
    charger();
})();
