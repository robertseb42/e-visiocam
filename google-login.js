// ============================================================
// E-VISIOCAM — « Continuer avec Google » (pages connexion et inscription)
//   EvcGoogle.monter(conteneur, { texte: 'signup_with' | 'continue_with', parrain: fn })
// Le bouton n'apparaît que si le serveur a un identifiant Google (GOOGLE_CLIENT_ID).
// Premier passage : petite fenêtre pour choisir son pseudo et certifier être majeur.
// ============================================================
(function () {
    var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };
    var toast = function (m, t) { if (typeof showToast === 'function') showToast(m, t); };
    var opts = {};

    function chargerScript() {
        return new Promise(function (ok, ko) {
            if (window.google && google.accounts && google.accounts.id) return ok();
            var s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
            s.onload = function () { ok(); }; s.onerror = function () { ko(new Error('Google indisponible')); };
            document.head.appendChild(s);
        });
    }

    function connecte(user, nouveau) {
        try { saveUser(user); } catch (e) {}
        try { sessionStorage.removeItem('evc-parrain'); } catch (e) {}
        toast(nouveau ? 'Bienvenue ' + user.username + ' ! 🎉' : 'Bon retour ' + user.username + ' 👋', 'success');
        var dest = new URLSearchParams(location.search).get('redirect');
        setTimeout(function () {
            if (dest && /^[a-z0-9_-]+\.html([?#].*)?$/i.test(dest)) location.href = dest;
            else if (typeof redirectByRole === 'function') redirectByRole(user);
            else location.href = 'index.html';
        }, 700);
    }

    async function reponseGoogle(r) {
        try {
            var d = await apiCall('/auth/google', { method: 'POST', body: JSON.stringify({ credential: r.credential }) });
            if (d.needProfile) return etapeProfil(d);
            connecte(d.user, false);
        } catch (err) {
            toast(err.message, 'error');
        }
    }

    // ---------- Étape 2 : pseudo + majeur + CGU ----------
    function etapeProfil(d) {
        var vieux = document.getElementById('evcGoogleProfil'); if (vieux) vieux.remove();
        var m = document.createElement('div');
        m.id = 'evcGoogleProfil';
        m.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4';
        m.innerHTML = '<form class="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl max-h-[92vh] overflow-y-auto" novalidate>' +
            '<h3 class="text-lg font-extrabold text-slate-900">Plus qu’une étape !</h3>' +
            '<p class="text-xs text-slate-500 mt-1 mb-4">Compte Google : <strong>' + esc(d.email) + '</strong>. Choisissez le pseudo affiché dans les salons.</p>' +
            '<label class="block text-xs font-bold text-slate-700 mb-1">Pseudo</label>' +
            '<div class="relative mb-1"><input data-pseudo type="text" minlength="3" maxlength="20" required autocomplete="off" value="' + esc(d.suggestion || '') + '" class="w-full pl-3 pr-11 py-2.5 rounded-xl border border-slate-200 text-sm bg-transparent">' +
            '<button type="button" data-baguette title="Proposer un pseudo au hasard" aria-label="Proposer un pseudo au hasard" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg hover:bg-slate-100 text-base">🪄</button></div>' +
            '<p class="text-[10px] text-slate-400 mb-4">3 à 20 caractères : lettres, chiffres, _ et -</p>' +
            '<label class="flex items-start gap-2 text-xs text-slate-600 mb-2 cursor-pointer"><input data-majeur type="checkbox" class="mt-0.5"> <span>Je certifie avoir <strong>18 ans ou plus</strong></span></label>' +
            '<label class="flex items-start gap-2 text-xs text-slate-600 mb-4 cursor-pointer"><input data-cgu type="checkbox" class="mt-0.5"> <span>J’accepte les <a href="cgu.html" target="_blank" class="text-brand-primary font-bold underline">CGU</a> et la <a href="confidentialite.html" target="_blank" class="text-brand-primary font-bold underline">politique de confidentialité</a></span></label>' +
            '<p data-err class="hidden text-xs text-rose-600 font-semibold mb-3"></p>' +
            '<div class="flex gap-2"><button type="button" data-annuler class="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold">Annuler</button>' +
            '<button type="submit" class="flex-1 py-2.5 rounded-xl text-sm font-bold" style="background:#ffe500;color:#111113">Créer mon compte</button></div></form>';
        document.body.appendChild(m);
        var f = m.querySelector('form'), pseudo = m.querySelector('[data-pseudo]'), err = m.querySelector('[data-err]');
        var erreur = function (t) { err.textContent = t; err.classList.toggle('hidden', !t); };
        pseudo.focus(); pseudo.select();
        m.querySelector('[data-annuler]').onclick = function () { m.remove(); };
        m.querySelector('[data-baguette]').onclick = function () { baguette(pseudo); };
        f.onsubmit = async function (e) {
            e.preventDefault(); erreur('');
            var p = pseudo.value.trim();
            if (!/^[A-Za-z0-9_-]{3,20}$/.test(p)) return erreur('Pseudo : 3 à 20 caractères (lettres, chiffres, _ et -)');
            if (!m.querySelector('[data-majeur]').checked) return erreur('Vous devez certifier avoir 18 ans ou plus');
            if (!m.querySelector('[data-cgu]').checked) return erreur('Vous devez accepter les CGU');
            var btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.style.opacity = '.6';
            try {
                var r = await apiCall('/auth/google/complete', { method: 'POST', body: JSON.stringify({
                    ticket: d.ticket, username: p, adult: true, cgu: true, parrain: typeof opts.parrain === 'function' ? opts.parrain() : ''
                }) });
                m.remove();
                connecte(r.user, true);
            } catch (e2) {
                erreur(e2.message);
                if (e2.data && e2.data.suggestion) { pseudo.value = e2.data.suggestion; erreur(e2.message + ' — essayez « ' + e2.data.suggestion + ' »'); }
                btn.disabled = false; btn.style.opacity = '1';
            }
        };
    }

    // 🪄 Pseudo au hasard
    async function baguette(input) {
        try {
            var r = await apiCall('/auth/suggest-username');
            input.value = r.username;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.focus();
        } catch (e) { toast(e.message, 'error'); }
    }

    async function monter(conteneur, o) {
        opts = o || {};
        if (!conteneur) return;
        var bloc = conteneur.closest('[data-google-bloc]') || conteneur;
        try {
            var cfg = await apiCall('/auth/google/config');
            if (!cfg || !cfg.clientId) return;            // pas configuré : rien n'apparaît
            await chargerScript();
            google.accounts.id.initialize({ client_id: cfg.clientId, callback: reponseGoogle, ux_mode: 'popup', auto_select: false, itp_support: true });
            var largeur = Math.min(400, Math.max(220, Math.round(conteneur.getBoundingClientRect().width || 320)));
            google.accounts.id.renderButton(conteneur, {
                type: 'standard', theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'outline' : 'filled_black',
                size: 'large', shape: 'pill', text: opts.texte || 'continue_with', logo_alignment: 'center', width: largeur, locale: 'fr'
            });
            bloc.classList.remove('hidden');
        } catch (e) { /* Google bloqué ou injoignable : on garde le formulaire classique */ }
    }

    window.EvcGoogle = { monter: monter, baguette: baguette };
})();
