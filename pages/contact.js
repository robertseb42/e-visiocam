// Extrait de contact.html (CSP stricte : plus de script inline dans les pages)
// Compteur de caractères
document.getElementById('message').addEventListener('input', (e) => {
    document.getElementById('charCount').textContent = e.target.value.length;
});

// Soumission du formulaire
document.getElementById('contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const subject = document.getElementById('subject').value;
    const message = document.getElementById('message').value.trim();

    document.getElementById('errorBox').classList.add('hidden');
    document.getElementById('successBox').classList.add('hidden');

    if (!name || !email || !subject || !message) {
        document.getElementById('errorText').textContent = 'Veuillez remplir tous les champs obligatoires';
        document.getElementById('errorBox').classList.remove('hidden');
        return;
    }

    if (message.length < 10) {
        document.getElementById('errorText').textContent = 'Votre message est trop court (10 caractères minimum)';
        document.getElementById('errorBox').classList.remove('hidden');
        return;
    }

    const btn = document.getElementById('submitBtn');
    const btnText = document.getElementById('submitText');
    const spinner = document.getElementById('spinner');
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btnText.textContent = 'Envoi...';
    spinner.classList.remove('hidden');

    try {
        await apiCall('/contact', {
            method: 'POST',
            body: JSON.stringify({
                name, email, subject, message,
                consent: document.getElementById('rgpd').checked,
                website: document.getElementById('website').value
            })
        });

        document.getElementById('successBox').classList.remove('hidden');
        document.getElementById('contactForm').reset();
        document.getElementById('charCount').textContent = '0';

        // Scroll vers le message de succès
        document.getElementById('successBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) {
        document.getElementById('errorText').textContent = (err && err.message && err.message !== 'Erreur' && err.message !== 'Failed to fetch')
            ? err.message
            : 'Envoi impossible pour le moment. Réessayez ou écrivez à contact@e-visiocam.com.';
        document.getElementById('errorBox').classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btn.style.opacity = '1';
        btnText.textContent = 'Envoyer le message';
        spinner.classList.add('hidden');
    }
});
