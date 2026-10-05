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
        document.getElementById('errorBox').classList.remove('hidden');
    }

    // Âge en années révolues à partir d'une date ISO (YYYY-MM-DD)
    function ageDepuis(iso) {
        const d = new Date(iso);
        if (isNaN(d)) return 0;
        const now = new Date();
        let age = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
        return age;
    }

    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        document.getElementById('errorBox').classList.add('hidden');

        const username = document.getElementById('username').value.trim();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const confirm = document.getElementById('confirm').value;
        const birthdate = document.getElementById('birthdate').value;

        // Vérifications côté client
        if (!birthdate) {
            showError('Veuillez indiquer votre date de naissance');
            return;
        }
        if (ageDepuis(birthdate) < 18) {
            showError('Vous devez avoir 18 ans ou plus pour vous inscrire');
            return;
        }
        if (password !== confirm) {
            showError('Les mots de passe ne correspondent pas');
            return;
        }
        if (password.length < 8) {
            showError('Le mot de passe doit contenir au moins 8 caractères');
            return;
        }
        if (!/[A-Z]/.test(password)) {
            showError('Le mot de passe doit contenir au moins une majuscule');
            return;
        }
        if (!/[0-9]/.test(password)) {
            showError('Le mot de passe doit contenir au moins un chiffre');
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
            setTimeout(() => redirectByRole(user), 800);
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
