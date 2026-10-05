// Extrait de reset-password.html (CSP stricte : plus de script inline dans les pages)
let resetToken = null;

// ---------- AU CHARGEMENT ----------
document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    resetToken = params.get('token');

    if (!resetToken) {
        showInvalid();
        return;
    }

    try {
        const response = await fetch(API_URL + '/auth/verify-reset-token/' + resetToken);
        const data = await response.json();

        if (data.valid) {
            showForm();
        } else {
            showInvalid();
        }
    } catch (err) {
        showInvalid();
    }
});

function showInvalid() {
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('invalidBox').classList.remove('hidden');
}

function showForm() {
    document.getElementById('loadingBox').classList.add('hidden');
    document.getElementById('formBox').classList.remove('hidden');
}

// ---------- FORCE DU MOT DE PASSE ----------
function checkStrength() {
    const pwd = document.getElementById('newPassword').value;
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

// ---------- SOUMISSION ----------
document.getElementById('resetForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const newPassword = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;

    document.getElementById('errorBox').classList.add('hidden');
    document.getElementById('successBox').classList.add('hidden');

    if (newPassword !== confirmPassword) {
        document.getElementById('errorText').textContent = 'Les mots de passe ne correspondent pas';
        document.getElementById('errorBox').classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('submitText');
    const spinner = document.getElementById('spinner');
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btnText.textContent = 'Modification...';
    spinner.classList.remove('hidden');

    try {
        const response = await fetch(API_URL + '/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: resetToken, newPassword })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Erreur');

        document.getElementById('successBox').classList.remove('hidden');

        setTimeout(() => {
            window.location.href = 'login.html';
        }, 2000);

    } catch (err) {
        document.getElementById('errorText').textContent = err.message;
        document.getElementById('errorBox').classList.remove('hidden');
        btn.disabled = false;
        btn.style.opacity = '1';
        btnText.textContent = 'Changer le mot de passe';
        spinner.classList.add('hidden');
    }
});
