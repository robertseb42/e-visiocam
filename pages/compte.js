// Extrait de compte.html (CSP stricte : plus de script inline dans les pages)
// ============================================================
// MON COMPTE - Connecté au backend
// ============================================================

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentUser = getCurrentUser();
    if (!currentUser) {
        window.location.href = 'login.html';
        return;
    }
    await loadProfile();
});

// ---------- CHARGER LE PROFIL ----------
async function loadProfile() {
    try {
        const data = await apiCall('/users/me');
        const u = data.user;

        saveUser(u);

        document.getElementById('avatar').innerText = u.username.charAt(0).toUpperCase();
        document.getElementById('displayUsername').innerText = u.username;

        const roleLabels = {
            super_admin: '👑 Super Admin',
            moderator: '🔵 Modérateur',
            model: '🟢 Modèle',
            user: '⚪ Utilisateur'
        };
        document.getElementById('displayRole').innerText = roleLabels[u.role] || u.role;

        if (u.created_at) {
            const date = new Date(u.created_at).toLocaleDateString('fr-FR', { year: 'numeric', month: 'long' });
            document.getElementById('displayJoined').innerText = 'Membre depuis ' + date;
        }

        // Formulaire
        document.getElementById('usernameField').value = u.username;
        document.getElementById('emailField').value = u.email || '';
        document.getElementById('bioField').value = u.bio || '';
        document.getElementById('genderField').value = u.gender || '';   // ⚠️ AJOUT
        if (!window.__evcVille) window.__evcVille = EvcVille.monter(document.getElementById('villeBloc'), {
            label: 'Ma ville', classeChamp: 'w-full px-3 py-2 bg-slate-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary', valeur: u.departement || ''
        });
        else window.__evcVille.definir(u.departement || '');
        if (u.birthdate) document.getElementById('birthdateField').value = u.birthdate;
        updateBioCount();

        // Couleur de l'avatar selon le genre/rôle
        updateAvatarColor(u);
        afficherPhoto(u.avatar);
    } catch (err) {
        showToast(err.message, 'error');
    }
}

// ---------- COULEUR AVATAR SELON GENRE ----------
function updateAvatarColor(user) {
    const avatar = document.getElementById('avatar');
    if (!avatar) return;

    // Fille = rose, garçon = bleu, non précisé ou non genré = jaune (comme dans le menu du compte)
    const g = (user.gender || '').toLowerCase();
    let gradient = 'from-amber-400 to-yellow-500';
    if (g === 'femme' || g === 'female' || g === 'f') gradient = 'from-pink-500 to-rose-500';
    else if (g === 'homme' || g === 'male' || g === 'h') gradient = 'from-blue-500 to-cyan-500';

    // Retirer les anciennes classes de gradient
    avatar.className = 'w-24 h-24 mx-auto rounded-full bg-gradient-to-r ' + gradient + ' text-white flex items-center justify-center text-4xl font-bold mb-3';
}

// ---------- PHOTO DE PROFIL ----------
let photoApercu = null;
async function afficherPhoto(etat) {
    const boite = document.getElementById('avatar');
    const info = document.getElementById('photoEtat');
    const st = (etat && etat.status) || 'none';
    document.getElementById('photoRetirer').hidden = st === 'none';
    document.getElementById('photoGalerieZone').hidden = st === 'none';
    document.getElementById('photoGalerie').checked = !etat || etat.galerie !== false;
    document.getElementById('photoChangerTexte').textContent = st === 'none' ? 'Ajouter une photo' : 'Changer la photo';
    info.hidden = st !== 'pending';
    info.textContent = st === 'pending' ? '⏳ En attente de validation : pour l’instant, vous seul la voyez.' : '';
    let src = null;
    if (st === 'approved') src = urlAvatar(etat.url);
    else if (st === 'pending') {
        try {
            const r = await fetch(API_URL + '/avatars/me/image', { credentials: 'include' });
            if (r.ok) { if (photoApercu) URL.revokeObjectURL(photoApercu); photoApercu = URL.createObjectURL(await r.blob()); src = photoApercu; }
        } catch (e) {}
    }
    if (!src) return;
    const img = document.createElement('img');
    img.src = src; img.alt = 'Ma photo de profil';
    img.className = 'w-full h-full rounded-full object-cover' + (st === 'pending' ? ' opacity-70' : '');
    boite.textContent = ''; boite.appendChild(img);
}

// Recadre au centre en carré 320 × 320 et compresse en JPEG (photo légère, sans données de localisation)
function preparerPhoto(fichier) {
    return new Promise((ok, ko) => {
        if (!/^image\/(png|jpeg|webp)$/.test(fichier.type)) return ko(new Error('Format non accepté : utilisez une photo PNG, JPG ou WebP.'));
        if (fichier.size > 15 * 1024 * 1024) return ko(new Error('Photo trop lourde (15 Mo maximum).'));
        const url = URL.createObjectURL(fichier);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            const cote = Math.min(img.naturalWidth, img.naturalHeight);
            if (cote < 96) return ko(new Error('Photo trop petite (96 × 96 pixels minimum).'));
            const c = document.createElement('canvas'); c.width = c.height = 320;
            const ctx = c.getContext('2d');
            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 320, 320);
            ctx.drawImage(img, (img.naturalWidth - cote) / 2, (img.naturalHeight - cote) / 2, cote, cote, 0, 0, 320, 320);
            ok(c.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Image illisible.')); };
        img.src = url;
    });
}

