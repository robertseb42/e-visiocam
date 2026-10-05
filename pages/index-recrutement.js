// Extrait de index.html (CSP stricte : plus de script inline dans les pages)
// Recrutement : caché pour l'équipe ; un visiteur non inscrit est invité à créer son compte d'abord
(function () {
    var u = null; try { u = typeof getCurrentUser === 'function' ? getCurrentUser() : null; } catch (e) {}
    var bloc = document.getElementById('evRecrute');
    if (!bloc) return;
    if (u && (u.role === 'moderator' || u.role === 'super_admin')) { bloc.hidden = true; return; }
    if (!u) document.getElementById('evRecruteNote').innerHTML = 'Créez votre compte dès aujourd’hui : vous pourrez postuler après 15 jours d’ancienneté. <a href="register.html">S’inscrire</a>';
})();
