// Extrait de nouveau-mdp.html (CSP stricte : plus de script inline dans les pages)
(function() {
    if (typeof isLoggedIn !== 'function' || !isLoggedIn()) {
        window.location.href = 'login.html?redirect=nouveau-mdp.html';
        return;
    }

    const user = getCurrentUser() || {};
    document.getElementById('who').textContent = user.username || '—';

    const pwd1 = document.getElementById('pwd1');
    const pwd2 = document.getElementById('pwd2');
    const regles = [
        { el: 'r1', ok: v => v.length >= 8 },
        { el: 'r2', ok: v => /[A-Z]/.test(v) },
        { el: 'r3', ok: v => /[0-9]/.test(v) }
    ];
    function majRegles() {
        regles.forEach(r => {
            const li = document.getElementById(r.el);
            const ok = r.ok(pwd1.value);
            li.className = ok ? 'text-emerald-600 font-semibold' : 'text-slate-500';
            li.querySelector('i').className = ok ? 'fa-solid fa-circle-check mr-1' : 'fa-solid fa-circle-xmark mr-1';
        });
    }
    pwd1.addEventListener('input', majRegles);

    function erreur(msg) {
        const box = document.getElementById('errorBox');
        if (!msg) { box.classList.add('hidden'); return; }
        box.textContent = msg;
        box.classList.remove('hidden');
    }

    document.getElementById('pwdForm').addEventListener('submit', async e => {
        e.preventDefault();
        erreur('');
        const mdp = pwd1.value;
        if (regles.some(r => !r.ok(mdp))) return erreur('Le mot de passe ne respecte pas les trois règles.');
        if (mdp !== pwd2.value) return erreur('Les deux mots de passe ne sont pas identiques.');

        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin mr-1"></i> Enregistrement...';
        try {
            const data = await apiCall('/auth/change-password', { method: 'POST', body: JSON.stringify({ newPassword: mdp }) });
            if (data && data.token) saveToken(data.token);
            const frais = getCurrentUser() || user;
            frais.must_change_password = 0;
            saveUser(frais);
            showToast('✅ Nouveau mot de passe enregistré');
            setTimeout(() => { redirectByRole(frais); }, 900);
        } catch (err) {
            erreur(err.message || 'Enregistrement impossible');
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk mr-1"></i> Enregistrer mon mot de passe';
        }
    });

    majRegles();
})();