document.getElementById('photoChanger').addEventListener('click', () => document.getElementById('photoFichier').click());
document.getElementById('avatar').addEventListener('click', () => document.getElementById('photoFichier').click());
document.getElementById('avatar').style.cursor = 'pointer';
document.getElementById('avatar').title = 'Changer ma photo de profil';
document.getElementById('photoFichier').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const bouton = document.getElementById('photoChanger');
    bouton.disabled = true;
    try {
        const image = await preparerPhoto(f);
        const d = await apiCall('/avatars/me', { method: 'PUT', body: JSON.stringify({ image }) });
        showToast(d.avatar && d.avatar.status === 'approved' ? 'Photo de profil mise à jour' : 'Photo envoyée : elle sera visible après validation', 'success');
        await loadProfile();
        if (window.EvcRafraichirNav) window.EvcRafraichirNav();
    } catch (err) {
        showToast(err.message, 'error');
    } finally { bouton.disabled = false; }
});
document.getElementById('photoGalerie').addEventListener('change', async (e) => {
    try {
        await apiCall('/avatars/me/galerie', { method: 'PUT', body: JSON.stringify({ visible: e.target.checked }) });
        showToast(e.target.checked ? 'Votre photo apparaît dans la galerie des membres' : 'Votre photo n’apparaît plus dans la galerie', 'success');
    } catch (err) { e.target.checked = !e.target.checked; showToast(err.message, 'error'); }
});
document.getElementById('photoRetirer').addEventListener('click', async () => {
    if (!confirm('Retirer votre photo de profil ?')) return;
    try {
        await apiCall('/avatars/me', { method: 'DELETE' });
        showToast('Photo retirée', 'success');
        await loadProfile();
        if (window.EvcRafraichirNav) window.EvcRafraichirNav();
    } catch (err) { showToast(err.message, 'error'); }
});

// ---------- COMPTEUR DE CARACTÈRES BIO ----------
function updateBioCount() {
    const bio = document.getElementById('bioField').value;
    document.getElementById('bioCount').innerText = bio.length;
}
document.getElementById('bioField').addEventListener('input', updateBioCount);

// ---------- SAUVEGARDER LE PROFIL ----------
async function saveProfile(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const btnText = document.getElementById('saveBtnText');
    btn.disabled = true;
    btnText.innerText = 'Enregistrement...';

    const email = document.getElementById('emailField').value.trim();
    const bio = document.getElementById('bioField').value.trim();
    const birthdate = document.getElementById('birthdateField').value;
    const gender = document.getElementById('genderField').value;   // ⚠️ AJOUT

    try {
        const data = await apiCall('/users/me', {
            method: 'PUT',
            body: JSON.stringify({ bio, email, birthdate, gender, departement: window.__evcVille ? window.__evcVille.valeur() : undefined })
        });
        saveUser(data.user);
        // Nouvelle adresse e-mail : elle ne s'applique qu'après le clic sur le lien envoyé
        showToast(data.message ? '✉️ ' + data.message : '✅ Profil mis à jour !', data.message ? 'info' : 'success');
        await loadProfile();
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btnText.innerText = 'Enregistrer';
    }
}

// ---------- CHANGER LE MOT DE PASSE ----------
async function changePassword(e) {
    e.preventDefault();
    const currentPwd = document.getElementById('currentPwd').value;
    const newPwd = document.getElementById('newPwd').value;
    const confirmPwd = document.getElementById('confirmPwd').value;

    if (newPwd !== confirmPwd) {
        showToast('Les nouveaux mots de passe ne correspondent pas', 'error');
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    const btnText = document.getElementById('pwdBtnText');
    btn.disabled = true;
    btnText.innerText = 'Modification...';

    try {
        await apiCall('/users/me/password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd })
        });
        showToast('🔑 Mot de passe modifié !');
        document.getElementById('currentPwd').value = '';
        document.getElementById('newPwd').value = '';
        document.getElementById('confirmPwd').value = '';
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        btn.disabled = false;
        btnText.innerText = 'Changer le mot de passe';
    }
}

// ---------- SUPPRIMER LE COMPTE ----------
async function deleteAccount() {
    const pwd = prompt('⚠️ Tapez votre mot de passe pour confirmer la suppression :');
    if (!pwd) return;

    if (!confirm('DERNIÈRE CHANCE. Supprimer définitivement votre compte ?')) return;

    try {
        await apiCall('/users/me', {
            method: 'DELETE',
            body: JSON.stringify({ password: pwd })
        });
        showToast('🗑️ Compte supprimé. Au revoir...', 'warning');
        clearToken();
        clearUser();
        setTimeout(() => window.location.href = 'index.html', 1500);
    } catch (err) {
        showToast(err.message, 'error');
    }
}
