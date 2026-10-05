// Extrait de forgot-password.html (CSP stricte : plus de script inline dans les pages)
document.getElementById('forgotForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    if (!email) return;

    // Masquer les messages
    document.getElementById('errorBox').classList.add('hidden');
    document.getElementById('successBox').classList.add('hidden');

    // Désactiver le bouton
    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('submitText');
    const spinner = document.getElementById('spinner');
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btnText.textContent = 'Envoi...';
    spinner.classList.remove('hidden');

    try {
        const response = await fetch(API_URL + '/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Erreur');
        }

        // Afficher le succès
        document.getElementById('successBox').classList.remove('hidden');
        document.getElementById('email').value = '';

    } catch (err) {
        document.getElementById('errorText').textContent = err.message;
        document.getElementById('errorBox').classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        btnText.textContent = 'Envoyer le lien';
        spinner.classList.add('hidden');
    }
});
