// Extrait de register.html (CSP stricte : plus de script inline dans les pages)
    EvcGoogle.monter(document.getElementById('googleBtn'), { texte: 'signup_with', parrain: lireParrain });
    // ---------- PARRAINAGE : register.html?parrain=Pseudo ----------
    // Le pseudo est gardé pour la durée de la visite (si le visiteur change de page avant de s'inscrire)
    function lireParrain() {
        let p = '';
        try { p = new URLSearchParams(location.search).get('parrain') || sessionStorage.getItem('evc-parrain') || ''; } catch (e) {}
        p = String(p).trim();
        return /^[A-Za-z0-9_.-]{3,30}$/.test(p) ? p : '';
    }
    (function () {
        const p = lireParrain();
        if (!p) return;
        try { sessionStorage.setItem('evc-parrain', p); } catch (e) {}
        document.getElementById('parrainNom').textContent = p;
        document.getElementById('parrainBox').classList.remove('hidden');
    })();

    // ---------- PAGE DEMANDÉE AVANT L'INSCRIPTION : register.html?redirect=chat.html?theme=… ----------
    // Seulement une page du site (même règle que pages/login.js et google-login.js)
    function lireRedirection() {
        const d = new URLSearchParams(location.search).get('redirect');
        return d && /^[a-z0-9_-]+\.html([?#].*)?$/i.test(d) ? d : '';
    }
    (function () {
        const r = lireRedirection();
        if (!r) return;
        // « Se connecter » / « J'ai confirmé, me connecter » : la connexion ramènera au même endroit
        document.querySelectorAll('[data-lien-connexion]').forEach(a => { a.href = 'login.html?redirect=' + encodeURIComponent(r); });
    })();

    // ---------- FORCE DU MOT DE PASSE ----------
    function checkStrength() {
        const pwd = document.getElementById('password').value;
        let score = 0;
        if (pwd.length >= 8) score++;
        if (/[A-Z]/.test(pwd)) score++;
        if (/[0-9]/.test(pwd)) score++;
        if (/[^A-Za-z0-9]/.test(pwd)) score++;

        const colors = ['bg-rose-500', 'bg-amber-500', 'bg-yellow-500', 'bg-emerald-500'];
        for (let i = 1; i <= 4; i++) {
            const bar = document.getElementById('bar' + i);
            bar.className = 'strength-bar flex-1 ' + (i <= score ? colors[score - 1] : 'bg-slate-200');
        }
    }

    function togglePassword(fieldId, btn) {
        const field = document.getElementById(fieldId);
        const icon = btn.querySelector('i');
        if (field.type === 'password') {
            field.type = 'text';
            icon.className = 'fa-solid fa-eye-slash';
        } else {
            field.type = 'password';
            icon.className = 'fa-solid fa-eye';
        }
    }

    // ✉️ Écran « confirmez votre adresse » + renvoi du lien
    function afficherVerification(email, login, cacher) {
        cacher.forEach(id => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
        document.getElementById('verifEmail').textContent = email || 'votre adresse';
        document.getElementById('verifBox').classList.remove('hidden');
        const b = document.getElementById('verifRenvoi'), msg = document.getElementById('verifMsg');
        b.onclick = async () => {
            b.disabled = true; msg.className = 'text-xs text-slate-500 min-h-[1rem]'; msg.textContent = 'Envoi…';
            try { const r = await renvoyerConfirmation(login); msg.textContent = r.message; msg.className = 'text-xs text-emerald-600 font-semibold min-h-[1rem]'; }
            catch (e) { msg.textContent = e.message; msg.className = 'text-xs text-rose-600 font-semibold min-h-[1rem]'; }
            setTimeout(() => { b.disabled = false; }, 5000);
        };
    }

    function showError(msg) {
        document.getElementById('errorText').textContent = msg;
        const box = document.getElementById('errorBox');
        box.classList.remove('hidden');
        // Sur téléphone, la zone d'erreur est en haut du formulaire, hors de l'écran : on l'amène sous les yeux
        try { box.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { box.scrollIntoView(); }
        box.focus({ preventScroll: true });
    }

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        document.getElementById('errorBox').classList.add('hidden');

        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;
        const birthdate = document.getElementById('birthdate').value;

        // Vérifications côté client (règles partagées avec l'inscription rapide : inscription-regles.js)
        const erreur = EvcInscription.verifier({ birthdate: birthdate })
            || (password !== confirm ? 'Les mots de passe ne correspondent pas' : '')
            || EvcInscription.verifier({ password: password });
        if (erreur) {
            showError(erreur);
            return;
        }

        // Désactiver le bouton
        const btn = document.getElementById('submitBtn');
        const btnText = document.getElementById('submitText');
        const spinner = document.getElementById('spinner');
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btnText.textContent = 'Création...';
        spinner.classList.remove('hidden');

        try {
            const user = await register(username, email, password, lireParrain(), window.__evcDepartement || '', birthdate);
            if (user.needVerification) {
                afficherVerification(user.email, username, ['registerForm', 'errorBox']);
                return;
            }
            showToast(`Bienvenue ${user.username} ! 🎉`, 'success');
            // Étape d'accueil (salon, photo, crédits offerts) ; elle mène ensuite à la page demandée
            const r = lireRedirection();
            setTimeout(() => { window.location.href = 'bienvenue.html' + (r ? '?redirect=' + encodeURIComponent(r) : ''); }, 800);
        } catch (err) {
            showError(err.message);
            btn.disabled = false;
            btn.style.opacity = '1';
            btnText.textContent = 'Créer mon compte';
            spinner.classList.add('hidden');
        }
    });

    // Baguette magique : propose un pseudo au hasard
    document.getElementById('baguetteBtn').addEventListener('click', () => EvcGoogle.baguette(document.getElementById('username')));
