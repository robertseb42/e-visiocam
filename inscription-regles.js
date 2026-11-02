// ============================================================
// RÈGLES D'INSCRIPTION PARTAGÉES
// Utilisées par register.html (pages/register.js) et par la fiche d'inscription rapide
// de l'aperçu du tchat (apercu.html, pages/apercu.js). Ce sont les MÊMES contrôles que le
// serveur (backend auth.js + routes/auth.js) : on répond tout de suite au visiteur, mais le
// serveur reste seul juge (il refait toutes les vérifications, dont les 18 ans).
// ============================================================
(function () {
    'use strict';

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

    // Contrôle les champs fournis (seulement ceux présents dans l'objet), dans l'ordre du formulaire.
    // Renvoie le premier message d'erreur, ou '' si tout est bon.
    function verifier(c) {
        c = c || {};
        if ('username' in c) {
            const u = String(c.username || '').trim();
            if (u.length < 3 || u.length > 20) return 'Le pseudo doit contenir entre 3 et 20 caractères';
            if (!/^[a-zA-Z0-9_-]+$/.test(u)) return 'Le pseudo ne peut contenir que des lettres, chiffres, _ et -';
        }
        if ('email' in c && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(c.email || '').trim())) return 'Adresse e-mail invalide';
        if ('birthdate' in c) {
            if (!c.birthdate) return 'Veuillez indiquer votre date de naissance';
            if (ageDepuis(c.birthdate) < 18) return 'Vous devez avoir 18 ans ou plus pour vous inscrire';
        }
        if ('password' in c) {
            const p = String(c.password || '');
            if (p.length < 8) return 'Le mot de passe doit contenir au moins 8 caractères';
            if (!/[A-Z]/.test(p)) return 'Le mot de passe doit contenir au moins une majuscule';
            if (!/[0-9]/.test(p)) return 'Le mot de passe doit contenir au moins un chiffre';
        }
        return '';
    }

    // Pseudo du parrain gardé pour la visite (posé par register.html?parrain=…)
    function parrainDeLaVisite() {
        let p = '';
        try { p = sessionStorage.getItem('evc-parrain') || ''; } catch (e) {}
        p = String(p).trim();
        return /^[A-Za-z0-9_.-]{3,30}$/.test(p) ? p : '';
    }

    window.EvcInscription = { ageDepuis: ageDepuis, verifier: verifier, parrainDeLaVisite: parrainDeLaVisite };
})();
