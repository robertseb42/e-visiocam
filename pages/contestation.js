// Extrait de contestation.html (CSP stricte : plus de script inline dans les pages)
(function () {
    var API = (typeof API_URL !== 'undefined' ? API_URL : 'https://api.e-visiocam.com/api');
    var jeton = new URLSearchParams(location.search).get('t') || '';
    var $ = function (id) { return document.getElementById(id); };
    var dateFr = function (iso) { return new Date(iso).toLocaleString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    function montrer(id) { $('chargement').classList.add('hidden'); $(id).classList.remove('hidden'); }

    if (!/^[a-f0-9]{48}$/.test(jeton)) { montrer('sansLien'); return; }
    // Le lien secret ne doit pas rester dans l'historique partagé ni être envoyé à d'autres sites
    try { history.replaceState(null, '', 'contestation.html?t=' + jeton); } catch (e) {}

    fetch(API + '/appeals/' + jeton, { credentials: 'omit' }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
    .then(function (x) {
        if (!x.ok) { montrer('sansLien'); var p = document.createElement('p'); p.className = 'text-rose-600 font-semibold'; p.textContent = x.d.error || 'Lien invalide'; $('sansLien').prepend(p); return; }
        var d = x.d;
        var lignes = [['Compte', d.pseudo], ['Mesure', d.mesure], ['Durée', d.duree], ['Date', dateFr(d.date)]];
        if (d.fin) lignes.push(['Fin prévue', dateFr(d.fin)]);
        lignes.push(['Motif', d.motif || 'Non-respect des règles de conduite']);
        if (d.levee) lignes.push(['État', 'Mesure levée']);
        lignes.forEach(function (l) {
            var dt = document.createElement('dt'); dt.className = 'text-slate-500'; dt.textContent = l[0];
            var dd = document.createElement('dd'); dd.className = 'font-semibold text-slate-900'; dd.textContent = l[1];
            $('details').append(dt, dd);
        });
        montrer('decision');
        var deja = $('dejaFait');
        if (d.contestation) {
            var st = d.contestation.statut;
            deja.className = 'rounded-2xl border p-5 mb-6 text-sm ' + (st === 'accepted' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : st === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-900' : 'border-amber-200 bg-amber-50 text-amber-900');
            var t = document.createElement('p'); t.className = 'font-bold mb-1';
            t.textContent = st === 'pending' ? '⏳ Votre contestation est en cours d\'examen' : st === 'accepted' ? '✅ Contestation acceptée : la mesure a été levée' : '❌ Contestation non retenue : la mesure est maintenue';
            deja.append(t);
            if (d.contestation.reponse) { var r = document.createElement('p'); r.style.cssText = 'color:inherit;margin:0'; r.textContent = 'Réponse de la modération : ' + d.contestation.reponse; deja.append(r); }
            deja.classList.remove('hidden');
        } else if (d.delaiDepasse) {
            deja.className = 'rounded-2xl border border-slate-200 p-5 mb-6 text-sm text-slate-700';
            deja.textContent = 'Le délai de 6 mois pour contester cette décision est dépassé. Vous pouvez toujours nous écrire via le formulaire de contact.';
        } else {
            $('formAppel').classList.remove('hidden');
        }
    }).catch(function () { montrer('sansLien'); });

    $('message').addEventListener('input', function () { $('nb').textContent = this.value.length; });
    $('formAppel').addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('erreur'); err.classList.add('hidden');
        var message = $('message').value.trim(), contact = $('contact').value.trim();
        var faute = message.length < 20 ? 'Expliquez votre contestation (20 caractères au moins).' : !$('exact').checked ? 'Cochez la case de certification pour envoyer.' : '';
        if (faute) { err.textContent = faute; err.classList.remove('hidden'); return; }
        var b = $('envoyer'); b.disabled = true; b.textContent = 'Envoi…';
        fetch(API + '/appeals/' + jeton, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message, contact: contact }) })
            .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
            .then(function (x) {
                if (!x.ok) throw new Error(x.d.error || 'Envoi impossible');
                $('formAppel').classList.add('hidden'); $('merci').classList.remove('hidden');
            })
            .catch(function (e2) { err.textContent = e2.message; err.classList.remove('hidden'); b.disabled = false; b.textContent = 'Envoyer ma contestation'; });
    });
})();
