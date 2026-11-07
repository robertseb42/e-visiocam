// ============================================================
// E-VISIOCAM — « Mon profil libertin » dans Mon compte
//   Couple : type de couple, deux partenaires (tendance, silhouette, taille, naissance du 2e)
//   Tout le monde : qui je souhaite rencontrer, intérêts (12 max), annonce, progression du profil
// Les listes viennent du serveur (/api/models/profil-options) ; compte.js lit la valeur via window.__evcProfil.
// ============================================================
(function () {
    'use strict';
    var zone = document.getElementById('profilLibertin');
    if (!zone || typeof API_URL === 'undefined') return;
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var OPT = null, etat = { couple: 'hf', p1: {}, p2: {}, interets: [], recherche: [], annonce: '', situation: '', partenaire: '', objectifs: [] }, genre = '', membre = null;
    var LIBELLES = { hf: ['Monsieur', 'Madame'], ff: ['Elle', 'Elle'], hh: ['Lui', 'Lui'] };

    function genreActuel() { var g = document.getElementById('genderField'); return g ? g.value : genre; }
    function options(liste, val, vide) {
        return '<option value="">' + (vide || 'Choisir') + '</option>' + Object.keys(liste).map(function (k) { return '<option value="' + k + '"' + (k === val ? ' selected' : '') + '>' + esc(liste[k]) + '</option>'; }).join('');
    }
    function tailles(val) {
        var s = '<option value="">Choisir</option>';
        for (var t = 145; t <= 205; t += 5) s += '<option value="' + t + '"' + (+val === t ? ' selected' : '') + '>' + t + ' cm</option>';
        return s;
    }
    function bloc(n, titre, p, avecNaissance) {
        return '<fieldset class="plib-part"><legend>' + esc(titre) + '</legend>' +
            '<label>Tendance<select data-p="' + n + '" data-k="tendance">' + options(OPT.tendances, p.tendance) + '</select></label>' +
            '<label>Silhouette<select data-p="' + n + '" data-k="silhouette">' + options(OPT.silhouettes, p.silhouette) + '</select></label>' +
            '<label>Taille<select data-p="' + n + '" data-k="taille">' + tailles(p.taille) + '</select></label>' +
            (avecNaissance ? '<label>Date de naissance<input type="date" data-p="' + n + '" data-k="naissance" value="' + esc(p.naissance || '') + '"></label>' : '') +
            '</fieldset>';
    }
    function puces(cle, liste, choisis, max) {
        return '<div class="plib-puces" data-liste="' + cle + '"' + (max ? ' data-max="' + max + '"' : '') + '>' + Object.keys(liste).map(function (k) {
            return '<button type="button" data-v="' + k + '" aria-pressed="' + (choisis.indexOf(k) >= 0) + '">' + esc(liste[k]) + '</button>';
        }).join('') + '</div>';
    }
    function progression() {
        var e = [!!genreActuel(), !!(membre && membre.departement), etat.recherche.length > 0 && etat.interets.length > 0, !!(membre && membre.avatar && membre.avatar.status !== 'none') || !!etat.annonce.trim()];
        var n = e.filter(Boolean).length;
        return '<div class="plib-prog"><div class="plib-barre"><span style="width:' + (n * 25) + '%"></span></div><p><b>Profil complété ' + n + '/4</b>' +
            (n < 4 ? ' · ' + ['Choisissez « Je suis »', 'Indiquez votre ville', 'Cochez qui vous recherchez et vos intérêts', 'Ajoutez une photo, un avatar ou une annonce'][e.indexOf(false)] : ' · Bravo, votre profil est complet') + '</p></div>';
    }
    function rendre() {
        if (!OPT) return;
        var g = genreActuel(), couple = g === 'couple', lib = LIBELLES[etat.couple] || LIBELLES.hf;
        var lb = document.getElementById('birthdateField') && document.getElementById('birthdateField').closest('div').querySelector('label');
        if (lb) lb.textContent = couple ? 'Date de naissance (' + lib[0] + ')' : 'Date de naissance';
        var enCouple = !couple && etat.situation === 'couple';
        zone.innerHTML = progression() +
            '<div class="plib-champ"><span>Je suis ici pour <small>(plusieurs choix possibles)</small></span>' + puces('objectifs', OPT.objectifs || {}, etat.objectifs) + '</div>' +
            (!couple ? '<label class="plib-ligne">Ma situation<select data-k="situation">' + options(OPT.situations || {}, etat.situation, 'Non précisé') + '</select></label>' +
                (enCouple ? '<label class="plib-ligne">Mon/ma partenaire sur E-VISIOCAM <small>(pseudo, facultatif)</small><input type="text" data-k="partenaire" maxlength="40" placeholder="Son pseudo" value="' + esc(etat.partenaire) + '" autocomplete="off"></label>' +
                    '<p class="text-xs text-slate-500" style="margin:-4px 0 8px">Le lien « En couple avec » s’affiche sur vos deux profils quand votre partenaire indique aussi votre pseudo.</p>' : '') : '') +
            (couple ? '<label class="plib-ligne">Nous sommes<select data-k="couple">' + options(OPT.couples, etat.couple, 'Choisir') + '</select></label>' : '') +
            '<div class="plib-parts">' + bloc('p1', couple ? lib[0] : 'Moi', etat.p1, false) + (couple ? bloc('p2', lib[1], etat.p2, true) : '') + '</div>' +
            '<div class="plib-champ"><span>Je souhaite rencontrer</span>' + puces('recherche', OPT.recherche, etat.recherche) + '</div>' +
            '<div class="plib-champ"><span>Mes intérêts <small>(12 au maximum)</small></span>' + puces('interets', OPT.interets, etat.interets, 12) + '</div>' +
            '<label class="plib-champ"><span>Mon annonce <small>(pas d\'e-mail, de lien ni de téléphone)</small></span><textarea data-k="annonce" rows="4" maxlength="1000" placeholder="Présentez-vous librement : qui vous êtes, ce que vous aimez, ce que vous attendez des rencontres.">' + esc(etat.annonce) + '</textarea><small class="plib-compte"><span>' + etat.annonce.length + '</span>/1000</small></label>';
    }
    zone.addEventListener('change', function (e) {
        var t = e.target, k = t.getAttribute('data-k'), p = t.getAttribute('data-p');
        if (!k) return;
        if (p) etat[p][k] = k === 'taille' ? (parseInt(t.value, 10) || null) : t.value;
        else if (k === 'couple') { etat.couple = t.value || 'hf'; rendre(); }
        else if (k === 'situation') { etat.situation = t.value; rendre(); }
    });
    zone.addEventListener('input', function (e) {
        if (e.target.getAttribute('data-k') === 'partenaire') { etat.partenaire = e.target.value; return; }
        if (e.target.getAttribute('data-k') !== 'annonce') return;
        etat.annonce = e.target.value; var c = zone.querySelector('.plib-compte span'); if (c) c.textContent = etat.annonce.length;
    });
    zone.addEventListener('click', function (e) {
        var b = e.target.closest('.plib-puces button'); if (!b) return;
        var box = b.parentNode, cle = box.getAttribute('data-liste'), max = +box.getAttribute('data-max') || 99, v = b.getAttribute('data-v'), l = etat[cle], i = l.indexOf(v);
        if (i >= 0) l.splice(i, 1); else { if (l.length >= max) { if (typeof showToast === 'function') showToast(max + ' choix au maximum', 'info'); return; } l.push(v); }
        b.setAttribute('aria-pressed', String(i < 0));
        var prog = zone.querySelector('.plib-prog'); if (prog) prog.outerHTML = progression();
    });
    document.addEventListener('change', function (e) { if (e.target.id === 'genderField') rendre(); });

    window.__evcProfil = {
        // Appelé par compte.js une fois le profil chargé
        charger: function (u) {
            membre = u; genre = u.gender || '';
            var p = {}; try { p = typeof u.profil === 'string' ? JSON.parse(u.profil || '{}') : (u.profil || {}); } catch (x) {}
            etat = { couple: p.couple || 'hf', p1: p.p1 || {}, p2: p.p2 || {}, interets: (p.interets || []).slice(), recherche: (p.recherche || []).slice(), annonce: p.annonce || '', situation: p.situation || '', partenaire: p.partenaireNom || '', objectifs: (p.objectifs || []).slice() };
            rendre();
        },
        valeur: function () { return { couple: etat.couple, p1: etat.p1, p2: etat.p2, interets: etat.interets, recherche: etat.recherche, annonce: etat.annonce, situation: etat.situation, partenaire: etat.situation === 'couple' ? etat.partenaire : '', objectifs: etat.objectifs }; }
    };
    fetch(API_URL + '/models/profil-options').then(function (r) { return r.json(); }).then(function (d) { OPT = d; rendre(); }).catch(function () {
        zone.innerHTML = '<p class="text-xs text-slate-500">Le profil détaillé est indisponible pour le moment.</p>';
    });
})();
