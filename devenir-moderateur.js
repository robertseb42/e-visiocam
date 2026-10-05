// ============================================================
// E-VISIOCAM — « Devenir modérateur » : conditions + formulaire de candidature
// ============================================================
(function () {
    'use strict';
    var zone = document.getElementById('evrZone');
    if (!zone) return;
    var NOMS = { 'matin': 'Matin', 'midi': 'Midi', 'apres-midi': 'Après-midi', 'soir': 'Soir', 'nuit': 'Nuit', 'week-end': 'Week-end' };
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function date(d) {
        if (!d) return '';
        var x = new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(String(d)) ? '' : 'Z'));
        return isNaN(x) ? '' : x.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function nonConnecte() {
        zone.innerHTML = '<p>Connectez-vous pour vérifier les conditions et envoyer votre candidature.</p>' +
            '<p style="display:flex;gap:10px;flex-wrap:wrap;margin:0"><a class="evr-btn" href="login.html?redirect=devenir-moderateur.html%23postuler"><i class="fa-solid fa-right-to-bracket"></i> Se connecter</a>' +
            '<a class="evr-btn sec" href="register.html">Créer un compte</a></p>';
    }

    function statut(ico, titre, texte, extra) {
        zone.innerHTML = '<div class="evr-statut"><span class="ico" aria-hidden="true">' + ico + '</span><div><h3>' + titre + '</h3><p>' + texte + '</p>' + (extra || '') + '</div></div>';
    }

    function conditionsHtml(conds) {
        return '<ul class="evr-conds">' + conds.map(function (c) {
            return '<li><span class="' + (c.ok ? 'ok' : 'ko') + '">' + (c.ok ? '✔' : '✘') + '</span><span>' + esc(c.label) + (c.detail ? ' <small class="evr-muted">(' + esc(c.detail) + ')</small>' : '') + '</span></li>';
        }).join('') + '</ul>';
    }

    function formulaire(d) {
        var creneaux = (d.creneaux || Object.keys(NOMS)).map(function (k) {
            return '<label><input type="checkbox" name="creneaux" value="' + esc(k) + '"> ' + esc(NOMS[k] || k) + '</label>';
        }).join('');
        zone.innerHTML = conditionsHtml(d.conditions) +
            '<form id="evrForm" novalidate>' +
            '<div class="evr-champ"><label for="evrMotivation">Pourquoi voulez-vous rejoindre l’équipe ?</label>' +
            '<textarea id="evrMotivation" maxlength="2000" required placeholder="Parlez de vous, de ce que vous aimez sur E-VISIOCAM et de la façon dont vous réagiriez face à un membre irrespectueux."></textarea>' +
            '<small><span id="evrCompte">0</span> / 2000 caractères (80 au moins)</small></div>' +
            '<div class="evr-champ"><label for="evrExperience">Avez-vous déjà modéré un tchat, un forum ou un serveur ? <span class="evr-muted">(facultatif)</span></label>' +
            '<textarea id="evrExperience" maxlength="1000" style="min-height:80px" placeholder="Où, combien de temps, ce que vous en avez retenu…"></textarea></div>' +
            '<fieldset class="evr-champ"><legend>Quand êtes-vous connecté le plus souvent ?</legend><div class="evr-puces">' + creneaux + '</div></fieldset>' +
            '<div class="evr-champ"><label for="evrHeures">Combien d’heures par semaine pouvez-vous donner ?</label>' +
            '<input id="evrHeures" type="number" min="2" max="80" step="1" value="5"></div>' +
            '<label class="evr-coche"><input type="checkbox" id="evrCharte"> <span>J’ai lu et j’accepte la <a href="#charte">charte du modérateur</a>, et je comprends que la modération est bénévole.</span></label>' +
            '<p class="evr-erreur" id="evrErreur" role="alert"></p>' +
            '<button type="submit" class="evr-btn"><i class="fa-solid fa-paper-plane"></i> Envoyer ma candidature</button>' +
            '</form>';
        var m = document.getElementById('evrMotivation'), n = document.getElementById('evrCompte');
        m.addEventListener('input', function () { n.textContent = m.value.trim().length; });
        document.getElementById('evrForm').addEventListener('submit', envoyer);
    }

    async function envoyer(e) {
        e.preventDefault();
        var form = e.target, err = document.getElementById('evrErreur'), bouton = form.querySelector('button[type=submit]');
        var corps = {
            motivation: document.getElementById('evrMotivation').value.trim(),
            experience: document.getElementById('evrExperience').value.trim(),
            creneaux: Array.prototype.map.call(form.querySelectorAll('input[name=creneaux]:checked'), function (c) { return c.value; }),
            heures: Number(document.getElementById('evrHeures').value),
            charte: document.getElementById('evrCharte').checked
        };
        err.textContent = '';
        if (corps.motivation.length < 80) { err.textContent = 'Expliquez vos motivations en quelques phrases (80 caractères au moins).'; return; }
        if (!corps.creneaux.length) { err.textContent = 'Cochez au moins un moment où vous êtes disponible.'; return; }
        if (!corps.charte) { err.textContent = 'Merci d’accepter la charte du modérateur.'; return; }
        bouton.disabled = true;
        try {
            await apiCall('/equipe/candidature', { method: 'POST', body: JSON.stringify(corps) });
            charger();
            zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (x) {
            err.textContent = x.message;
            bouton.disabled = false;
        }
    }

    async function retirer() {
        if (!confirm('Retirer votre candidature ?')) return;
        try { await apiCall('/equipe/candidature', { method: 'DELETE' }); charger(); }
        catch (x) { alert(x.message); }
    }

    async function charger() {
        if (typeof getCurrentUser !== 'function' || !getCurrentUser()) return nonConnecte();
        try {
            var d = await apiCall('/equipe/candidature');
            var c = d.candidature, u = getCurrentUser() || {};
            if (d.stage) return statut('🎓', 'Vous êtes modérateur stagiaire', 'Votre stage se termine vers le ' + esc(date(d.stage.fin)) + '. Bon courage !', '<a class="evr-btn" href="moderation.html"><i class="fa-solid fa-shield-halved"></i> Ouvrir la modération</a>');
            if (u.role === 'moderator' || u.role === 'super_admin') return statut('🛡️', 'Vous faites déjà partie de l’équipe', 'Merci pour votre engagement !', '<a class="evr-btn" href="moderation.html"><i class="fa-solid fa-shield-halved"></i> Ouvrir la modération</a>');
            if (c && c.status === 'pending') {
                statut('⏳', 'Candidature envoyée le ' + esc(date(c.createdAt)), 'L’équipe l’examine. Vous recevrez la réponse par e-mail, et un modérateur vous écrira peut-être en message privé pour faire connaissance.',
                    '<button type="button" class="evr-btn sec" id="evrRetirer">Retirer ma candidature</button>');
                document.getElementById('evrRetirer').onclick = retirer;
                return;
            }
            if (c && c.status === 'accepted') return statut('🎉', 'Candidature acceptée', 'Déconnectez-vous puis reconnectez-vous pour accéder à la modération.');
            if (d.pauseJours) {
                return statut('🙏', 'Merci pour votre candidature', 'Elle n’a pas été retenue cette fois.' + (c && c.note ? ' Le mot de l’équipe : « ' + esc(c.note) + ' ».' : '') + ' Vous pourrez postuler de nouveau dans ' + d.pauseJours + ' jour(s).');
            }
            if (!d.peutPostuler) {
                zone.innerHTML = '<p><strong>Vous ne remplissez pas encore toutes les conditions :</strong></p>' + conditionsHtml(d.conditions) + '<p class="evr-muted" style="margin:0">Revenez dès qu’elles sont toutes au vert : le formulaire apparaîtra ici.</p>';
                return;
            }
            formulaire(d);
        } catch (x) {
            if (x.status === 401) return nonConnecte();
            zone.innerHTML = '<p class="evr-erreur">' + esc(x.message) + '</p>';
        }
    }
    charger();
})();
