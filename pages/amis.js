// ============================================================
// Mes amis : amis.html  (#enligne · #tous · #recues · #envoyees)
// ------------------------------------------------------------
// Données : GET /api/amis (présence, salon public, live), GET /api/amis/demandes,
// actions : POST /api/amis/demandes, …/accepter, DELETE /api/amis/demandes/:id, DELETE /api/amis/:id,
// réglages : PUT /api/amis/reglages. Tout texte venant des membres est inséré avec textContent.
// ============================================================
(function () {
    'use strict';
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        location.href = 'login.html?redirect=' + encodeURIComponent('amis.html' + location.hash);
        return;
    }

    var ONGLETS = ['enligne', 'tous', 'recues', 'envoyees'];
    var panneau = document.getElementById('amPanneau');
    var courant = ONGLETS.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : 'enligne';
    var donnees = { amis: null, recues: [], envoyees: [], reglages: null };
    var choixFait = ONGLETS.indexOf(location.hash.slice(1)) >= 0;

    // ---------- Styles (CSP : style-src autorise les styles en ligne) ----------
    var css = [
        '.am-onglets{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px;padding:4px;border-radius:14px;background:rgba(127,127,127,.12)}',
        '.am-onglets button{min-height:42px;padding:6px 4px;border:0;border-radius:10px;background:transparent;color:#e4e4ea;font:700 13.5px/1.2 Inter,system-ui,sans-serif;cursor:pointer;white-space:nowrap}',
        'html[data-theme="light"] .am-onglets button{color:#334155}',
        '.am-onglets button[aria-selected="true"]{background:#ffe500;color:#111113;opacity:1}',
        'html[data-theme="light"] .am-onglets button[aria-selected="true"]{background:#e91e63;color:#fff}',
        '.am-onglets span:not(:empty){display:inline-block;min-width:18px;margin-left:3px;padding:1px 6px;border-radius:999px;background:rgba(127,127,127,.25);font-size:11.5px}',
        '.am-onglets button[data-am-tab="recues"] span.am-alerte{background:#a855f7;color:#fff}',
        '.am-panneau{padding:6px 0;overflow:hidden}',
        '.am-ligne{display:flex;align-items:center;gap:12px;padding:12px 16px;border-top:1px solid rgba(127,127,127,.18)}',
        '.am-ligne:first-child{border-top:0}',
        '.am-photo{position:relative;flex:none;width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#ff1680,#7c3aed);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:20px;text-decoration:none}',
        '.am-photo img{width:100%;height:100%;object-fit:cover;border-radius:50%}',
        '.am-photo i{position:absolute;right:0;bottom:0;width:14px;height:14px;border-radius:50%;border:2px solid #1c1c20;background:#8b8b96}',
        'html[data-theme="light"] .am-photo i{border-color:#fff}',
        '.am-photo i.on{background:#22c55e}.am-photo i.live{background:#f43f5e}',
        '.am-info{flex:1;min-width:0}',
        '.am-nom{display:block;font-weight:800;font-size:15.5px;color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.am-statut{margin:2px 0 0;font-size:12.5px;opacity:.75;overflow-wrap:anywhere}',
        '.am-statut.on{color:#22c55e;opacity:1}.am-statut.live{color:#f43f5e;opacity:1}',
        '.am-boutons{display:flex;flex-wrap:wrap;gap:6px;justify-content:flex-end}',
        '.am-boutons .mb-btn{min-height:38px;padding:7px 12px;font-size:13px;border-radius:11px}',
        '.am-boutons .mb-btn.principal{grid-column:auto}',
        '.am-boutons .mb-btn.vert{background:#22c55e;color:#fff}',
        '.am-vide{padding:34px 18px;text-align:center;font-size:14px;opacity:.85}',
        '.am-vide b{display:block;font-size:16px;margin-bottom:4px}',
        '.am-ajouter,.am-reglages{margin-top:14px;padding:16px}',
        '.am-ligne-form{display:flex;gap:8px;margin-top:8px}',
        '.am-champ{flex:1;min-width:0;min-height:46px;padding:10px 14px;border-radius:12px;border:1px solid rgba(127,127,127,.35);background:transparent;color:inherit;font:500 15px Inter,system-ui,sans-serif}',
        '.am-envoyer{flex:none;width:auto;padding:10px 16px}',
        '.am-option{display:flex;gap:12px;align-items:flex-start;margin-top:12px;cursor:pointer;font-size:14px}',
        '.am-option input{flex:none;width:20px;height:20px;margin-top:2px;accent-color:#a855f7}',
        '.am-option small{display:block;font-size:12px;opacity:.65;margin-top:2px}',
        '@media (max-width:560px){',
        '  .am-ligne{flex-wrap:wrap;padding:12px}',
        '  .am-boutons{width:100%;justify-content:stretch}',
        '  .am-boutons .mb-btn{flex:1 1 30%}',
        '  .am-onglets{gap:2px}',
        '  .am-onglets button{font-size:12px;padding:6px 2px}',
        '  .am-onglets span:not(:empty){margin-left:2px;padding:1px 5px;font-size:11px}',
        '}'
    ].join('\n');
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

    function el(tag, cls, texte) { var n = document.createElement(tag); if (cls) n.className = cls; if (texte !== undefined) n.textContent = texte; return n; }
    function info(texte, type) {
        if (window.EvcSecurite) EvcSecurite.toast(texte, type);
        else if (typeof showToast === 'function') showToast(texte, type);
    }
    function bouton(cls, texte, action) { var b = el('button', 'mb-btn ' + (cls || ''), texte); b.type = 'button'; if (action) b.setAttribute('data-action', action); return b; }
    function lien(cls, texte, url) { var a = el('a', 'mb-btn ' + (cls || ''), texte); a.href = url; return a; }
    function profil(nom) { return 'membre.html?u=' + encodeURIComponent(nom); }
    function photo(m, etat) {
        var a = el('a', 'am-photo', (m.username || '?').charAt(0).toUpperCase());
        a.href = profil(m.username); a.setAttribute('aria-label', 'Profil de ' + m.username);
        var src = typeof urlAvatar === 'function' ? urlAvatar(m.avatar) : null;
        if (src) { a.textContent = ''; var img = new Image(); img.alt = ''; img.src = src; a.appendChild(img); }
        if (etat !== undefined) a.appendChild(el('i', etat));
        return a;
    }
    function vide(titre, texte) {
        var v = el('div', 'am-vide');
        v.appendChild(el('b', '', titre));
        if (texte) v.appendChild(el('span', '', texte));
        return v;
    }

    // ---------- Chargement ----------
    var enCours = false;
    async function charger() {
        if (enCours) return;
        enCours = true;
        try {
            var res = await Promise.all([apiCall('/amis'), apiCall('/amis/demandes')]);
            donnees.amis = res[0].amis || [];
            donnees.reglages = res[0].reglages || null;
            donnees.recues = res[1].recues || [];
            donnees.envoyees = res[1].envoyees || [];
            if (window.EvcAmis) EvcAmis.badge(donnees.recues.length);
            // Premier affichage sans courant demandé : les demandes reçues d'abord, sinon « Tous » si personne n'est en ligne
            if (!choixFait) {
                choixFait = true;
                if (donnees.recues.length) courant = 'recues';
                else if (!donnees.amis.some(function (a) { return a.online; }) && donnees.amis.length) courant = 'tous';
            }
            dessiner();
            reglages();
        } catch (e) {
            if (e.status === 401) return;
            panneau.textContent = '';
            panneau.appendChild(vide('Liste indisponible', e.message || 'Réessayez dans un instant.'));
        } finally { enCours = false; }
    }

    function compter() {
        var c = {
            enligne: donnees.amis.filter(function (a) { return a.online; }).length,
            tous: donnees.amis.length, recues: donnees.recues.length, envoyees: donnees.envoyees.length
        };
        document.querySelectorAll('[data-compte]').forEach(function (s) {
            var k = s.getAttribute('data-compte');
            s.textContent = c[k] ? String(c[k]) : '';
            s.classList.toggle('am-alerte', k === 'recues' && c[k] > 0);
        });
    }

    function dessiner() {
        compter();
        document.querySelectorAll('[data-am-tab]').forEach(function (b) {
            var actif = b.getAttribute('data-am-tab') === courant;
            b.setAttribute('aria-selected', actif ? 'true' : 'false');
            b.tabIndex = actif ? 0 : -1;
        });
        panneau.setAttribute('aria-labelledby', 'am-tab-' + courant);
        panneau.textContent = '';
        if (courant === 'recues' || courant === 'envoyees') return dessinerDemandes();
        var liste = courant === 'enligne' ? donnees.amis.filter(function (a) { return a.online; }) : donnees.amis;
        if (!liste.length) {
            panneau.appendChild(courant === 'enligne' && donnees.amis.length
                ? vide('Aucun ami en ligne', 'Vous serez prévenu quand l’un d’eux se connecte.')
                : vide('Vous n’avez pas encore d’amis', 'Ouvrez le profil d’un membre et touchez « Ajouter en ami ».'));
            return;
        }
        liste.forEach(function (a) { panneau.appendChild(ligneAmi(a)); });
    }

    function ligneAmi(a) {
        var etat = a.enLive ? 'live' : (a.online ? 'on' : '');
        var r = el('div', 'am-ligne'); r.setAttribute('data-ami', String(a.id));
        r.appendChild(photo(a, etat));
        var i = el('div', 'am-info');
        var n = el('a', 'am-nom', a.username); n.href = profil(a.username); i.appendChild(n);
        var txt;
        if (a.masquee) txt = 'Présence masquée';
        else if (a.enLive) txt = '🔴 En direct' + (a.live && a.live.salon ? ' dans « ' + a.live.salon + ' »' : '');
        else if (a.online) txt = 'En ligne' + (a.salon ? ' · dans « ' + a.salon.nom + ' »' : '');
        else txt = a.vu ? 'Vu ' + a.vu : 'Hors ligne';
        i.appendChild(el('p', 'am-statut ' + etat, txt));
        r.appendChild(i);
        var b = el('div', 'am-boutons');
        b.appendChild(lien('principal', '💬 Écrire', 'messages.html?ecrire=' + Number(a.id)));
        b.appendChild(lien('', 'Voir le profil', profil(a.username)));
        if (a.enLive && a.live && a.live.streamId && a.live.salon) {
            b.appendChild(lien('rouge', '🎥 Regarder', 'live.html?join=' + encodeURIComponent(a.live.streamId) + '&from=' + encodeURIComponent(a.username)));
        } else if (a.salon && a.salon.slug) {
            b.appendChild(lien('vert', 'Rejoindre son salon', 'chat.html?theme=' + encodeURIComponent(a.salon.slug)));
        }
        if (courant === 'tous') {
            var ret = bouton('discret', 'Retirer', 'retirer');
            ret.addEventListener('click', async function () {
                if (!confirm('Retirer ' + a.username + ' de vos amis ?')) return;
                ret.disabled = true;
                try {
                    await apiCall('/amis/' + Number(a.id), { method: 'DELETE' });
                    donnees.amis = donnees.amis.filter(function (x) { return x.id !== a.id; });
                    info(a.username + ' ne fait plus partie de vos amis.', 'success');
                    dessiner();
                } catch (e) { info(e.message || 'Action impossible', 'error'); ret.disabled = false; }
            });
            b.appendChild(ret);
        }
        r.appendChild(b);
        return r;
    }

    function dessinerDemandes() {
        var recues = courant === 'recues';
        var liste = recues ? donnees.recues : donnees.envoyees;
        if (!liste.length) {
            panneau.appendChild(recues ? vide('Aucune demande reçue', 'Les demandes d’ami que l’on vous envoie apparaissent ici.')
                : vide('Aucune demande en attente', 'Ajoutez un ami depuis son profil ou avec son pseudo ci-dessous.'));
            return;
        }
        liste.forEach(function (d) {
            var r = el('div', 'am-ligne'); r.setAttribute('data-demande', String(d.id));
            r.appendChild(photo(d.membre));
            var i = el('div', 'am-info');
            var n = el('a', 'am-nom', d.membre.username); n.href = profil(d.membre.username); i.appendChild(n);
            i.appendChild(el('p', 'am-statut', recues ? 'Vous a demandé en ami' : 'Demande envoyée, en attente'));
            r.appendChild(i);
            var b = el('div', 'am-boutons');
            function agir(btn, fn) {
                btn.addEventListener('click', async function () {
                    b.querySelectorAll('button').forEach(function (x) { x.disabled = true; });
                    try { await fn(); await charger(); if (window.EvcAmis) EvcAmis.actualiser(); }
                    catch (e) { info(e.message || 'Action impossible', 'error'); b.querySelectorAll('button').forEach(function (x) { x.disabled = false; }); }
                });
                b.appendChild(btn);
            }
            if (recues) {
                agir(bouton('vert', '✅ Accepter', 'accepter'), async function () {
                    await apiCall('/amis/demandes/' + Number(d.id) + '/accepter', { method: 'POST' });
                    info('👥 Vous êtes maintenant amis avec ' + d.membre.username + ' !', 'success');
                });
                agir(bouton('discret', 'Refuser', 'refuser'), function () { return apiCall('/amis/demandes/' + Number(d.id), { method: 'DELETE' }); });
            } else {
                b.appendChild(lien('', 'Voir le profil', profil(d.membre.username)));
                agir(bouton('discret', 'Annuler', 'annuler'), function () { return apiCall('/amis/demandes/' + Number(d.id), { method: 'DELETE' }); });
            }
            r.appendChild(b);
            panneau.appendChild(r);
        });
    }

    // ---------- Onglets (clic + flèches du clavier) ----------
    function choisir(o, focus) {
        courant = o; choixFait = true;
        try { history.replaceState(null, '', '#' + o); } catch (e) {}
        dessiner();
        if (focus) { var b = document.querySelector('[data-am-tab="' + o + '"]'); if (b) b.focus(); }
    }
    document.getElementById('amOnglets').addEventListener('click', function (e) {
        var b = e.target.closest('[data-am-tab]');
        if (b && donnees.amis) choisir(b.getAttribute('data-am-tab'));
    });
    document.getElementById('amOnglets').addEventListener('keydown', function (e) {
        if (!donnees.amis || (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft')) return;
        var k = ONGLETS.indexOf(courant) + (e.key === 'ArrowRight' ? 1 : -1);
        choisir(ONGLETS[(k + ONGLETS.length) % ONGLETS.length], true);
        e.preventDefault();
    });
    window.addEventListener('hashchange', function () {
        var h = location.hash.slice(1);
        if (ONGLETS.indexOf(h) >= 0 && h !== courant && donnees.amis) { courant = h; choixFait = true; dessiner(); charger(); }
    });

    // ---------- Ajouter par pseudo ----------
    var form = document.getElementById('amAjouter');
    form.addEventListener('submit', async function (e) {
        e.preventDefault();
        var champ = document.getElementById('amPseudo');
        var pseudo = champ.value.trim();
        if (!pseudo) return;
        var btn = form.querySelector('button'); btn.disabled = true;
        try {
            var r = await apiCall('/amis/demandes', { method: 'POST', body: JSON.stringify({ pseudo: pseudo }) });
            info(r.message || 'Demande envoyée.', 'success');
            champ.value = '';
            choixFait = true;
            courant = r.relation && r.relation.statut === 'amis' ? 'tous' : 'envoyees';
            await charger();
        } catch (err) { info(err.message || 'Demande impossible', 'error'); }
        btn.disabled = false;
    });

    // ---------- Réglages ----------
    var cases = { prevenirConnexion: document.getElementById('amPrevenir'), masquerPresence: document.getElementById('amMasquer'), pushAmis: document.getElementById('amPush') };
    function reglages() {
        var r = donnees.reglages; if (!r) return;
        cases.prevenirConnexion.checked = !!r.prevenirConnexion;
        cases.masquerPresence.checked = !!r.masquerPresence;
        var sansAppareil = r.pushAmis === null || r.pushAmis === undefined;   // aucun appareil abonné aux notifications
        var ligne = document.getElementById('amPushLigne');
        ligne.hidden = sansAppareil; ligne.style.display = sansAppareil ? 'none' : '';
        cases.pushAmis.checked = !!r.pushAmis;
    }
    Object.keys(cases).forEach(function (k) {
        cases[k].addEventListener('change', async function () {
            var corps = {}; corps[k] = cases[k].checked;
            cases[k].disabled = true;
            try {
                var r = await apiCall('/amis/reglages', { method: 'PUT', body: JSON.stringify(corps) });
                donnees.reglages = r.reglages; reglages();
                info('Réglage enregistré.', 'success');
            } catch (e) { cases[k].checked = !cases[k].checked; info(e.message || 'Réglage impossible', 'error'); }
            cases[k].disabled = false;
        });
    });

    // ---------- Rafraîchissement ----------
    setInterval(function () { if (!document.hidden) charger(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) charger(); });
    window.addEventListener('evc:amis-demandes', function (e) {
        if (e.detail && donnees.amis && e.detail.count !== donnees.recues.length) charger();
    });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', charger); else charger();
})();
