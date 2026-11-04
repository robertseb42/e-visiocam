// ============================================================
// E-VISIOCAM — « Profil certifié » dans Mon compte
//   1. Le membre demande un geste et un code à 4 chiffres
//   2. Il se prend en photo (visage visible, habillé) en faisant le geste, avec le code et son pseudo sur un papier
//   3. L'équipe compare avec son profil : badge « Certifié » si c'est bon. La photo est supprimée après la décision.
// ============================================================
(function () {
    'use strict';
    var zone = document.getElementById('certifZone');
    if (!zone || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var etat = null, photo = null;
    function toast(m, t) { if (typeof showToast === 'function') showToast(m, t || 'info'); }
    function dateFr(v) {
        if (!v) return '';
        var d = new Date(String(v).replace(' ', 'T') + (/[Zz]|[+-]\d\d:?\d\d$/.test(v) ? '' : 'Z'));
        return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }
    async function appel(chemin, opts) {
        opts = opts || {};
        var r = await fetch(API_URL + '/certification' + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts));
        var d = {}; try { d = await r.json(); } catch (e) {}
        if (!r.ok) throw new Error(d.error || 'Erreur, réessayez dans un instant.');
        return d;
    }
    function pseudo() { var u = typeof getCurrentUser === 'function' && getCurrentUser(); return u ? u.username : 'votre pseudo'; }
    function couple() { var g = document.getElementById('genderField'); return g && g.value === 'couple'; }

    function rendre() {
        var e = etat || {};
        if (e.certifie) {
            zone.innerHTML = '<div class="cert-carte"><p class="cert-ok"><i aria-hidden="true">✔</i> Votre profil est certifié' + (e.le ? ' depuis le ' + esc(dateFr(e.le)) : '') + '</p><p>Le badge « Certifié » s’affiche sur votre carte et votre fiche. Les autres membres savent que vous êtes bien la personne de vos photos.</p></div>';
            return;
        }
        if (e.statut === 'attente') {
            zone.innerHTML = '<div class="cert-carte"><p><b>Photo envoyée' + (e.envoyeLe ? ' le ' + esc(dateFr(e.envoyeLe)) : '') + '.</b> L’équipe la vérifie, en général sous 48 heures. Elle sera supprimée dès la décision.</p></div>';
            return;
        }
        if (e.statut === 'a_faire') {
            zone.innerHTML = '<div class="cert-carte">' +
                '<div class="cert-consigne"><span class="cert-code" aria-label="Votre code">' + esc(e.code) + '</span><p><b>' + esc(e.geste) + '</b>, en tenant un papier où vous avez écrit ce code et votre pseudo « ' + esc(pseudo()) + ' ».</p></div>' +
                '<ul class="cert-regles"><li>Votre visage bien visible, habillé(e) : aucune nudité.</li>' + (couple() ? '<li>Couple : les deux partenaires sur la même photo.</li>' : '') +
                '<li>Une vraie photo prise maintenant (pas une capture ni une ancienne photo).</li><li>Elle n’est vue que par l’équipe, puis supprimée après la vérification.</li></ul>' +
                '<label class="cert-sr" for="certFichier">Choisir la photo</label><input type="file" id="certFichier" class="cert-sr" accept="image/*" capture="user">' +
                (photo ? '<img class="cert-apercu" src="' + photo + '" alt="Aperçu de votre photo">' : '') +
                '<div class="cert-actions"><button type="button" class="cert-btn cert-btn-2" data-cert="choisir">📷 ' + (photo ? 'Changer la photo' : 'Prendre ou choisir la photo') + '</button>' +
                '<button type="button" class="cert-btn" data-cert="envoyer"' + (photo ? '' : ' disabled') + '>Envoyer à l’équipe</button></div></div>';
            return;
        }
        zone.innerHTML = '<div class="cert-carte">' + (e.statut === 'refuse' ? '<p class="cert-refus">Dernière demande refusée : ' + esc(e.motif) + '</p>' : '') +
            '<p>Montrez aux membres que vous êtes bien la personne (ou le couple) de votre profil. Vous recevez un geste et un code, vous vous prenez en photo, et l’équipe vérifie. Vous obtenez alors le badge <b>« Certifié »</b>.</p>' +
            '<div class="cert-actions"><button type="button" class="cert-btn" data-cert="commencer">' + (e.statut === 'refuse' ? 'Recommencer' : 'Faire certifier mon profil') + '</button></div></div>';
    }

    // Photo réduite dans le navigateur (1280 px, JPEG) pour un envoi rapide
    function reduire(fichier) {
        return new Promise(function (ok, ko) {
            var img = new Image(), url = URL.createObjectURL(fichier);
            img.onload = function () {
                var max = 1280, k = Math.min(1, max / Math.max(img.width, img.height));
                var c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
                c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                URL.revokeObjectURL(url);
                var q = 0.85, d = c.toDataURL('image/jpeg', q);
                while (d.length > 900000 && q > 0.4) { q -= 0.1; d = c.toDataURL('image/jpeg', q); }
                if (Math.min(c.width, c.height) < 320) return ko(new Error('Photo trop petite (320 px minimum).'));
                ok(d);
            };
            img.onerror = function () { URL.revokeObjectURL(url); ko(new Error('Image illisible : utilisez une photo JPG ou PNG.')); };
            img.src = url;
        });
    }

    zone.addEventListener('click', async function (ev) {
        var b = ev.target.closest('[data-cert]'); if (!b) return;
        var quoi = b.getAttribute('data-cert');
        if (quoi === 'choisir') { document.getElementById('certFichier').click(); return; }
        b.disabled = true;
        try {
            if (quoi === 'commencer') { photo = null; etat = await appel('/commencer', { method: 'POST', body: '{}' }); }
            if (quoi === 'envoyer') { etat = await appel('/photo', { method: 'PUT', body: JSON.stringify({ image: photo }) }); photo = null; toast('Photo envoyée, l’équipe va la vérifier', 'success'); }
            rendre();
        } catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });
    zone.addEventListener('change', async function (ev) {
        if (ev.target.id !== 'certFichier') return;
        var f = ev.target.files && ev.target.files[0]; if (!f) return;
        try { photo = await reduire(f); rendre(); } catch (x) { toast(x.message, 'error'); }
    });
    document.addEventListener('change', function (ev) { if (ev.target.id === 'genderField' && etat && etat.statut === 'a_faire') rendre(); });

    appel('/moi').then(function (d) { etat = d; rendre(); }).catch(function () {
        zone.innerHTML = '<p class="text-xs text-slate-500">La certification est indisponible pour le moment.</p>';
    });
})();
