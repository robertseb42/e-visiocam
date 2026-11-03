// E-VISIOCAM — Accueil : carte des clubs, saunas et soirées libertines (données du Guide libertin).
// Leaflet n'est chargé que lorsque la carte arrive à l'écran, pour ne pas ralentir l'accueil.
(function () {
    'use strict';
    var bloc = document.getElementById('evCarte');
    if (!bloc) return;
    var zone = document.getElementById('evCarteMap');
    var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
    var JOURS = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
    var NOMS = { club: 'Club', sauna: 'Sauna', soiree: 'Soirées', restaurant: 'Restaurant', loveroom: 'Love room', autre: 'Lieu' };
    var lance = false;

    function charger(src, css) {
        return new Promise(function (ok, ko) {
            if (css) { var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = src; l.onload = ok; l.onerror = ko; document.head.appendChild(l); return; }
            var s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = ko; document.head.appendChild(s);
        });
    }
    function jourDuJour() { return new Date().getDay() || 7; }
    function lien(l) { return l.url || '/lieu.html?l=' + encodeURIComponent(l.slug); }   // page fixe (Google) si le lieu est vérifié

    async function demarrer() {
        if (lance) return; lance = true;
        try {
            var base = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/';
            var res = await Promise.all([
                fetch(API_URL + '/guide/lieux').then(function (r) { return r.json(); }),
                window.L ? null : Promise.all([charger(base + 'leaflet.min.css', true), charger(base + 'leaflet.min.js')])
            ]);
            var lieux = (res[0] && res[0].lieux) || [];
            var carte = L.map(zone, { scrollWheelZoom: false, zoomControl: true, attributionControl: true, worldCopyJump: true, minZoom: 3, zoomSnap: 0.25 })
                .setView([46.6, 2.4], 5);
            L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>', maxZoom: 18
            }).addTo(carte);

            var nb = { club: 0, sauna: 0, soiree: 0 }, ouverts = 0, places = 0, aujourd = jourDuJour();
            lieux.forEach(function (l) {
                (l.types || [l.type]).forEach(function (t) { if (nb[t] != null) nb[t]++; });
                var ouvert = (l.jours || []).indexOf(aujourd) >= 0;
                if (ouvert) ouverts++;
                if (l.lat == null || l.lng == null) return;
                places++;
                var icone = L.divIcon({ className: 'evc-pt' + (ouvert ? ' evc-pt-ouvert' : ''), html: '<span></span>', iconSize: [16, 16], iconAnchor: [8, 8] });
                var types = (l.types || [l.type]).map(function (t) { return NOMS[t] || 'Lieu'; }).join(' + ');
                L.marker([l.lat, l.lng], { icon: icone, title: l.nom, keyboard: true })
                    .bindPopup('<b>' + esc(l.nom) + '</b><br>' + esc(types) + ' · ' + esc(l.ville) +
                        (ouvert ? '<br><span class="evc-pop-ouvert">● Ouvert aujourd\'hui</span>' : '') +
                        '<br><a href="' + esc(lien(l)) + '">Voir la fiche</a>')
                    .addTo(carte);
            });
            var cadrer = function () { carte.invalidateSize(); carte.fitBounds([[41.3, -4.8], [51.1, 8.6]], { padding: [0, 0] }); };
            cadrer(); setTimeout(cadrer, 80);

            var stats = [];
            if (nb.club) stats.push('<b>' + nb.club + '</b> club' + (nb.club > 1 ? 's' : ''));
            if (nb.sauna) stats.push('<b>' + nb.sauna + '</b> sauna' + (nb.sauna > 1 ? 's' : ''));
            if (nb.soiree) stats.push('<b>' + nb.soiree + '</b> lieu' + (nb.soiree > 1 ? 'x' : '') + ' de soirées');
            if (ouverts) stats.push('<b class="evc-vert">' + ouverts + '</b> ouvert' + (ouverts > 1 ? 's' : '') + ' aujourd\'hui');
            document.getElementById('evCarteStats').innerHTML = stats.length ? stats.map(function (x) { return '<span>' + x + '</span>'; }).join('<span aria-hidden="true">·</span>') : 'Le guide se remplit : ajoutez vos adresses !';
            bloc.classList.add('evc-pret');
        } catch (e) {
            zone.innerHTML = '<p class="evc-vide">La carte n\'est pas disponible pour le moment. <a href="guide.html">Ouvrir le guide</a></p>';
        }
    }

    if ('IntersectionObserver' in window) {
        var obs = new IntersectionObserver(function (e) { if (e.some(function (x) { return x.isIntersecting; })) { obs.disconnect(); demarrer(); } }, { rootMargin: '300px' });
        obs.observe(bloc);
    } else demarrer();
})();
