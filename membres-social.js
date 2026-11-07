// ============================================================
// E-VISIOCAM — Fiche membre + demandes de cam (toutes les pages)
// ------------------------------------------------------------
//   EvcFiche.ouvrir(id)        petite fenêtre : photo, pseudo, niveau, badges, bio, « membre depuis »,
//                              boutons Message · Demander la cam · Voir sa caméra
//   EvcCam.demander(id, nom)   envoie une demande de cam (l'autre accepte ou refuse)
// Les demandes reçues et les réponses arrivent toutes les 15 s (et tout de suite si la page
// a une connexion temps réel) sous forme de cartes en haut à droite.
// Accepter ouvre la page Live avec un live privé préparé : seul le demandeur est invité,
// et c'est le membre qui clique lui-même sur « Démarrer mon live ».
// Tout le texte venant des membres est inséré avec textContent (jamais de HTML).
// ============================================================
(function () {
    'use strict';
    if (window.EvcCam) return;

    var page = ((function (p) { return p && p.indexOf('.') === -1 ? p + '.html' : p; })(location.pathname.split('/').pop()) || 'index.html').toLowerCase();
    var SANS = ['login.html', 'register.html', 'forgot-password.html', 'reset-password.html', 'nouveau-mdp.html', 'verifier-email.html', '404.html'];
    function connecte() { return typeof getCurrentUser === 'function' && !!getCurrentUser(); }
    function base() { return (typeof API_URL === 'string' ? API_URL : 'https://api.e-visiocam.com/api'); }
    function photoDe(chemin) { return typeof urlAvatar === 'function' ? urlAvatar(chemin) : null; }
    // Avec la radio continue, la page tourne dans un cadre : les notifications et la fiche s'affichent
    // dans la fenêtre principale, au-dessus de la radio (sinon la radio les cache)
    function haut() { try { if (window.top !== window && window.top.document && window.top.document.body) return window.top.document; } catch (e) {} return document; }
    function fenetre() { try { if (window.top !== window && window.top.document) return window.top; } catch (e) {} return window; }
    function el(tag, cls, texte) { var n = haut().createElement(tag); if (cls) n.className = cls; if (texte !== undefined) n.textContent = texte; return n; }
    async function api(chemin, opts) {
        if (typeof apiCall === 'function') return apiCall(chemin, opts);
        var r = await fetch(base() + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts || {}));
        var d = await r.json().catch(function () { return {}; });
        if (!r.ok) throw new Error(d.error || 'Erreur');
        return d;
    }
    // Navigation : dans le cadre de la radio continue, on change la page du cadre (la radio continue de jouer)
    function aller(url) { location.href = url; }

    // ---------- Styles ----------
    var css = [
        '.evs-voile{position:fixed;inset:0;z-index:2147482000;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:16px;animation:evsIn .15s ease}',
        '.evs-fiche{position:relative;width:100%;max-width:360px;background:#1c1c20;color:#f5f5f7;border:1px solid #33333b;border-radius:22px;padding:22px 20px 18px;text-align:center;box-shadow:0 24px 70px rgba(0,0,0,.55);font-family:Inter,system-ui,sans-serif}',
        'html[data-theme="light"] .evs-fiche{background:#fff;color:#14161c;border-color:#e2e8f0}',
        '.evs-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:0;background:rgba(127,127,127,.15);color:inherit;font-size:16px;cursor:pointer}',
        '.evs-photo{width:128px;height:128px;margin:0 auto 12px;border-radius:50%;overflow:hidden;background:linear-gradient(135deg,#ff1680,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:52px;font-weight:900;color:#fff;box-shadow:0 0 0 4px rgba(255,229,0,.0)}',
        '.evs-photo.on{box-shadow:0 0 0 4px #ffe500}.evs-photo.live{box-shadow:0 0 0 4px #f43f5e,0 0 26px rgba(244,63,94,.5)}',
        '.evs-photo img{width:100%;height:100%;object-fit:cover}',
        '.evs-nom{margin:0;font-size:20px;font-weight:900;display:flex;align-items:center;justify-content:center;gap:8px}',
        '.evs-point{width:11px;height:11px;border-radius:50%;flex:none}.evs-point.on{background:#ffe500}.evs-point.live{background:#f43f5e}',
        '.evs-sous{margin:4px 0 0;font-size:12.5px;opacity:.7}',
        '.evs-badges{display:flex;flex-wrap:wrap;gap:6px;justify-content:center;margin:12px 0 0}',
        '.evs-badge{font-size:11.5px;font-weight:700;padding:4px 9px;border-radius:999px;background:rgba(127,127,127,.15)}',
        '.evs-bio{margin:14px 0 0;font-size:13.5px;line-height:1.55;opacity:.9;white-space:pre-line;word-break:break-word}',
        '.evs-actions{display:flex;flex-direction:column;gap:8px;margin-top:18px}',
        '.evs-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:11px 14px;border-radius:12px;border:0;font-weight:800;font-size:14px;cursor:pointer;text-decoration:none;background:rgba(127,127,127,.16);color:inherit}',
        '.evs-btn.jaune{background:#ffe500;color:#111113}.evs-btn.rouge{background:#f43f5e;color:#fff}',
        '.evs-btn:disabled{opacity:.5;cursor:not-allowed}',
        '.evs-note{margin:10px 0 0;font-size:11.5px;opacity:.6}',
        '.evs-pile{position:fixed;top:78px;left:50%;transform:translateX(-50%);z-index:2147482500;display:flex;flex-direction:column;gap:10px;width:min(380px,calc(100vw - 32px))}',
        '.evs-carte{display:flex;gap:12px;align-items:flex-start;background:#1c1c20;color:#f5f5f7;border:1px solid #3b3b43;border-left:4px solid #ffe500;border-radius:16px;padding:12px 14px;box-shadow:0 14px 40px rgba(0,0,0,.45);font-family:Inter,system-ui,sans-serif;animation:evsIn .2s ease}',
        'html[data-theme="light"] .evs-carte{background:#fff;color:#14161c;border-color:#e2e8f0;border-left-color:#e91e63}',
        '.evs-carte.rouge{border-left-color:#f43f5e}',
        '.evs-mini{width:44px;height:44px;border-radius:50%;flex:none;overflow:hidden;background:linear-gradient(135deg,#ff1680,#7c3aed);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900}',
        '.evs-mini img{width:100%;height:100%;object-fit:cover}',
        '.evs-txt{flex:1;min-width:0}.evs-txt b{font-weight:800}.evs-txt p{margin:0;font-size:13.5px;line-height:1.45}',
        '.evs-txt small{display:block;margin-top:2px;font-size:11.5px;opacity:.65}',
        '.evs-rang{display:flex;gap:8px;margin-top:10px}.evs-rang .evs-btn{padding:8px 10px;font-size:13px}',
        '.evs-fermer{border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:15px;padding:0 0 0 4px}',
        '.evs-album{margin:14px 0 0;padding:12px;border-radius:14px;background:rgba(127,127,127,.1);text-align:left}',
        '.evs-album b{display:block;font-size:13.5px;margin-bottom:8px}',
        '.evs-album-grille{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}',
        '.evs-album-grille button{padding:0;border:0;border-radius:9px;overflow:hidden;aspect-ratio:1;cursor:zoom-in;background:rgba(127,127,127,.2)}',
        '.evs-album-grille img{width:100%;height:100%;object-fit:cover;display:block}',
        '.evs-zoom{position:fixed;inset:0;z-index:100002;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:16px}',
        '.evs-zoom img{max-width:100%;max-height:78vh;border-radius:12px}',
        '.evs-zoom-barre{display:flex;gap:8px;flex-wrap:wrap;justify-content:center}',
        '.evs-zoom-barre button,.evs-zoom-barre select{padding:9px 14px;border-radius:10px;border:0;font-weight:700;font-size:13px;cursor:pointer}',
        '@keyframes evsIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}',
        '@media (prefers-reduced-motion:reduce){.evs-voile,.evs-carte{animation:none}}'
    ].join('\n');
    function styles() {
        var d = haut();
        if (d.getElementById('evs-styles')) return;
        var s = d.createElement('style'); s.id = 'evs-styles'; s.textContent = css; d.head.appendChild(s);
    }
    function mini(id, nom) {
        var m = el('div', 'evs-mini', (nom || '?').charAt(0).toUpperCase());
        var img = new Image(); img.alt = '';
        img.onload = function () { m.textContent = ''; m.appendChild(img); };
        img.src = base().replace(/\/api\/?$/, '') + '/api/avatars/' + Number(id);   // 404 si pas de photo validée : on garde l'initiale
        return m;
    }

    // ---------- Petit message ----------
    function info(texte, type) {
        styles();   // toujours dans la pile du haut (un toast de la page serait caché par la radio)
        var c = el('div', 'evs-carte' + (type === 'error' ? ' rouge' : ''));
        c.appendChild(el('div', 'evs-txt')).appendChild(el('p', '', texte));
        pile().appendChild(c);
        setTimeout(function () { c.remove(); }, 6000);
    }
    function pile() {
        var d = haut(), p = d.getElementById('evs-pile');
        if (!p) { p = el('div', 'evs-pile'); p.id = 'evs-pile'; p.setAttribute('aria-live', 'polite'); d.body.appendChild(p); }
        return p;
    }
    // Sonnerie (jouée dans la fenêtre principale : c'est elle qui a le droit de faire du son, la radio y tourne)
    function son() {
        try {
            var W = fenetre(), A = W.AudioContext || W.webkitAudioContext; if (!A) return;
            var ctx = new A(), t;
            if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
            t = ctx.currentTime + 0.05;
            for (var k = 0; k < 3; k++) {
                [988, 1319, 1568].forEach(function (f, i) {
                    var o = ctx.createOscillator(), g = ctx.createGain(), d = t + k * 0.55 + i * 0.11;
                    o.frequency.value = f; o.type = 'triangle';
                    g.gain.setValueAtTime(0.0001, d); g.gain.exponentialRampToValueAtTime(0.32, d + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, d + 0.32);
                    o.connect(g); g.connect(ctx.destination); o.start(d); o.stop(d + 0.35);
                });
            }
            setTimeout(function () { try { ctx.close(); } catch (e) {} }, 2200);
        } catch (e) {}
        try { if (navigator.vibrate) navigator.vibrate([220, 120, 220]); } catch (e) {}
    }
    // L'onglet clignote tant qu'on n'y est pas revenu
    var clignote = null;
    function alerteTitre(texte) {
        var d = haut(), titre = d.title, n = 0;
        clearInterval(clignote);
        clignote = setInterval(function () {
            n++;
            d.title = n % 2 ? texte : titre;
            if (n > 20 || (n > 1 && d.hasFocus && d.hasFocus())) { clearInterval(clignote); d.title = titre; }
        }, 900);
    }

    // ============================================================
    // FICHE MEMBRE
    // ============================================================
    function fermerFiche() { var v = haut().getElementById('evs-voile'); if (v) v.remove(); haut().removeEventListener('keydown', echap); }
    function echap(e) { if (e.key === 'Escape') fermerFiche(); }
    // Libellés du profil libertin (une seule fois par page)
    var promesseOptions = null;
    function optionsProfil() {
        if (!promesseOptions) promesseOptions = fetch(API_URL + '/models/profil-options').then(function (r) { return r.json(); }).catch(function () { promesseOptions = null; return {}; });
        return promesseOptions;
    }
    // ---------- Album privé dans la fiche ----------
    var blobsAlbum = [];
    function imagePrivee(chemin, img) {
        fetch(base().replace(/\/api\/?$/, '') + chemin, { credentials: 'include' }).then(function (r) { return r.ok ? r.blob() : null; })
            .then(function (b) { if (b) { var u = URL.createObjectURL(b); blobsAlbum.push(u); img.src = u; } }).catch(function () {});
    }
    async function album(m, zone) {
        var d;
        try { d = await api('/albums/membre/' + Number(m.id)); } catch (e) { return; }
        if (!d || !d.nb) return;
        zone.hidden = false;
        zone.appendChild(el('b', '', '🔒 Album privé · ' + d.nb + ' photo' + (d.nb > 1 ? 's' : '')));
        if (d.verrouille) {
            var dem = el('button', 'evs-btn', d.demande ? '⏳ Demande envoyée' : '🔑 Demander l’accès'); dem.type = 'button'; dem.disabled = !!d.demande;
            dem.addEventListener('click', async function () {
                dem.disabled = true;
                try { await api('/albums/membre/' + Number(m.id) + '/demande', { method: 'POST', body: '{}' }); dem.textContent = '⏳ Demande envoyée'; }
                catch (x) { dem.disabled = false; if (typeof showToast === 'function') showToast(x.message, 'error'); }
            });
            zone.appendChild(dem);
            return;
        }
        var g = el('div', 'evs-album-grille');
        d.photos.forEach(function (p) {
            var b = el('button'); b.type = 'button'; b.title = 'Agrandir';
            var img = el('img'); img.alt = p.legende || 'Photo de l’album de ' + m.username; b.appendChild(img);
            imagePrivee(p.url, img);
            b.addEventListener('click', function () { zoom(p, img.src); });
            g.appendChild(b);
        });
        zone.appendChild(g);
    }
    // Agrandir une photo, avec « Signaler » (masquée aussitôt, revue par l'équipe)
    function zoom(p, src) {
        var doc = haut(), z = el('div', 'evs-zoom');
        var img = el('img'); img.src = src; img.alt = p.legende || '';
        var barre = el('div', 'evs-zoom-barre');
        var motif = el('select'); [['', '🚩 Signaler cette photo…'], ['mineur', 'Personne qui semble mineure'], ['escorting', 'Prostitution ou escorting'], ['sans_accord', 'Personne sans son accord'], ['violence', 'Violence ou contenu illégal'], ['coordonnees', 'Coordonnées ou publicité'], ['autre', 'Autre']]
            .forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; motif.appendChild(op); });
        var fermerZ = el('button', '', 'Fermer'); fermerZ.type = 'button';
        motif.addEventListener('change', async function () {
            if (!motif.value) return;
            try { var r = await api('/albums/photo/' + Number(p.id) + '/signaler', { method: 'POST', body: JSON.stringify({ motif: motif.value }) }); if (typeof showToast === 'function') showToast(r.message || 'Merci, la photo est signalée', 'success'); z.remove(); }
            catch (x) { if (typeof showToast === 'function') showToast(x.message, 'error'); }
        });
        fermerZ.addEventListener('click', function () { z.remove(); });
        z.addEventListener('click', function (e) { if (e.target === z) z.remove(); });
        barre.appendChild(motif); barre.appendChild(fermerZ);
        z.appendChild(img); z.appendChild(barre); doc.body.appendChild(z);
    }
    async function ouvrirFiche(id) {
        if (!connecte()) { aller('login.html'); return; }
        styles(); fermerFiche();
        var voile = el('div', 'evs-voile'); voile.id = 'evs-voile';
        var f = el('div', 'evs-fiche'); f.setAttribute('role', 'dialog'); f.setAttribute('aria-modal', 'true');
        f.appendChild(el('p', 'evs-sous', 'Chargement…'));
        voile.appendChild(f); haut().body.appendChild(voile);
        voile.addEventListener('click', function (e) { if (e.target === voile) fermerFiche(); });
        haut().addEventListener('keydown', echap);
        var m;
        var relation = api('/amis/relation/' + Number(id)).then(function (r) { return r.relation; }).catch(function () { return null; });
        try { m = (await api('/models/profil/' + Number(id))).membre; }
        catch (e) { f.textContent = ''; f.appendChild(el('p', 'evs-sous', e.message || 'Fiche indisponible')); return; }
        f.textContent = '';
        var x = el('button', 'evs-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Fermer'); x.onclick = fermerFiche; f.appendChild(x);
        var etat = m.isLive ? 'live' : (m.online || m.moi ? 'on' : '');
        var ph = el('div', 'evs-photo ' + etat, m.username.charAt(0).toUpperCase());
        var src = photoDe(m.avatar);
        if (src) { ph.textContent = ''; var img = new Image(); img.alt = 'Photo de ' + m.username; img.src = src; ph.appendChild(img); }
        else if (typeof window.evcMasque === 'function') { ph.innerHTML = window.evcMasque(m.gender, m.id); ph.style.overflow = 'hidden'; }
        f.appendChild(ph);
        var h = el('h2', 'evs-nom'); h.id = 'evs-nom';
        if (etat) h.appendChild(el('span', 'evs-point ' + etat));
        h.appendChild(haut().createTextNode(m.username));
        f.setAttribute('aria-labelledby', 'evs-nom');
        f.appendChild(h);
        var roles = { model: '⭐ Modèle', moderator: '🛡️ Modérateur', super_admin: '👑 Équipe E-VISIOCAM' };
        var depuis = m.createdAt ? new Date(String(m.createdAt).replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : '';
        var lignes = [m.isLive ? '🔴 En direct' : (m.online || m.moi ? '🟡 Connecté' : 'Hors ligne')];
        if (roles[m.role]) lignes.push(roles[m.role]);
        if (depuis) lignes.push('Membre depuis ' + depuis);
        if (m.ville) lignes.push('📍 ' + m.ville + (m.departement ? ' (' + m.departement + ')' : ''));
        else if (m.departement) lignes.push('📍 ' + m.departement + (window.EVC_DEPARTEMENTS && window.EVC_DEPARTEMENTS[m.departement] ? ' · ' + window.EVC_DEPARTEMENTS[m.departement] : ''));
        if (m.certifie) lignes.push('✔ Profil certifié');
        if (m.niveau) lignes.push('⭐ Niveau ' + m.niveau.n + '/8 · ' + m.niveau.nom);
        // « Libre ce soir / ce week-end »
        if (m.dispo) lignes.push((m.dispo.type === 'soir' ? '🌙 Libre ce soir' : '📅 Libre ce week-end') + (m.dispo.envie ? ' (' + ({ sortir: 'envie de sortir', recevoir: 'peut recevoir', rencontrer: 'envie de se rencontrer', cam: 'envie de cam' })[m.dispo.envie] + ')' : ''));
        // Distance approximative entre nos deux villes (par tranches de 5 km)
        if (m.distance) lignes.push('🚗 ' + (m.distance <= 5 ? 'À moins de 5 km' : 'À environ ' + m.distance + ' km'));
        // 🏡 Même département ou même région que moi (departements-data.js) : « près de chez vous »
        var moiDep = !m.moi && typeof getCurrentUser === 'function' && (getCurrentUser() || {}).departement;
        if (!m.distance && moiDep && m.departement && typeof window.evcProximite === 'function' && window.evcProximite(moiDep, m.departement)) lignes.push('🏡 Près de chez vous');
        f.appendChild(el('p', 'evs-sous', lignes.join(' · ')));
        var chips = [];
        if (m.insigne) chips.push(m.insigne.icone + ' ' + m.insigne.nom);
        (m.badges || []).forEach(function (b) { chips.push(b.icone + ' ' + b.nom); });
        if (chips.length) { var bd = el('div', 'evs-badges'); chips.forEach(function (c) { bd.appendChild(el('span', 'evs-badge', c)); }); f.appendChild(bd); }
        if (m.bio) f.appendChild(el('p', 'evs-bio', m.bio));
        // 💞 Profil libertin : qui il est, qui il recherche, intérêts, annonce (libellés fournis par le serveur)
        var pr = m.profil;
        if (pr) {
            var o = await optionsProfil();
            var T = o.tendances || {}, nomsP = { hf: ['Monsieur', 'Madame'], ff: ['Elle', 'Elle'], hh: ['Lui', 'Lui'] }[pr.couple] || ['', ''];
            var qui = [];
            if (m.gender === 'couple') {
                [pr.p1, pr.p2].forEach(function (x, i) { if (x && x.tendance) qui.push(nomsP[i] + ' ' + (T[x.tendance] || '').toLowerCase()); });
            } else if (pr.p1 && pr.p1.tendance) qui.push(T[pr.p1.tendance]);
            if ((pr.ages || []).length) qui.push(pr.ages.join('/') + ' ans');
            if (pr.situation) qui.push(pr.situation === 'couple' ? '💑 En couple' : ((o.situations || {})[pr.situation] || ''));
            if (qui.length) f.appendChild(el('p', 'evs-sous', qui.join(' · ')));
            if (pr.partenaire) {
                var pl = el('p', 'evs-sous', '💞 En couple avec ');
                var pb = el('button', '', '@' + pr.partenaire.username); pb.type = 'button';
                pb.style.cssText = 'background:none;border:0;padding:0;color:inherit;font-weight:700;text-decoration:underline;cursor:pointer';
                pb.addEventListener('click', function () { ouvrirFiche(pr.partenaire.id); });
                pl.appendChild(pb); f.appendChild(pl);
            }
            if ((pr.objectifs || []).length) f.appendChild(el('p', 'evs-sous', 'Ici pour : ' + pr.objectifs.map(function (k) { return (o.objectifs || {})[k] || k; }).join(', ')));
            if ((pr.recherche || []).length) f.appendChild(el('p', 'evs-sous', 'Recherche : ' + pr.recherche.map(function (k) { return (o.recherche || {})[k] || k; }).join(', ')));
            if ((pr.interets || []).length) { var it = el('div', 'evs-badges'); pr.interets.forEach(function (k) { it.appendChild(el('span', 'evs-badge', (o.interets || {})[k] || k)); }); f.appendChild(it); }
            if (pr.annonce) f.appendChild(el('p', 'evs-bio', pr.annonce));
        }

        // 🔒 Album privé : vignettes si j'ai accès (photos vérifiées par l'équipe), sinon demande d'accès
        if (!m.moi) {
            var alb = el('div', 'evs-album'); alb.hidden = true; f.appendChild(alb);
            album(m, alb);
        }

        var act = el('div', 'evs-actions');
        function lien(cls, texte, url) { var a = el('a', 'evs-btn ' + cls, texte); a.href = url; return a; }
        if (m.moi) {
            act.appendChild(lien('jaune', '✏️ Modifier mon profil', 'compte.html'));
            act.appendChild(lien('', '👤 Voir mon profil public', 'membre.html?u=' + encodeURIComponent(m.username)));
        } else {
            if (m.isLive) act.appendChild(lien('rouge', '🎥 Voir sa caméra', 'live.html'));
            var ecrire = lien(m.isLive ? '' : 'jaune', '💬 Lui écrire', 'messages.html?ecrire=' + Number(m.id));
            // Page du salon : la conversation privée s'ouvre sur place
            if (typeof window.ouvrirPrive === 'function') ecrire.addEventListener('click', function (e) { e.preventDefault(); fermerFiche(); window.ouvrirPrive(Number(m.id), m.username); });
            act.appendChild(ecrire);
            if (!m.isLive) {
                var cam = el('button', 'evs-btn', '📷 Demander sa cam'); cam.type = 'button';
                if (!m.online) { cam.disabled = true; cam.title = m.username + ' n’est pas connecté'; }
                cam.onclick = async function () { cam.disabled = true; var ok = await demander(m.id, m.username); if (ok) { cam.textContent = '✅ Demande envoyée'; } else cam.disabled = false; };
                act.appendChild(cam);
            }
        }
        if (!m.moi) {
            var rel = await relation;
            if (rel) act.appendChild(boutonsAmi(m, rel));
            // ❤ Favori (membres suivis, page Mes favoris)
            var fav = el('button', 'evs-btn', m.favori ? '💔 Retirer des favoris' : '❤️ Ajouter aux favoris'); fav.type = 'button';
            fav.addEventListener('click', async function () {
                fav.disabled = true;
                try {
                    var r = await fetch(API_URL + '/favorites/membre/' + Number(m.id), { method: m.favori ? 'DELETE' : 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: m.favori ? undefined : '{}' });
                    if (!r.ok) throw new Error();
                    m.favori = !m.favori; fav.textContent = m.favori ? '💔 Retirer des favoris' : '❤️ Ajouter aux favoris';
                    if (typeof showToast === 'function') showToast(m.favori ? m.username + ' ajouté(e) à vos favoris' : 'Retiré(e) de vos favoris', 'success');
                } catch (x) { if (typeof showToast === 'function') showToast('Impossible pour le moment', 'error'); }
                fav.disabled = false;
            });
            act.appendChild(fav);
            act.appendChild(lien('', '👤 Voir le profil', 'membre.html?u=' + encodeURIComponent(m.username)));
            // 🚩 Signaler · 🚫 Bloquer (voir securite-membres.js ; l'équipe de modération ne peut pas être bloquée)
            if (window.EvcSecurite) {
                var rg = el('div', 'evs-rang');
                var sig = el('button', 'evs-btn', '🚩 Signaler'); sig.type = 'button';
                sig.addEventListener('click', function () { fermerFiche(); window.EvcSecurite.signaler({ type: 'user', userId: m.id, username: m.username, peutBloquer: !!m.peutBloquer }); });
                rg.appendChild(sig);
                if (m.peutBloquer) {
                    var bl = el('button', 'evs-btn', window.EvcSecurite.estBloque(m.id) ? '✅ Débloquer' : '🚫 Bloquer'); bl.type = 'button';
                    bl.addEventListener('click', async function () {
                        if (window.EvcSecurite.estBloque(m.id)) { if (await window.EvcSecurite.debloquer(m.id, m.username)) bl.textContent = '🚫 Bloquer'; return; }
                        fermerFiche();
                        window.EvcSecurite.bloquer(m.id, m.username);
                    });
                    rg.appendChild(bl);
                }
                act.appendChild(rg);
            }
        }
        f.appendChild(act);
        if (!m.moi && !m.isLive) f.appendChild(el('p', 'evs-note', m.online ? 'Il ou elle pourra accepter ou refuser.' : 'Demande de cam possible quand il ou elle est connecté.'));
        x.focus();
    }

    // ---------- Amis : Ajouter / Demande envoyée / Accepter / Ami ✓ — Retirer ----------
    function boutonsAmi(m, rel) {
        var zone = el('div', 'evs-rang'); zone.setAttribute('data-ami-zone', ''); zone.style.marginTop = '0';
        function btn(cls, texte, action) {
            var b = el('button', 'evs-btn ' + cls, texte); b.type = 'button';
            if (action) { b.setAttribute('data-ami-action', action); }
            zone.appendChild(b); return b;
        }
        function faire(fn) {
            return async function () {
                zone.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
                try { await fn(); } catch (e) { info(e.message || 'Action impossible', 'error'); }
                dessiner();
            };
        }
        function dessiner() {
            zone.textContent = '';
            zone.setAttribute('data-ami-statut', rel.statut);
            if (rel.statut === 'amis') {
                var ok = btn('', '👥 Ami ✓'); ok.disabled = true; ok.style.opacity = '1'; ok.style.cursor = 'default'; ok.style.color = '#22c55e';
                btn('', 'Retirer', 'retirer').onclick = faire(async function () {
                    if (!fenetre().confirm('Retirer ' + m.username + ' de vos amis ?')) return;
                    await api('/amis/' + Number(m.id), { method: 'DELETE' });
                    rel = { statut: 'aucun', demandeId: null };
                });
            } else if (rel.statut === 'envoyee') {
                var e = btn('', '⏳ Demande envoyée', 'annuler'); e.title = 'Cliquez pour annuler la demande';
                e.onclick = faire(async function () {
                    if (!fenetre().confirm('Annuler votre demande d’ami à ' + m.username + ' ?')) return;
                    await api('/amis/demandes/' + Number(rel.demandeId), { method: 'DELETE' });
                    rel = { statut: 'aucun', demandeId: null };
                });
            } else if (rel.statut === 'recue') {
                var a = btn('', '✅ Accepter', 'accepter'); a.style.background = '#22c55e'; a.style.color = '#fff';
                a.onclick = faire(async function () {
                    rel = (await api('/amis/demandes/' + Number(rel.demandeId) + '/accepter', { method: 'POST' })).relation;
                    info('👥 Vous êtes maintenant amis avec ' + m.username + ' !', 'success');
                    if (window.EvcAmis) window.EvcAmis.actualiser();
                });
                btn('', 'Refuser', 'refuser').onclick = faire(async function () {
                    await api('/amis/demandes/' + Number(rel.demandeId), { method: 'DELETE' });
                    rel = { statut: 'aucun', demandeId: null };
                    if (window.EvcAmis) window.EvcAmis.actualiser();
                });
            } else {
                btn('', '➕ Ajouter en ami', 'ajouter').onclick = faire(async function () {
                    var r = await api('/amis/demandes', { method: 'POST', body: JSON.stringify({ userId: Number(m.id) }) });
                    rel = r.relation;
                    info(r.message || 'Demande d’ami envoyée.', 'success');
                });
            }
        }
        dessiner();
        return zone;
    }

    // ============================================================
    // DEMANDES DE CAM
    // ============================================================
    async function demander(id, nom) {
        if (!connecte()) { aller('login.html'); return false; }
        try {
            await api('/cam-requests', { method: 'POST', body: JSON.stringify({ to: Number(id) }) });
            info('📷 Demande envoyée à ' + (nom || 'ce membre') + '. Vous serez prévenu de sa réponse.', 'success');
            return true;
        } catch (e) { info(e.message || 'Demande impossible', 'error'); return false; }
    }

    var affichees = {};
    function carteDemande(d) {
        if (affichees[d.id]) return;
        affichees[d.id] = true;
        styles(); son(); alerteTitre('📷 Demande de cam !');
        var c = el('div', 'evs-carte'); c.setAttribute('role', 'alertdialog');
        c.appendChild(mini(d.de.id, d.de.username));
        var t = el('div', 'evs-txt');
        var p = el('p'); var b = el('b', '', d.de.username); p.appendChild(b); p.appendChild(haut().createTextNode(' aimerait voir votre cam 📷'));
        t.appendChild(p);
        t.appendChild(el('small', '', 'Si vous acceptez, vous lancez un live privé rien que pour lui ou elle. Vous pouvez refuser sans vous justifier.'));
        var r = el('div', 'evs-rang');
        var oui = el('button', 'evs-btn jaune', 'Accepter'); oui.type = 'button';
        var non = el('button', 'evs-btn', 'Refuser'); non.type = 'button';
        var voir = el('button', 'evs-btn', 'Profil'); voir.type = 'button';
        r.appendChild(oui); r.appendChild(non); r.appendChild(voir); t.appendChild(r);
        c.appendChild(t);
        pile().appendChild(c);
        var fin = setTimeout(function () { c.remove(); }, 10 * 60 * 1000);
        voir.onclick = function () { ouvrirFiche(d.de.id); };
        non.onclick = async function () {
            oui.disabled = non.disabled = true;
            try { await api('/cam-requests/' + d.id + '/refuse', { method: 'POST' }); } catch (e) {}
            clearTimeout(fin); c.remove();
        };
        oui.onclick = async function () {
            oui.disabled = non.disabled = true;
            try {
                var rep = await api('/cam-requests/' + d.id + '/accept', { method: 'POST' });
                try { sessionStorage.setItem('evc-live-prive', JSON.stringify(rep.live)); } catch (e) {}
                clearTimeout(fin); c.remove();
                aller('live.html?prive=1&auto=1');
            } catch (e) { info(e.message, 'error'); clearTimeout(fin); c.remove(); }
        };
    }

    // Demande acceptée : on guette son live privé pour proposer « Regarder »
    var guettes = {};
    function guetter(d) {
        var qui = d.a.id, nom = d.a.username, debut = Date.now();
        if (guettes[qui]) return;
        guettes[qui] = setInterval(async function () {
            if (Date.now() - debut > 5 * 60 * 1000) { clearInterval(guettes[qui]); delete guettes[qui]; return; }
            try {
                var r = await fetch(base() + '/streams', { credentials: 'include' });
                var s = ((await r.json()).streams || []).find(function (x) { return x.broadcasterId === qui && x.isPrivate; });
                if (!s) return;
                clearInterval(guettes[qui]); delete guettes[qui];
                if (page === 'live.html') return;   // la page Live affiche déjà sa propre invitation
                styles(); son(); alerteTitre('🔒 ' + nom + ' vous a ouvert sa cam');
                var c = el('div', 'evs-carte rouge'); c.appendChild(mini(qui, nom));
                var t = el('div', 'evs-txt');
                var p = el('p'); p.appendChild(el('b', '', nom)); p.appendChild(haut().createTextNode(' vous a ouvert sa cam 🔒'));
                t.appendChild(p); t.appendChild(el('small', '', 'Live privé : vous êtes le seul invité.'));
                var rg = el('div', 'evs-rang');
                var go = el('button', 'evs-btn rouge', '🎥 Regarder'); go.type = 'button';
                go.onclick = function () { aller('live.html?join=' + encodeURIComponent(s.streamId) + '&from=' + encodeURIComponent(nom)); };
                var plus = el('button', 'evs-btn', 'Plus tard'); plus.type = 'button'; plus.onclick = function () { c.remove(); };
                rg.appendChild(go); rg.appendChild(plus); t.appendChild(rg); c.appendChild(t);
                pile().appendChild(c);
            } catch (e) {}
        }, 5000);
    }
    function reponse(d) {
        if (d.status === 'accepted') {
            info('✅ ' + d.a.username + ' a accepté ! Son live privé arrive : vous serez prévenu.', 'success');
            guetter(d);
        } else if (d.status === 'refused') {
            info(d.a.username + ' a décliné pour cette fois. Pas de souci 🙂', 'info');
        }
    }

    var enCours = false;
    async function releve() {
        if (enCours || !connecte() || document.hidden) return;
        enCours = true;
        try {
            var d = await api('/cam-requests/inbox');
            (d.recues || []).forEach(carteDemande);
            (d.reponses || []).forEach(reponse);
        } catch (e) {} finally { enCours = false; }
    }
    // Pages avec connexion temps réel (salons, live) : notification immédiate
    function brancher(s) {
        if (!s || s.__evsCam) return; s.__evsCam = true;
        s.on('cam:demande', function () { releve(); });
        s.on('cam:reponse', function () { releve(); });
    }

    window.addEventListener('pagehide', function () {
        try { var d = haut(); if (d === document) return; ['evs-pile', 'evs-voile'].forEach(function (id) { var n = d.getElementById(id); if (n) n.remove(); }); } catch (e) {}
    });

    window.EvcFiche = { ouvrir: ouvrirFiche, fermer: fermerFiche };
    window.EvcCam = { demander: demander, releve: releve, brancher: brancher };

    if (SANS.indexOf(page) === -1) {
        setTimeout(releve, 1500);
        setInterval(releve, 15000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) releve(); });
        setTimeout(function () { if (window.socket && window.socket.on) brancher(window.socket); }, 3000);
    }
    // Tout élément [data-fiche="12"] ouvre la fiche du membre
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-fiche]');
        if (!t) return;
        var bouton = e.target.closest('a,button');
        if (bouton && bouton !== t && t.contains(bouton)) return;   // un bouton dans la carte garde son action
        e.preventDefault(); e.stopPropagation();
        ouvrirFiche(t.getAttribute('data-fiche'));
    }, true);
})();
