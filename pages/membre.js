// ============================================================
// Profil d'un membre : membre.html?u=<pseudo>
// ------------------------------------------------------------
// Photo (seulement si validée par la modération), pseudo, rôle, ville si le membre l'affiche (sinon département),
// certification, niveau, compteurs, onglets Présentation · Rencontre · Photos (album privé),
// date d'inscription, présence, bio, live en cours, et les actions : écrire, demander la cam,
// favoris (modèles), signaler, bloquer. Les données viennent de GET /api/users/profile/:pseudo,
// qui répond 404 si l'un des deux membres a bloqué l'autre.
// Tout texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    var carte = document.getElementById('mbCarte');
    var pseudo = (new URLSearchParams(location.search).get('u') || '').trim().slice(0, 50);
    var ROLES = { model: '⭐ Modèle', moderator: '🛡️ Modérateur', super_admin: '👑 Équipe E-VISIOCAM', user: 'Membre' };

    function el(tag, cls, texte) { var n = document.createElement(tag); if (cls) n.className = cls; if (texte !== undefined) n.textContent = texte; return n; }
    function bouton(cls, texte) { var b = el('button', 'mb-btn ' + (cls || ''), texte); b.type = 'button'; return b; }
    function lien(cls, texte, url) { var a = el('a', 'mb-btn ' + (cls || ''), texte); a.href = url; return a; }
    function info(texte, type) {
        if (window.EvcSecurite) EvcSecurite.toast(texte, type);
        else if (typeof showToast === 'function') showToast(texte, type);
    }
    function dateMois(v) {
        if (!v) return '';
        var d = new Date(String(v).replace(' ', 'T') + (/[TZ]/.test(String(v)) ? '' : 'Z'));
        return isNaN(d) ? '' : d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    }

    // Retour : page précédente du site si elle existe
    var retour = document.getElementById('mbRetour');
    if (retour) retour.addEventListener('click', function (e) {
        if (document.referrer && document.referrer.indexOf(location.origin) === 0 && history.length > 1) { e.preventDefault(); history.back(); }
    });

    function vide(icone, titre, texte) {
        carte.textContent = '';
        var v = el('div', 'mb-vide');
        v.appendChild(el('div', 'mb-icone', icone));
        v.appendChild(el('p', 'text-lg font-bold text-slate-900', titre));
        if (texte) v.appendChild(el('p', 'text-sm text-slate-500', texte));
        var a = el('a', 'mb-btn discret', 'Retour aux salons'); a.href = 'salons.html'; a.style.display = 'inline-flex'; a.style.marginTop = '14px';
        v.appendChild(a);
        carte.appendChild(v);
    }

    async function charger() {
        if (!pseudo) { vide('🔎', 'Aucun membre indiqué', 'Ouvrez un profil depuis un salon, la messagerie ou la liste des membres.'); return; }
        var m;
        try { m = (await apiCall('/users/profile/' + encodeURIComponent(pseudo))).membre; }
        catch (e) {
            if (e.status === 401) return;   // session expirée : la page de connexion prend le relais
            vide('🙈', 'Ce profil n’est pas disponible', e.status === 404 ? 'Le membre n’existe pas ou son profil ne vous est pas accessible.' : (e.message || 'Réessayez dans un instant.'));
            return;
        }
        dessiner(m);
    }

    function dessiner(m) {
        document.title = m.username + ' — Profil — E-VISIOCAM';
        carte.textContent = '';
        var etat = m.isLive ? 'live' : (m.online ? 'on' : '');

        // ---------- En-tête : photo + pseudo + infos ----------
        var tete = el('div', 'mb-tete');
        var ph = el('div', 'mb-photo ' + etat, m.username.charAt(0).toUpperCase());
        var src = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;   // photo validée uniquement
        if (src) { ph.textContent = ''; var img = new Image(); img.alt = 'Photo de ' + m.username; img.src = src; ph.appendChild(img); }
        tete.appendChild(ph);
        var bloc = el('div', 'min-w-0');
        bloc.appendChild(el('h1', 'mb-nom text-slate-900', m.username));
        var role = el('span', 'mb-role' + (m.role === 'moderator' || m.role === 'super_admin' ? ' equipe' : ''), ROLES[m.role] || 'Membre');
        bloc.appendChild(role);
        var lignes = el('p', 'mb-lignes text-slate-600');
        var statut = el('span');
        statut.appendChild(el('span', 'mb-point ' + etat));
        statut.appendChild(document.createTextNode(m.isLive ? 'En direct' : (m.online ? 'En ligne' : 'Hors ligne')));
        lignes.appendChild(statut);
        var depuis = dateMois(m.createdAt);
        if (depuis) lignes.appendChild(el('span', '', 'Membre depuis ' + depuis));
        if (m.villeAffichee) lignes.appendChild(el('span', '', '📍 ' + m.villeAffichee + (m.departement ? ' (' + m.departement + ')' : '')));
        else if (m.departement) lignes.appendChild(el('span', '', '📍 ' + m.departement + (m.departementNom ? ' · ' + m.departementNom : '')));
        if (m.distance) lignes.appendChild(el('span', '', '🚗 ' + (m.distance <= 5 ? 'À moins de 5 km' : 'À environ ' + m.distance + ' km')));
        bloc.appendChild(lignes);
        tete.appendChild(bloc);
        carte.appendChild(tete);

        // ---------- Badges du programme de récompenses ----------
        var chips = [];
        if (m.certifie) chips.push('✔ Profil certifié');
        if (m.niveau) chips.push('⭐ Niveau ' + m.niveau.n + '/8 · ' + m.niveau.nom);
        if (m.dispo) chips.push(m.dispo.type === 'soir' ? '🌙 Libre ce soir' : '📅 Libre ce week-end');
        if (m.insigne && m.insigne.nom) chips.push((m.insigne.icone || '') + ' ' + m.insigne.nom);
        (m.badges || []).forEach(function (b) { if (b && b.nom) chips.push((b.icone || '') + ' ' + b.nom); });
        if (chips.length) {
            var bd = el('div', 'mb-badges');
            chips.forEach(function (c) { bd.appendChild(el('span', 'mb-badge', c.trim())); });
            carte.appendChild(bd);
        }

        // ---------- Compteurs ----------
        if (m.compteurs) {
            var cpt = el('div', 'mb-compteurs');
            [[m.compteurs.suivis, 'abonné'], [m.compteurs.amis, 'ami'], [m.compteurs.photos, 'photo privée', 'photos privées']].forEach(function (c) {
                var b = el('div', 'mb-compteur'); b.appendChild(el('b', '', String(c[0] || 0))); b.appendChild(el('span', '', (c[0] > 1 ? (c[2] || c[1] + 's') : c[1])));
                cpt.appendChild(b);
            });
            carte.appendChild(cpt);
        }

        // ---------- Live en cours ----------
        if (m.isLive && m.live) {
            var lv = el('div', 'mb-live');
            lv.appendChild(el('span', '', m.live.peutVoir && m.live.salon ? '🔴 En direct dans « ' + m.live.salon + ' »' : '🔴 En direct dans un salon privé'));
            if (m.live.peutVoir && m.live.streamId && !m.moi) {
                var voir = lien('rouge', '🎥 Regarder', 'live.html?join=' + encodeURIComponent(m.live.streamId) + '&from=' + encodeURIComponent(m.username));
                voir.style.minHeight = '38px';
                lv.appendChild(voir);
            }
            carte.appendChild(lv);
        }


        // ---------- Actions ----------
        var act = el('div', 'mb-actions');
        if (m.moi) {
            act.appendChild(lien('principal', '✏️ Modifier mon profil', 'compte.html'));
            act.appendChild(lien('', '👁 Mes visiteurs', 'visiteurs.html'));
            act.appendChild(boutonPartager(m));
            carte.appendChild(act);
            carte.appendChild(el('p', 'mb-note', 'C’est votre profil tel que les autres membres le voient.'));
            onglets(m);
            return;
        }
        act.appendChild(lien('principal', '💬 Envoyer un message', 'messages.html?ecrire=' + Number(m.id)));
        if (m.ami) act.appendChild(boutonsAmi(m));
        if (!m.isLive) {
            var cam = bouton('', '📷 Demander la cam');
            if (!m.online) { cam.disabled = true; cam.title = m.username + ' n’est pas connecté en ce moment'; }
            cam.addEventListener('click', async function () {
                cam.disabled = true;
                try {
                    await apiCall('/cam-requests', { method: 'POST', body: JSON.stringify({ to: Number(m.id) }) });
                    cam.textContent = '✅ Demande envoyée';
                    info('📷 Demande envoyée à ' + m.username + '. Il ou elle peut accepter ou refuser.', 'success');
                } catch (e) { info(e.message || 'Demande impossible', 'error'); cam.disabled = false; }
            });
            act.appendChild(cam);
        }
        if (m.peutFavori) {
            var fav = bouton('', '');
            var majFav = function () { fav.textContent = m.favori ? '♥ Dans mes favoris' : '♡ Ajouter aux favoris'; fav.classList.toggle('actif', !!m.favori); fav.setAttribute('aria-pressed', m.favori ? 'true' : 'false'); };
            majFav();
            fav.addEventListener('click', async function () {
                fav.disabled = true;
                try {
                    await apiCall('/favorites/model/' + Number(m.id), { method: m.favori ? 'DELETE' : 'PUT', body: m.favori ? undefined : JSON.stringify({}) });
                    m.favori = !m.favori; majFav();
                    info(m.favori ? m.username + ' est dans vos favoris : vous serez prévenu de ses lives.' : m.username + ' est retiré de vos favoris.', 'success');
                } catch (e) { info(e.message || 'Action impossible', 'error'); }
                fav.disabled = false;
            });
            act.appendChild(fav);
        }
        // ❤ Favori membre (les modèles gardent leur favori avec alerte de live)
        if (!m.peutFavori) {
            var favM = bouton('', '');
            var majFavM = function () { favM.textContent = m.favoriMembre ? '♥ Dans mes favoris' : '♡ Ajouter aux favoris'; favM.classList.toggle('actif', !!m.favoriMembre); };
            majFavM();
            favM.addEventListener('click', async function () {
                favM.disabled = true;
                try {
                    await apiCall('/favorites/membre/' + Number(m.id), { method: m.favoriMembre ? 'DELETE' : 'PUT', body: m.favoriMembre ? undefined : JSON.stringify({}) });
                    m.favoriMembre = !m.favoriMembre; majFavM();
                    info(m.favoriMembre ? m.username + ' est dans vos favoris.' : m.username + ' est retiré de vos favoris.', 'success');
                } catch (e) { info(e.message || 'Action impossible', 'error'); }
                favM.disabled = false;
            });
            act.appendChild(favM);
        }
        act.appendChild(boutonPartager(m));
        carte.appendChild(act);
        onglets(m);

        // Signaler · Bloquer (l'équipe de modération ne peut pas être bloquée)
        var sec = el('div', 'mb-securite');
        var sig = bouton('discret', '🚩 Signaler');
        sig.addEventListener('click', function () {
            if (window.EvcSecurite) EvcSecurite.signaler({ type: 'user', userId: m.id, username: m.username, peutBloquer: !!m.peutBloquer });
        });
        sec.appendChild(sig);
        if (m.peutBloquer) {
            var bl = bouton('discret', '🚫 Bloquer');
            bl.addEventListener('click', async function () {
                if (!window.EvcSecurite) return;
                if (await EvcSecurite.bloquer(m.id, m.username)) bloque(m);
            });
            sec.appendChild(bl);
        }
        carte.appendChild(sec);
        if (!m.isLive) carte.appendChild(el('p', 'mb-note', m.online ? 'Pour la cam, il ou elle pourra accepter ou refuser.' : 'Demande de cam possible quand il ou elle est connecté.'));
    }

    // ---------- Partager le profil (lien réservé aux membres connectés) ----------
    function boutonPartager(m) {
        var b = bouton('', '🔗 Partager');
        b.addEventListener('click', async function () {
            var url = location.origin + '/membre.html?u=' + encodeURIComponent(m.username);
            try {
                if (navigator.share) { await navigator.share({ title: m.username + ' sur E-VISIOCAM', url: url }); return; }
                await navigator.clipboard.writeText(url);
                info('Lien du profil copié (visible seulement par les membres connectés).', 'success');
            } catch (e) {}
        });
        return b;
    }

    // ---------- Onglets : Présentation · Rencontre · Photos ----------
    var OPTIONS = null;
    async function options() {
        if (OPTIONS) return OPTIONS;
        try { OPTIONS = await (await fetch(API_URL + '/models/profil-options')).json(); } catch (e) { OPTIONS = {}; }
        return OPTIONS;
    }
    function onglets(m) {
        var zone = el('div', 'mb-onglets-zone');
        var barre = el('div', 'mb-onglets'); barre.setAttribute('role', 'tablist');
        var panneau = el('div', 'mb-panneau'); panneau.setAttribute('role', 'tabpanel');
        var liste = [['presentation', 'Présentation'], ['rencontre', 'Rencontre'], ['photos', 'Photos' + (m.compteurs && m.compteurs.photos ? ' (' + m.compteurs.photos + ')' : '')]];
        liste.forEach(function (o, i) {
            var t = bouton('mb-onglet', o[1]); t.setAttribute('role', 'tab'); t.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
            t.addEventListener('click', function () {
                barre.querySelectorAll('.mb-onglet').forEach(function (x) { x.setAttribute('aria-selected', x === t ? 'true' : 'false'); });
                remplir(o[0]);
            });
            barre.appendChild(t);
        });
        zone.appendChild(barre); zone.appendChild(panneau); carte.appendChild(zone);
        function bloc(titre, texte) { var b = el('div', 'mb-bio'); b.appendChild(el('h2', '', titre)); if (texte !== undefined) b.appendChild(el('p', '', texte)); panneau.appendChild(b); return b; }
        function puces(parent, cles, dico) { var d = el('div', 'mb-badges'); cles.forEach(function (k) { d.appendChild(el('span', 'mb-badge', (dico || {})[k] || k)); }); parent.appendChild(d); }
        async function remplir(quoi) {
            panneau.textContent = '';
            var pr = m.profil || {}, o = await options();
            if (quoi === 'presentation') {
                var GENRES = { couple: 'Couple', femme: 'Femme', homme: 'Homme', trans: 'Trans' };
                var qui = [GENRES[m.genre] || 'Membre'];
                if ((pr.ages || []).length) qui.push(pr.ages.join(' / ') + ' ans');
                bloc('Qui', qui.join(' · '));
                if (pr.annonce) bloc('Annonce', pr.annonce);
                if (m.bio) bloc('À propos', m.bio);
                if (!pr.annonce && !m.bio) panneau.appendChild(el('p', 'mb-note', m.moi ? 'Ajoutez une annonce dans Mon compte pour vous présenter.' : m.username + ' n’a pas encore écrit d’annonce.'));
            } else if (quoi === 'rencontre') {
                var T = o.tendances || {}, S = o.silhouettes || {};
                var noms = { hf: ['Monsieur', 'Madame'], ff: ['Elle', 'Elle'], hh: ['Lui', 'Lui'] }[pr.couple] || ['', ''];
                [pr.p1, pr.p2].forEach(function (x, i) {
                    if (!x || !(x.tendance || x.silhouette || x.taille)) return;
                    var d = [T[x.tendance], S[x.silhouette], x.taille ? x.taille + ' cm' : ''].filter(Boolean).join(' · ');
                    bloc(m.genre === 'couple' ? noms[i] : 'Profil', d);
                });
                if ((pr.recherche || []).length) puces(bloc('Recherche'), pr.recherche, o.recherche);
                if ((pr.interets || []).length) puces(bloc('Intérêts'), pr.interets, o.interets);
                if (m.dispo) bloc('Disponibilité', (m.dispo.type === 'soir' ? 'Libre ce soir' : 'Libre ce week-end') + (m.dispo.envie && o.envies ? ' · ' + (o.envies[m.dispo.envie] || '') : ''));
                if (!panneau.childNodes.length) panneau.appendChild(el('p', 'mb-note', 'Profil de rencontre pas encore rempli.'));
            } else {
                var d;
                try { d = await apiCall('/albums/membre/' + Number(m.id)); } catch (e) { panneau.appendChild(el('p', 'mb-note', 'Album indisponible pour le moment.')); return; }
                if (!d.nb && !(d.photos || []).length) { panneau.appendChild(el('p', 'mb-note', m.moi ? 'Votre album privé est vide : ajoutez des photos dans Mon compte.' : 'Aucune photo privée.')); return; }
                if (d.verrouille) {
                    var v = el('div', 'mb-vide'); v.appendChild(el('div', 'mb-icone', '🔒'));
                    v.appendChild(el('p', 'text-lg font-bold', 'Album privé · ' + d.nb + ' photo' + (d.nb > 1 ? 's' : '')));
                    var dem = bouton('principal', d.demande ? '⏳ Demande envoyée' : '🔑 Demander l’accès'); dem.disabled = !!d.demande; dem.style.display = 'inline-flex'; dem.style.marginTop = '10px';
                    dem.addEventListener('click', async function () {
                        dem.disabled = true;
                        try { await apiCall('/albums/membre/' + Number(m.id) + '/demande', { method: 'POST', body: '{}' }); dem.textContent = '⏳ Demande envoyée'; }
                        catch (e) { info(e.message, 'error'); dem.disabled = false; }
                    });
                    v.appendChild(dem); panneau.appendChild(v); return;
                }
                var g = el('div', 'mb-galerie'), base = String(API_URL).replace(/\/api\/?$/, '');
                (d.photos || []).forEach(function (p) {
                    var b = bouton('mb-vignette', ''); var img = el('img'); img.alt = p.legende || ''; b.appendChild(img);
                    fetch(base + p.url, { credentials: 'include' }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (bl) { if (bl) img.src = URL.createObjectURL(bl); });
                    // Agrandir : la mini-fiche (membres-social.js) propose aussi « Signaler »
                    b.addEventListener('click', function () { var f = el('button'); f.hidden = true; f.setAttribute('data-fiche', Number(m.id)); document.body.appendChild(f); f.click(); f.remove(); });
                    g.appendChild(b);
                });
                panneau.appendChild(g);
                if (!m.moi) panneau.appendChild(el('p', 'mb-note', 'Pour agrandir ou signaler une photo, touchez-la : la fiche du membre s’ouvre.'));
            }
        }
        remplir('presentation');
    }

    // ---------- Amis : Ajouter / Demande envoyée / Accepter / Ami ✓ — Retirer ----------
    function boutonsAmi(m) {
        var zone = el('div', 'mb-amis');
        zone.setAttribute('data-ami-zone', '');
        zone.style.cssText = 'grid-column:1/-1;display:flex;gap:10px;flex-wrap:wrap';
        function plein(b) { b.style.flex = '1 1 120px'; return b; }
        function action(fn) {
            return async function () {
                zone.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
                try { await fn(); } catch (e) { info(e.message || 'Action impossible', 'error'); }
                dessinerAmi();
            };
        }
        function dessinerAmi() {
            zone.textContent = '';
            var r = m.ami || { statut: 'aucun' };
            zone.setAttribute('data-ami-statut', r.statut);
            if (r.statut === 'amis') {
                var ok = plein(bouton('actif', '👥 Ami ✓')); ok.disabled = true; ok.style.opacity = '1'; ok.style.cursor = 'default'; ok.style.color = '#22c55e';
                var ret = plein(bouton('discret', 'Retirer'));
                ret.setAttribute('data-ami-action', 'retirer');
                ret.addEventListener('click', action(async function () {
                    if (!confirm('Retirer ' + m.username + ' de vos amis ?')) return;
                    await apiCall('/amis/' + Number(m.id), { method: 'DELETE' });
                    m.ami = { statut: 'aucun', demandeId: null };
                    info(m.username + ' ne fait plus partie de vos amis.', 'success');
                }));
                zone.appendChild(ok); zone.appendChild(ret);
            } else if (r.statut === 'envoyee') {
                var env = plein(bouton('discret', '⏳ Demande envoyée'));
                env.title = 'Cliquez pour annuler la demande';
                env.setAttribute('data-ami-action', 'annuler');
                env.addEventListener('click', action(async function () {
                    if (!confirm('Annuler votre demande d’ami à ' + m.username + ' ?')) return;
                    await apiCall('/amis/demandes/' + Number(r.demandeId), { method: 'DELETE' });
                    m.ami = { statut: 'aucun', demandeId: null };
                }));
                zone.appendChild(env);
            } else if (r.statut === 'recue') {
                var acc = plein(bouton('', '✅ Accepter la demande d’ami'));
                acc.setAttribute('data-ami-action', 'accepter');
                acc.style.background = '#22c55e'; acc.style.color = '#fff';
                acc.addEventListener('click', action(async function () {
                    var rep = await apiCall('/amis/demandes/' + Number(r.demandeId) + '/accepter', { method: 'POST' });
                    m.ami = rep.relation;
                    info('👥 Vous êtes maintenant amis avec ' + m.username + ' !', 'success');
                    if (window.EvcAmis) EvcAmis.actualiser();
                }));
                var ref = plein(bouton('discret', 'Refuser'));
                ref.setAttribute('data-ami-action', 'refuser');
                ref.addEventListener('click', action(async function () {
                    await apiCall('/amis/demandes/' + Number(r.demandeId), { method: 'DELETE' });
                    m.ami = { statut: 'aucun', demandeId: null };
                    if (window.EvcAmis) EvcAmis.actualiser();
                }));
                zone.appendChild(acc); zone.appendChild(ref);
            } else {
                var aj = plein(bouton('', '➕ Ajouter en ami'));
                aj.setAttribute('data-ami-action', 'ajouter');
                aj.addEventListener('click', action(async function () {
                    var rep = await apiCall('/amis/demandes', { method: 'POST', body: JSON.stringify({ userId: Number(m.id) }) });
                    m.ami = rep.relation;
                    info(rep.message || 'Demande d’ami envoyée.', 'success');
                }));
                zone.appendChild(aj);
            }
        }
        dessinerAmi();
        return zone;
    }

    // Après un blocage, le profil n'est plus visible : on propose d'annuler
    function bloque(m) {
        carte.textContent = '';
        var v = el('div', 'mb-vide');
        v.appendChild(el('div', 'mb-icone', '🚫'));
        v.appendChild(el('p', 'text-lg font-bold text-slate-900', m.username + ' est bloqué'));
        v.appendChild(el('p', 'text-sm text-slate-500', 'Il ou elle ne peut plus vous contacter et vous ne verrez plus ses messages. Vous retrouvez la liste dans « Mon profil ».'));
        var rang = el('div', 'mb-securite');
        var annuler = bouton('discret', 'Débloquer');
        annuler.addEventListener('click', async function () {
            annuler.disabled = true;
            if (await EvcSecurite.debloquer(m.id, m.username)) charger(); else annuler.disabled = false;
        });
        rang.appendChild(annuler);
        rang.appendChild(lien('discret', 'Mes membres bloqués', 'profile.html#blocages'));
        v.appendChild(rang);
        carte.appendChild(v);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', charger); else charger();
})();
