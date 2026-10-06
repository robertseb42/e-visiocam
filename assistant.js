// ============================================================
// E-VISIOCAM — assistant d'aide (bulle « Besoin d'aide ? »)
// ------------------------------------------------------------
// Répond tout de suite à partir des réponses du centre d'aide (aide-data.json).
// S'il ne trouve pas, ou si le membre le demande, la question est transmise à l'équipe :
// elle arrive dans Admin → Messages contact et par e-mail (CONTACT_NOTIFY_EMAIL).
// Gratuit, sans service extérieur : aucune conversation ne quitte le site.
// ============================================================
(function () {
    if (window.EvcAssistant) return;
    var CLE = 'evc-assistant';
    var base = null, ouvert = false, histo = [], dernieresQuestions = [], echecs = 0;

    // ---------- Texte ----------
    var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var VIDES = ('a au aux avec ce ces cet cette comment dans de des du elle en est et etre il ils je j la le les leur lui ma mais me mes moi mon ne nos notre nous on ou par pas peut pour qu que quel quelle quels qui sa se ses si son sur ta te tes toi ton tu un une vos votre vous y c d l m n s t ca cela faire fait veux voudrais peux puis-je puis est-ce bonjour salut svp stp merci aide aider help besoin probleme question site evisiocam visiocam quelqu quelque quelqu un personne avoir faire comme')
        .split(' ').reduce(function (o, m) { o[m] = 1; return o; }, {});
    var SYNONYMES = {
        cam: 'camera', webcam: 'camera', cams: 'camera', mdp: 'mot passe', password: 'mot passe', pwd: 'mot passe',
        ban: 'banni sanction', bannie: 'banni sanction', kick: 'expulse sanction', mute: 'muet sanction', bloque: 'bloque sanction',
        mp: 'prive message', dm: 'prive message', pv: 'prive message', inscription: 'inscrire compte', login: 'connexion',
        connecte: 'connexion', connecter: 'connexion', credit: 'credits', jetons: 'credits', tokens: 'credits', thunes: 'argent',
        sous: 'argent', payer: 'payant argent', paiement: 'payant argent', supprimer: 'supprimer compte', desinscrire: 'supprimer compte',
        live: 'live direct', stream: 'live direct', streamer: 'diffuser', micro: 'micro son', son: 'son micro', lag: 'saccade',
        rame: 'saccade lent', bug: 'navigateur affichage', email: 'mail', courriel: 'mail', pseudo: 'pseudo', theme: 'theme sombre clair', insulte: 'insulte derange harcelement', insultes: 'insulte derange harcelement', harcele: 'harcelement derange', emmerde: 'derange', relou: 'derange', copine: 'couple tiers', copain: 'couple tiers', mari: 'couple tiers', femme: 'couple tiers', filmer: 'filmer camera'
    };
    function mots(s) {
        var out = [];
        norm(s).split(' ').forEach(function (m) {
            if (!m || VIDES[m]) return;
            out.push(m);
            if (SYNONYMES[m]) SYNONYMES[m].split(' ').forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); });
        });
        return out;
    }
    // Un mot de la question correspond-il à un mot de la fiche ? (racine commune : « camera » ~ « cameras »)
    function proche(m, liste) {
        for (var i = 0; i < liste.length; i++) {
            var d = liste[i];
            if (d === m) return 1;
            if (m.length >= 4 && d.length >= 4 && (d.indexOf(m) === 0 || m.indexOf(d) === 0)) return 0.9;
            if (m.length >= 6 && d.length >= 6 && d.slice(0, 5) === m.slice(0, 5)) return 0.75;
        }
        return 0;
    }
    function chercher(question) {
        var q = mots(question);
        if (!q.length || !base) return [];
        return base.map(function (f) {
            var score = 0, trouves = 0;
            q.forEach(function (m) {
                var s = Math.max(3 * proche(m, f._q), 2.5 * proche(m, f._m), 1 * proche(m, f._t), 0.8 * proche(m, f._c));
                if (s > 0) trouves++;
                score += s;
            });
            var couverture = trouves / q.length;
            return { f: f, score: score * (0.4 + couverture), couverture: couverture };
        }).filter(function (x) { return x.score >= 2.2 && x.couverture >= 0.34; })
          .sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
    }

    async function chargerBase() {
        if (base) return base;
        try {
            var r = await fetch('aide-data.json', { cache: 'no-cache' });
            var j = await r.json();
            base = (j.fiches || []).map(function (f) {
                f._q = f.qt.split(' '); f._m = f.m.split(' '); f._t = f.t.split(' '); f._c = norm(f.cat).split(' ');
                return f;
            });
        } catch (e) { base = []; }
        return base;
    }

    // Appel au serveur : apiCall (auth-api.js) si la page le charge, sinon fetch direct
    var API = 'https://api.e-visiocam.com/api';
    async function appel(chemin, opts) {
        if (typeof apiCall === 'function') return apiCall(chemin, opts);
        var r = await fetch(API + chemin, Object.assign({ credentials: 'include', headers: { 'Content-Type': 'application/json' } }, opts));
        var j = null; try { j = await r.json(); } catch (e) {}
        if (!r.ok) { var er = new Error((j && j.error) || ('Erreur ' + r.status)); er.status = r.status; er.data = j; throw er; }
        return j;
    }

    // ---------- Styles ----------
    var css = document.createElement('style');
    css.textContent = [
        '.evc-as{--as-bg:#1c1c20;--as-panel:#25252b;--as-line:#3b3b43;--as-text:#f5f5f7;--as-muted:#b1b1bd;--as-me:#ffe500;--as-me-text:#111113;--as-pink:#ff1680;font-family:Inter,system-ui,sans-serif}',
        'html[data-theme="light"] .evc-as{--as-bg:#ffffff;--as-panel:#f1f5f9;--as-line:#e2e8f0;--as-text:#0f172a;--as-muted:#64748b}',
        '.evc-as-bulle{position:fixed;left:18px;bottom:var(--as-bas,18px);z-index:9990;display:flex;align-items:center;gap:8px;padding:12px 16px;border-radius:999px;border:0;cursor:pointer;background:#ffe500;color:#111113;font:800 14px Inter,system-ui,sans-serif;box-shadow:0 10px 30px #0006;transition:transform .2s}',
        '.evc-as [hidden]{display:none!important}',
        '.evc-as.dans-colonne .evc-as-bulle{position:static;width:100%;justify-content:center;box-shadow:0 8px 22px #0004}',
        '.evc-as.dans-colonne .evc-as-panneau{left:max(18px,calc((100vw - 1700px) / 2 + 24px))}',
        '.evc-as.sous-radio{position:fixed;z-index:9990;transition:top .35s ease,left .35s ease}',
        '.evc-as.sous-radio .evc-as-bulle{position:static;width:100%;justify-content:center;box-shadow:0 8px 22px #0004}',
        '.evc-as.sous-radio .evc-as-panneau{left:auto;right:18px}',
        '.evc-as-bulle:hover{transform:translateY(-2px)}',
        '.evc-as-bulle:focus-visible,.evc-as button:focus-visible,.evc-as input:focus-visible,.evc-as textarea:focus-visible{outline:3px solid #ff1680;outline-offset:2px}',
        '.evc-as-bulle i{font-size:18px}',
        '.evc-as-bulle .pt{width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 2px #ffe500}',
        '@media(max-width:640px){.evc-as-bulle .txt{display:none}.evc-as-bulle{padding:14px}}',
        '.evc-as-panneau{position:fixed;left:18px;bottom:var(--as-bas,18px);z-index:9991;width:min(380px,calc(100vw - 24px));height:min(580px,calc(100vh - var(--as-bas,18px) - 24px));display:flex;flex-direction:column;background:var(--as-bg);color:var(--as-text);border:1px solid var(--as-line);border-radius:20px;box-shadow:0 24px 60px #000a;overflow:hidden;animation:evcAsIn .22s ease}',
        '@media(max-width:640px){.evc-as-panneau{left:12px;right:12px;width:auto}}',
        '@keyframes evcAsIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}',
        '.evc-as-tete{display:flex;align-items:center;gap:10px;padding:14px 16px;background:linear-gradient(135deg,#2a1631,#141417);color:#fff}',
        '.evc-as-tete .av{width:38px;height:38px;border-radius:12px;background:#ffe500;color:#111113;display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}',
        '.evc-as-tete b{display:block;font-size:14px}.evc-as-tete small{display:block;font-size:11px;color:#cfcfd8}',
        '.evc-as-tete button{margin-left:auto;border:0;background:#ffffff1a;color:#fff;width:32px;height:32px;border-radius:10px;cursor:pointer;font-size:15px}',
        '.evc-as-fil{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth}',
        '.evc-as-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:13.5px;line-height:1.55;word-wrap:break-word}',
        '.evc-as-msg.bot{background:var(--as-panel);border:1px solid var(--as-line);border-top-left-radius:4px;align-self:flex-start}',
        '.evc-as-msg.moi{background:var(--as-me);color:var(--as-me-text);border-top-right-radius:4px;align-self:flex-end;font-weight:600}',
        '.evc-as-msg p{margin:0 0 6px}.evc-as-msg p:last-child{margin:0}.evc-as-msg ul,.evc-as-msg ol{margin:4px 0 6px;padding-left:18px}.evc-as-msg ul{list-style:disc}.evc-as-msg ol{list-style:decimal}',
        '.evc-as-msg a{color:var(--as-pink);text-decoration:underline}.evc-as-msg strong{font-weight:800}',
        '.evc-as-msg .titre{font-weight:800;margin-bottom:6px;color:var(--as-text)}',
        '.evc-as-msg .rep{color:var(--as-muted)}.evc-as-msg .rep strong{color:var(--as-text)}',
        '.evc-as-puces{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:100%}',
        '.evc-as-puces button{border:1px solid var(--as-line);background:transparent;color:var(--as-text);border-radius:999px;padding:6px 11px;font:600 12px Inter,system-ui,sans-serif;cursor:pointer;text-align:left}',
        '.evc-as-puces button:hover{border-color:#ffe500}',
        '.evc-as-puces button.humain{border-color:var(--as-pink);color:var(--as-pink)}',
        '.evc-as-avis{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--as-muted);margin-top:8px}',
        '.evc-as-avis button{border:1px solid var(--as-line);background:transparent;border-radius:8px;padding:3px 8px;cursor:pointer;font-size:13px;color:var(--as-text)}',
        '.evc-as-saisie{display:flex;gap:8px;padding:10px;border-top:1px solid var(--as-line);background:var(--as-bg)}',
        '.evc-as-saisie input{flex:1;min-width:0;padding:11px 14px;border-radius:999px;border:1px solid var(--as-line);background:var(--as-panel);color:var(--as-text);font:14px Inter,system-ui,sans-serif}',
        '.evc-as-saisie button{flex:none;width:42px;height:42px;border-radius:50%;border:0;background:#ffe500;color:#111113;cursor:pointer;font-size:15px}',
        '.evc-as-ecrit{display:flex;gap:4px;padding:12px 14px}.evc-as-ecrit i{width:6px;height:6px;border-radius:50%;background:var(--as-muted);animation:evcAsPt 1s infinite}.evc-as-ecrit i:nth-child(2){animation-delay:.15s}.evc-as-ecrit i:nth-child(3){animation-delay:.3s}',
        '@keyframes evcAsPt{0%,80%,100%{opacity:.3;transform:none}40%{opacity:1;transform:translateY(-3px)}}',
        '.evc-as-form{display:grid;gap:8px;margin-top:6px}',
        '.evc-as-form input,.evc-as-form textarea{width:100%;padding:9px 11px;border-radius:10px;border:1px solid var(--as-line);background:var(--as-bg);color:var(--as-text);font:13px Inter,system-ui,sans-serif;box-sizing:border-box}',
        '.evc-as-form textarea{min-height:84px;resize:vertical}',
        '.evc-as-form label.ck{display:flex;gap:8px;align-items:flex-start;font-size:11.5px;line-height:1.45;color:var(--as-muted)}',
        // La règle « input » du formulaire (largeur 100 %) écrasait la case à cocher et repoussait le texte
        '.evc-as-form label.ck input{width:auto;flex:none;margin:2px 0 0;padding:0}',
        '.evc-as-form .env{border:0;border-radius:10px;padding:10px;background:#ffe500;color:#111113;font:800 13px Inter,system-ui,sans-serif;cursor:pointer}',
        '.evc-as-form .err{color:#f43f5e;font-size:12px;font-weight:600}',
        '.evc-as-pied{font-size:10.5px;color:var(--as-muted);text-align:center;padding:0 10px 8px}',
        '@media (prefers-reduced-motion:reduce){.evc-as-panneau,.evc-as-ecrit i{animation:none}.evc-as-fil{scroll-behavior:auto}}'
    ].join('');
    document.head.appendChild(css);

    // ---------- Interface ----------
    var racine = document.createElement('div');
    racine.className = 'evc-as';
    racine.innerHTML = '<button type="button" class="evc-as-bulle" aria-haspopup="dialog" aria-expanded="false"><span class="pt" aria-hidden="true"></span><i class="fa-solid fa-comment-dots" aria-hidden="true"></i><span class="txt">Besoin d’aide ?</span></button>';
    var bulle = racine.firstChild, panneau = null, fil = null, champ = null;

    function placer() {
        // Au-dessus de la barre de navigation mobile si elle est affichée
        var nav = document.querySelector('.ev-mnav');
        var bas = 18;
        if (nav) { var cs = getComputedStyle(nav), h = nav.getBoundingClientRect().height; if (cs.display !== 'none' && cs.visibility !== 'hidden' && h > 0) bas = Math.round(h) + 12; }
        racine.style.setProperty('--as-bas', bas + 'px');
    }

    function construire() {
        panneau = document.createElement('div');
        panneau.className = 'evc-as-panneau';
        panneau.setAttribute('role', 'dialog');
        panneau.setAttribute('aria-label', 'Assistant d’aide E-VISIOCAM');
        panneau.innerHTML =
            '<div class="evc-as-tete"><span class="av" aria-hidden="true">💬</span><div><b>Assistant E-VISIOCAM</b><small>Répond tout de suite · l’équipe prend le relais si besoin</small></div>' +
            '<button type="button" data-fermer aria-label="Fermer l’assistant"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button></div>' +
            '<div class="evc-as-fil" aria-live="polite"></div>' +
            '<form class="evc-as-saisie"><input type="text" maxlength="300" placeholder="Posez votre question…" aria-label="Votre question" autocomplete="off" enterkeyhint="send">' +
            '<button type="submit" aria-label="Envoyer"><i class="fa-solid fa-paper-plane" aria-hidden="true"></i></button></form>' +
            '<div class="evc-as-pied">Réponses du <a href="aide.html" style="color:inherit">centre d’aide</a> · en cas d’urgence : 17 ou 112</div>';
        racine.appendChild(panneau);
        fil = panneau.querySelector('.evc-as-fil');
        champ = panneau.querySelector('input');
        panneau.querySelector('[data-fermer]').onclick = fermer;
        panneau.querySelector('form').onsubmit = function (e) { e.preventDefault(); var t = champ.value.trim(); if (t) { champ.value = ''; demander(t); } };
        panneau.addEventListener('keydown', function (e) { if (e.key === 'Escape') fermer(); });
        fil.addEventListener('click', clicFil);
        if (!restaurer()) accueil();
    }

    // La radio ouverte cache le panneau d'aide : on la réduit pendant l'aide, puis on la rouvre
    var radioReduite = false;
    function radioFenetre() {
        try { if (window.top !== window && window.top.minimizeRadioWidget) return window.top; } catch (e) {}
        return window.minimizeRadioWidget ? window : null;
    }
    function reduireRadio() {
        var w = radioFenetre(); if (!w) return;
        try {
            var ex = w.document.getElementById('radioWidgetExpanded');
            if (ex && !ex.classList.contains('hidden')) { w.minimizeRadioWidget(); radioReduite = true; }
        } catch (e) {}
    }
    function rouvrirRadio() {
        if (!radioReduite) return;
        radioReduite = false;
        var w = radioFenetre();
        try { if (w && w.expandRadioWidget) w.expandRadioWidget(); } catch (e) {}
    }

    function ouvrir(question) {
        if (!panneau) construire();
        reduireRadio();
        placer();
        panneau.hidden = false; bulle.hidden = true; ouvert = true;
        bulle.setAttribute('aria-expanded', 'true');
        chargerBase();
        if (question) demander(question); else setTimeout(function () { champ.focus(); }, 50);
    }
    function fermer() {
        if (panneau) panneau.hidden = true;
        bulle.hidden = false; ouvert = false;
        bulle.setAttribute('aria-expanded', 'false');
        rouvrirRadio();
        bulle.focus();
    }

    // ---------- Fil de discussion ----------
    function ajouter(html, qui, sansSauver) {
        var d = document.createElement('div');
        d.className = 'evc-as-msg ' + (qui || 'bot');
        d.innerHTML = html;
        fil.appendChild(d);
        fil.scrollTop = fil.scrollHeight;
        if (!sansSauver) { histo.push({ h: html, q: qui || 'bot' }); sauver(); }
        return d;
    }
    function puces(liste) {
        var d = document.createElement('div');
        d.className = 'evc-as-puces';
        d.innerHTML = liste.map(function (p) {
            return '<button type="button" ' + (p.id ? 'data-fiche="' + esc(p.id) + '"' : p.humain ? 'data-humain="1" class="humain"' : 'data-q="' + esc(p.q) + '"') + '>' + esc(p.label) + '</button>';
        }).join('');
        fil.appendChild(d);
        fil.scrollTop = fil.scrollHeight;
        histo.push({ h: d.innerHTML, q: 'puces' }); sauver();
    }
    function ecrit() {
        var d = document.createElement('div');
        d.className = 'evc-as-msg bot evc-as-ecrit'; d.innerHTML = '<i></i><i></i><i></i>';
        fil.appendChild(d); fil.scrollTop = fil.scrollHeight;
        return d;
    }
    function sauver() { try { sessionStorage.setItem(CLE, JSON.stringify(histo.slice(-40))); } catch (e) {} }
    function restaurer() {
        try {
            var h = JSON.parse(sessionStorage.getItem(CLE) || '[]');
            if (!h.length) return false;
            h.forEach(function (m) {
                if (m.q === 'puces') { var d = document.createElement('div'); d.className = 'evc-as-puces'; d.innerHTML = m.h; fil.appendChild(d); }
                else ajouter(m.h, m.q, true);
            });
            histo = h; fil.scrollTop = fil.scrollHeight;
            return true;
        } catch (e) { return false; }
    }

    function accueil() {
        var u = null; try { u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; } catch (e) {}
        ajouter('<p>Bonjour' + (u && u.username ? ' <strong>' + esc(u.username) + '</strong>' : '') + ' 👋</p><p>Je suis l’assistant d’E-VISIOCAM. Posez-moi votre question : je vous réponds tout de suite, et si je ne trouve pas, je transmets à l’équipe.</p>');
        puces([
            { q: 'mot de passe oublié', label: '🔑 Mot de passe oublié' },
            { q: 'ma caméra reste noire', label: '📷 Caméra noire' },
            { q: 'comment lancer ma webcam', label: '🎥 Lancer ma webcam' },
            { q: 'gagner des crédits', label: '🎁 Gagner des crédits' },
            { q: 'contester une sanction', label: '⚖️ Contester une sanction' },
            { humain: true, label: '🙋 Parler à l’équipe' }
        ]);
    }

    function carteFiche(f, intro) {
        return (intro ? '<p>' + intro + '</p>' : '') +
            '<div class="titre">' + esc(f.q) + '</div><div class="rep">' + f.r + '</div>' +
            '<p style="margin-top:8px"><a href="aide.html#' + esc(f.id) + '">Voir dans le centre d’aide</a></p>' +
            '<div class="evc-as-avis" data-avis="' + esc(f.id) + '">Cette réponse vous aide ? <button type="button" data-oui>👍</button><button type="button" data-non>👎</button></div>';
    }

    async function demander(texte) {
        ajouter(esc(texte), 'moi');
        dernieresQuestions.push(texte); if (dernieresQuestions.length > 5) dernieresQuestions.shift();
        var n = norm(texte);
        var attente = ecrit();
        await chargerBase();
        await new Promise(function (ok) { setTimeout(ok, 450); });
        attente.remove();

        if (/\b(humain|conseiller|conseillere|agent|quelqu un de reel|une vraie personne|operateur|parler a l equipe|parler a quelqu un)\b/.test(n)) return proposerHumain('Bien sûr. Décrivez votre demande, je la transmets à l’équipe :');
        if (/^(bonjour|salut|hello|coucou|bonsoir|hey|yo)\b/.test(n) && n.split(' ').length <= 3) return ajouter('<p>Bonjour 😊 Que puis-je faire pour vous ? Vous pouvez écrire par exemple « caméra noire », « supprimer mon compte » ou « contester une sanction ».</p>');
        if (/^(merci|super|parfait|ok|top|genial|cool)\b/.test(n) && n.split(' ').length <= 4) return ajouter('<p>Avec plaisir ! N’hésitez pas si vous avez une autre question. 🙂</p>');
        if (/\b(danger|urgence|suicide|me tuer|agresse|menace de mort)\b/.test(n)) {
            ajouter('<p><strong>🚨 En cas de danger immédiat, appelez le 17 (police) ou le 112.</strong> Si vous avez des idées suicidaires, le <strong>3114</strong> répond 24 h/24, gratuitement.</p><p>Je peux aussi prévenir l’équipe du site tout de suite.</p>');
            return puces([{ humain: true, label: '🙋 Prévenir l’équipe' }]);
        }

        var res = chercher(texte);
        if (!res.length) {
            echecs++;
            ajouter('<p>Je n’ai pas trouvé de réponse à « ' + esc(texte) + ' ». 🤔</p><p>Vous pouvez reformuler avec d’autres mots, ou je transmets votre question à l’équipe, qui vous répondra par e-mail.</p>');
            return puces([{ humain: true, label: '🙋 Transmettre à l’équipe' }, { q: '', label: '✍️ Reformuler' }]);
        }
        echecs = 0;
        ajouter(carteFiche(res[0].f));
        var autres = res.slice(1, 3).map(function (x) { return { id: x.f.id, label: x.f.q }; });
        if (autres.length) { ajouter('<p>Vous cherchiez peut-être aussi :</p>'); puces(autres); }
    }

    function proposerHumain(intro) {
        var u = null; try { u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; } catch (e) {}
        var resume = dernieresQuestions.filter(Boolean).join('\n');
        var d = ajouter('<p>' + esc(intro || 'Je transmets votre question à l’équipe. Elle vous répondra par e-mail.') + '</p>' +
            '<form class="evc-as-form" novalidate>' +
            '<input name="nom" maxlength="100" placeholder="Votre pseudo ou prénom" value="' + esc(u && u.username || '') + '" required aria-label="Votre pseudo ou prénom">' +
            '<input name="email" type="email" maxlength="254" placeholder="Votre adresse e-mail" value="' + esc(u && u.email || '') + '" required aria-label="Votre adresse e-mail">' +
            '<textarea name="message" maxlength="1800" placeholder="Votre question, avec le plus de détails possible (page, heure, appareil…)" aria-label="Votre question">' + esc(resume) + '</textarea>' +
            '<input name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' +
            '<label class="ck"><input type="checkbox" name="ok"><span>J’accepte que ma demande soit traitée selon la <a href="confidentialite.html" target="_blank">politique de confidentialité</a>.</span></label>' +
            '<div class="err" hidden></div><button type="submit" class="env">Envoyer à l’équipe</button></form>', 'bot', true);
        var f = d.querySelector('form');
        f.onsubmit = envoyer;
        setTimeout(function () { (f.nom.value ? (f.email.value ? f.message : f.email) : f.nom).focus(); }, 50);
    }

    async function envoyer(e) {
        e.preventDefault();
        var f = e.target, err = f.querySelector('.err');
        var montre = function (t) { err.textContent = t; err.hidden = !t; };
        var msg = f.message.value.trim();
        if (!f.nom.value.trim()) return montre('Indiquez votre pseudo ou prénom.');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.value.trim())) return montre('Indiquez une adresse e-mail valide pour recevoir la réponse.');
        if (msg.length < 10) return montre('Décrivez votre demande en quelques mots (10 caractères au moins).');
        if (!f.ok.checked) return montre('Cochez la case pour que l’équipe puisse traiter votre demande.');
        montre('');
        var b = f.querySelector('.env'); b.disabled = true; b.textContent = 'Envoi…';
        try {
            await appel('/contact', { method: 'POST', body: JSON.stringify({
                name: f.nom.value.trim(), email: f.email.value.trim(), subject: 'assistant', consent: true, website: f.website.value,
                message: msg + '\n\n— Envoyé depuis l’assistant, page : ' + location.pathname.replace(/^\//, '') + (location.search ? location.search : '')
            }) });
            f.parentNode.innerHTML = '<p>✅ <strong>C’est transmis !</strong> L’équipe vous répondra à <strong>' + esc(f.email.value.trim()) + '</strong>. Pensez à regarder vos courriers indésirables.</p>';
            histo.push({ h: '<p>✅ Votre question a été transmise à l’équipe.</p>', q: 'bot' }); sauver();
        } catch (er) {
            b.disabled = false; b.textContent = 'Envoyer à l’équipe';
            montre(er.status === 429 ? 'Trop d’envois en peu de temps : réessayez dans quelques minutes, ou écrivez à contact@e-visiocam.com.' : (er.message || 'Envoi impossible pour le moment.'));
        }
    }

    function clicFil(e) {
        var b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.q !== undefined) { if (b.dataset.q) demander(b.dataset.q); else champ.focus(); return; }
        if (b.dataset.humain) return proposerHumain();
        if (b.dataset.fiche) {
            var f = (base || []).find(function (x) { return x.id === b.dataset.fiche; });
            if (f) { ajouter(esc(f.q), 'moi'); ajouter(carteFiche(f)); }
            return;
        }
        var avis = b.closest('[data-avis]');
        if (avis) {
            if (b.hasAttribute('data-oui')) { avis.innerHTML = 'Merci pour votre retour ! 🙂'; }
            else { avis.innerHTML = 'Désolé ! Je transmets à l’équipe ?'; puces([{ humain: true, label: '🙋 Oui, parler à l’équipe' }, { q: '', label: '✍️ Reformuler' }]); }
        }
    }

    bulle.onclick = function () { ouvrir(); };
    // N'importe quel élément [data-assistant] ouvre l'assistant (ex. : centre d'aide)
    document.addEventListener('click', function (e) {
        var t = e.target.closest && e.target.closest('[data-assistant]');
        if (t) { e.preventDefault(); ouvrir(t.getAttribute('data-assistant') || ''); }
    });

    // Où ranger la bulle : sous la radio persistante (colonne de droite de l'accueil),
    // sinon sous la radio de la colonne de gauche, sinon dans la colonne de gauche, sinon en bas à gauche
    function ranger() {
        var place = null;
        try { if (window.top !== window) place = window.top.__evcRadioPlace; } catch (e) {}
        racine.classList.remove('dans-colonne', 'sous-radio');
        racine.style.left = racine.style.top = racine.style.width = '';
        if (place && place.colonne && window.innerWidth >= 1024) {
            if (racine.parentNode !== document.body) document.body.appendChild(racine);
            racine.classList.add('sous-radio');
            racine.style.left = place.left + 'px';
            racine.style.top = (place.top + place.height + 10) + 'px';
            racine.style.width = place.width + 'px';
            return placer();
        }
        var radio = document.getElementById('radioWidget');
        var colonne = document.getElementById('sidebar') || (radio && radio.closest('aside'));
        var colonneVisible = colonne && getComputedStyle(colonne).display !== 'none' && colonne.getBoundingClientRect().width > 0;
        if (colonneVisible) {
            var radioVisible = radio && colonne.contains(radio) && radio.getBoundingClientRect().width > 0;
            if (radioVisible) { if (racine.previousElementSibling !== radio) radio.insertAdjacentElement('afterend', racine); }
            else if (racine.parentNode !== colonne) colonne.appendChild(racine);
            racine.classList.add('dans-colonne');
        } else if (racine.parentNode !== document.body) document.body.appendChild(racine);
        placer();
    }
    function monter() { ranger(); window.addEventListener('resize', ranger); window.addEventListener('evc:radio-placee', ranger); setTimeout(ranger, 800); setTimeout(ranger, 2000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', monter); else monter();

    window.EvcAssistant = { ouvrir: ouvrir, fermer: fermer, chercher: function (t) { return chargerBase().then(function () { return chercher(t); }); } };
})();
