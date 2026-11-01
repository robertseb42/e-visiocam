// ============================================================
// Profil d'un membre : membre.html?u=<pseudo>
// ------------------------------------------------------------
// Photo (seulement si validée par la modération), pseudo, rôle, département (jamais la ville),
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
        if (m.departement) lignes.appendChild(el('span', '', '📍 ' + m.departement + (m.departementNom ? ' · ' + m.departementNom : '')));
        bloc.appendChild(lignes);
        tete.appendChild(bloc);
        carte.appendChild(tete);

        // ---------- Badges du programme de récompenses ----------
        var chips = [];
        if (m.insigne && m.insigne.nom) chips.push((m.insigne.icone || '') + ' ' + m.insigne.nom);
        (m.badges || []).forEach(function (b) { if (b && b.nom) chips.push((b.icone || '') + ' ' + b.nom); });
        if (chips.length) {
            var bd = el('div', 'mb-badges');
            chips.forEach(function (c) { bd.appendChild(el('span', 'mb-badge', c.trim())); });
            carte.appendChild(bd);
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

        // ---------- Bio ----------
        if (m.bio) {
            var bio = el('div', 'mb-bio text-slate-700');
            bio.appendChild(el('h2', '', 'À propos'));
            bio.appendChild(el('p', '', m.bio));
            carte.appendChild(bio);
        }

        // ---------- Actions ----------
        var act = el('div', 'mb-actions');
        if (m.moi) {
            act.appendChild(lien('principal', '✏️ Modifier mon profil', 'compte.html'));
            carte.appendChild(act);
            carte.appendChild(el('p', 'mb-note', 'C’est votre profil tel que les autres membres le voient.'));
            return;
        }
        act.appendChild(lien('principal', '💬 Envoyer un message', 'messages.html?ecrire=' + Number(m.id)));
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
        carte.appendChild(act);

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
