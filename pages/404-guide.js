// E-VISIOCAM — Page introuvable : rattrapage des adresses du guide libertin.
// Les pages fixes /club-libertin/<ville>/<lieu>/ sont publiées à la republication du site : un lieu vérifié depuis peu
// n'a pas encore la sienne. On renvoie alors vers sa fiche dynamique (lieu.html?l=<slug>), puis vers le guide.
(function () {
    'use strict';
    var m = location.pathname.match(/^\/club-libertin\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?\/?$/);
    if (!m) return;
    var api = (window.API_URL || 'https://api.e-visiocam.com/api') + '/guide/lieux/';
    var REGIONS = ['auvergne-rhone-alpes', 'bourgogne-franche-comte', 'bretagne', 'centre-val-de-loire', 'corse', 'grand-est', 'hauts-de-france',
        'ile-de-france', 'normandie', 'nouvelle-aquitaine', 'occitanie', 'pays-de-la-loire', 'provence-alpes-cote-d-azur', 'outre-mer'];
    var carte = document.querySelector('.nf-card p');
    if (carte) carte.textContent = 'Cette page du guide est en cours de publication : nous vous emmenons vers la fiche…';
    function vers(u) { location.replace(u); }
    if (!m[2]) return vers('/guide.html' + (REGIONS.indexOf(m[1]) >= 0 ? '?region=' + m[1] : ''));
    var essais = [m[2] + '-' + m[1], m[2]];   // « /lyon/double-side-sauna/ » → double-side-sauna-lyon, sinon double-side-sauna
    (function essai(i) {
        if (i >= essais.length) return vers('/guide.html');
        fetch(api + encodeURIComponent(essais[i])).then(function (r) {
            if (r.ok) vers('/lieu.html?l=' + encodeURIComponent(essais[i])); else essai(i + 1);
        }).catch(function () { vers('/guide.html'); });
    })(0);
})();
