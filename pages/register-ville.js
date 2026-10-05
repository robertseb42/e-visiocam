// Extrait de register.html (CSP stricte : plus de script inline dans les pages)
    EvcVille.monter(document.getElementById('villeBloc'), {
        label: 'Votre ville',
        classeChamp: 'input-field w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none',
        onChange: function (c) { window.__evcDepartement = c; }
    });
