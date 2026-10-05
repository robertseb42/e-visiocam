// Extrait de login.html (CSP stricte : plus de script inline dans les pages)
    EvcGoogle.monter(document.getElementById('googleBtn'), { texte: 'continue_with' });
    // ---------- AFFICHER / MASQUER LE MOT DE PASSE ----------
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

    // ---------- AFFICHER UNE ERREUR ----------
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
        const box = document.getElementById('errorBox');
        const text = document.getElementById('errorText');
        text.textContent = msg;
        box.classList.remove('hidden');
    }

    function hideError() {
        document.getElementById('errorBox').classList.add('hidden');
    }

    // ---------- SOUMISSION DU FORMULAIRE ----------
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        if (!username || !password) {
            showError('Veuillez remplir tous les champs');
            return;
        }

        // Désactiver le bouton
        const btn = document.getElementById('submitBtn');
        const btnText = document.getElementById('submitText');
        const spinner = document.getElementById('spinner');
        btn.disabled = true;
        btn.style.opacity = '0.7';
        btnText.textContent = 'Connexion...';
        spinner.classList.remove('hidden');

        try {
            const user = await login(username, password);

            // Succès !
            showToast(`Bienvenue ${user.username} ! 👋`, 'success');

            // Récupérer le paramètre redirect (si présent)
            const params = new URLSearchParams(window.location.search);
            const redirect = params.get('redirect');

            // Mot de passe réinitialisé par un administrateur : nouveau mot de passe obligatoire
            if (Number(user.must_change_password) === 1) {
                showToast('Choisissez un nouveau mot de passe 🔑', 'info');
                setTimeout(() => { window.location.href = 'nouveau-mdp.html'; }, 900);
                return;
            }

            // Redirection
            setTimeout(() => {
                if (redirect) {
                    window.location.href = redirect;
                } else {
                    redirectByRole(user);
                }
            }, 800);

       } catch (err) {
    // Remettre le bouton en état pour pouvoir réessayer sans actualiser la page
    btn.disabled = false;
    btn.style.opacity = '';
    btnText.textContent = 'Se connecter';
    spinner.classList.add('hidden');

    // ✉️ Compte pas encore confirmé : écran dédié avec renvoi du lien
    if (err.data && err.data.needVerification) {
        afficherVerification(err.data.email, username, ['loginForm', 'errorBox']);
        document.getElementById('verifRetour').onclick = () => {
            document.getElementById('verifBox').classList.add('hidden');
            document.getElementById('loginForm').classList.remove('hidden');
        };
        return;
    }

    // Erreur réseau (serveur injoignable) : message en français plutôt que "Failed to fetch"
    if (/failed to fetch|networkerror|load failed/i.test(err.message || '')) {
        err.message = 'Impossible de joindre le serveur. Vérifiez votre connexion et réessayez.';
    }

    const errorBox = document.getElementById('errorBox');
    const errorText = document.getElementById('errorText');
    const errorIcon = errorBox.querySelector('i');
    
    errorText.textContent = err.message;
    errorBox.classList.remove('hidden');
    
    // Remettre le curseur dans le mot de passe, texte sélectionné, pour le retaper
    const pwd = document.getElementById('password');
    if (pwd) { pwd.focus(); pwd.select(); }
    
    // Adapter l'icône selon le type d'erreur
    if (err.message.includes('Aucun compte')) {
        errorIcon.className = 'fa-solid fa-user-slash mt-0.5';
    } else if (err.message.includes('banni')) {
        errorIcon.className = 'fa-solid fa-ban mt-0.5';
    } else if (err.message.includes('Mot de passe')) {
        errorIcon.className = 'fa-solid fa-lock mt-0.5';
    } else {
        errorIcon.className = 'fa-solid fa-circle-exclamation mt-0.5';
    }
}
    });

    // ---------- SI DÉJÀ CONNECTÉ, REDIRIGER ----------
    if (isLoggedIn()) {
        const user = getCurrentUser();
        redirectByRole(user);
    }

    // ---------- AUTO-FOCUS ----------
    document.getElementById('username').focus();
