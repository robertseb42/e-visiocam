// ============================================================
// E-VISIOCAM — Guide libertin (guide.html et lieu.html). API : /api/guide
// guide.html?region=bretagne&type=club : carte + liste ; lieu.html?l=<slug> : fiche, avis, bons plans
// ============================================================
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };
    var surFiche = !!$('glFiche');
    var REGIONS = [], etat = { region: '', type: '', public: '', q: '' }, carte = null, calque = null, lieuCourant = null;
    var TUILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
    var ATTRIB = '&copy; OpenStreetMap &copy; CARTO';
    var ICONES = { club: 'fa-champagne-glasses', sauna: 'fa-hot-tub-person', soiree: 'fa-masks-theater', autre: 'fa-location-dot' };
    var PUBLICS = { couples: 'Couples', femmes: 'Femmes seules', hommes: 'Hommes seuls' };

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function connecte() { return typeof getCurrentUser === 'function' && !!getCurrentUser(); }
    function equipe() { var u = connecte() && getCurrentUser(); return !!u && (u.role === 'moderator' || u.role === 'super_admin'); }
    function toast(t, type) { if (typeof showToast === 'function') showToast(t, type || 'info'); else alert(t); }
    function versConnexion() { location.href = 'login.html?redirect=' + encodeURIComponent(location.pathname.replace(/^\//, '') + location.search); }
    async function api(chemin, options) {
        if (typeof apiCall === 'function') return apiCall('/guide' + chemin, options);
        var r = await fetch(API_URL + '/guide' + chemin, options); var d = await r.json(); if (!r.ok) throw new Error(d.error || 'Erreur'); return d;
    }
    function dateFr(d) { return new Date(String(d).replace(' ', 'T') + (/[Z+]/.test(d) ? '' : 'Z')).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }); }
    function moisFr(v) { if (!/^\d{4}-\d{2}$/.test(v || '')) return ''; var p = v.split('-'); return new Date(+p[0], +p[1] - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); }
    function etoiles(n) { var s = ''; for (var i = 1; i <= 5; i++) s += '<i class="fa-' + (n >= i - 0.25 ? 'solid' : 'regular') + ' fa-star" aria-hidden="true"></i>'; return '<span class="gl-note-etoiles" aria-label="' + (n == null ? 'pas de note' : String(n).replace('.', ',') + ' sur 5') + '">' + s + '</span>'; }
    function note(n) { return n == null ? '—' : String(n).replace('.', ','); }

    // ---------- Fenêtres ----------
    function ouvrir(id) { var f = $(id); f.hidden = false; var e = f.querySelector('.gl-erreur'); if (e) e.hidden = true; var c = f.querySelector('input:not([type=checkbox]),select,textarea'); if (c) c.focus(); }
    function fermer(f) { f.hidden = true; }
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-fermer]'); if (b) fermer(b.closest('.gl-fond'));
        if (e.target.classList && e.target.classList.contains('gl-fond')) fermer(e.target);
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.querySelectorAll('.gl-fond:not([hidden])').forEach(fermer); });
    function erreur(form, msg) { var e = form.querySelector('.gl-erreur'); e.textContent = msg; e.hidden = false; }
    function remplirRegions(defaut) {
        document.querySelectorAll('select[data-regions]').forEach(function (s) {
            s.innerHTML = '<option value="">Choisir…</option>' + REGIONS.map(function (r) { return '<option value="' + r.slug + '"' + (r.slug === defaut ? ' selected' : '') + '>' + esc(r.nom) + '</option>'; }).join('');
        });
    }

    // Étoiles cliquables (formulaire d'avis)
    document.querySelectorAll('.gl-etoiles').forEach(function (z) {
        var nom = z.getAttribute('data-note');
        z.innerHTML = '<input type="hidden" name="' + nom + '" value="">' + [1, 2, 3, 4, 5].map(function (i) {
            return '<button type="button" data-v="' + i + '" aria-label="' + i + ' sur 5" aria-pressed="false"><i class="fa-regular fa-star" aria-hidden="true"></i></button>';
        }).join('');
        z.addEventListener('click', function (e) {
            var b = e.target.closest('button[data-v]'); if (!b) return;
            var v = +b.getAttribute('data-v');
            z.querySelector('input').value = v;
            z.querySelectorAll('button').forEach(function (x) {
                var on = +x.getAttribute('data-v') <= v;
                x.setAttribute('aria-pressed', String(+x.getAttribute('data-v') === v));
                x.firstChild.className = 'fa-' + (on ? 'solid' : 'regular') + ' fa-star';
            });
        });
    });

    // ---------- Proposer un lieu / un bon plan ----------
    function brancherFormulaires() {
        var fl = $('glFormLieu');
        if (fl) fl.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fl).entries());
            d.publics = [].slice.call(fl.querySelectorAll('input[name=publics]:checked')).map(function (x) { return x.value; });
            try { var r = await api('/lieux', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetreLieu')); fl.reset(); toast(r.message, 'success'); if (equipe()) charger(); }
            catch (x) { erreur(fl, x.message); }
        });
        var fp = $('glFormPlan');
        if (fp) fp.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fp).entries());
            if (lieuCourant) d.lieuId = lieuCourant.id;
            try { var r = await api('/bons-plans', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetrePlan')); fp.reset(); toast(r.message, 'success'); }
            catch (x) { erreur(fp, x.message); }
        });
        var fa = $('glFormAvis');
        if (fa) fa.addEventListener('submit', async function (e) {
            e.preventDefault();
            var d = Object.fromEntries(new FormData(fa).entries());
            if (!d.note) { erreur(fa, 'Donnez une note générale (de 1 à 5 étoiles).'); return; }
            try { var r = await api('/lieux/' + lieuCourant.id + '/avis', { method: 'POST', body: JSON.stringify(d) }); fermer($('glFenetreAvis')); toast(r.message, 'success'); chargerFiche(); }
            catch (x) { erreur(fa, x.message); }
        });
    }

    // ============================================================
    // PAGE GUIDE
    // ============================================================
    function urlEtat() {
        var p = new URLSearchParams();
        if (etat.region) p.set('region', etat.region);
        if (etat.type) p.set('type', etat.type);
        if (etat.public) p.set('public', etat.public);
        try { history.replaceState(null, '', location.pathname + (p.toString() ? '?' + p : '')); } catch (e) {}
    }
    function dessinerRegions() {
        $('glRegions').innerHTML = REGIONS.map(function (r) {
            return '<button type="button" data-region="' + r.slug + '" aria-pressed="' + (r.slug === etat.region) + '" class="gl-r gl-r-' + r.slug + '"><b>' + esc(r.nom) + '</b><small>' + (r.lieux ? r.lieux + (r.lieux > 1 ? ' lieux' : ' lieu') : 'à découvrir') + '</small></button>';
        }).join('');
    }
    async function charger() {
        urlEtat();
        dessinerRegions();
        var r = REGIONS.filter(function (x) { return x.slug === etat.region; })[0];
        $('glListeTitre').textContent = r ? r.nom : 'Tous les lieux';
        var titre = r ? 'Clubs, saunas et soirées libertines en ' + r.nom : 'Clubs, saunas et soirées libertines en France';
        $('glTitre').textContent = titre;
        document.title = (r ? 'Club libertin ' + r.nom + ' : ' : 'Guide libertin : ') + 'clubs, saunas, soirées — E-VISIOCAM';
        var s = $('glSalon');
        if (r) { s.hidden = false; s.href = 'chat.html?theme=' + encodeURIComponent(r.salon); s.textContent = 'Discuter dans le salon ' + r.nom + ' →'; } else s.hidden = true;
        var liste = $('glListe');
        liste.innerHTML = '<p class="gl-vide"><i class="fa-solid fa-spinner fa-spin"></i> Chargement…</p>';
        try {
            var q = new URLSearchParams();
            ['region', 'type', 'public', 'q'].forEach(function (k) { if (etat[k]) q.set(k, etat[k]); });
            var d = await api('/lieux?' + q);
            var l = d.lieux || [];
            liste.innerHTML = l.length ? l.map(carteLieu).join('') :
                '<div class="gl-vide-bloc"><i class="fa-regular fa-map" aria-hidden="true"></i><p>' + (etat.q || etat.type || etat.public ? 'Aucun lieu ne correspond à ces filtres.' : 'Pas encore de lieu ' + (r ? 'en ' + esc(r.nom) : 'dans le guide') + '.') + '</p><p>Vous connaissez un club, un sauna ou une soirée ? <button type="button" class="gl-lien-btn" data-proposer>Proposez-le</button>, la communauté vous remerciera.</p></div>';
            placerSurCarte(l, r);
            var plans = d.bonsPlans || [];
            $('glPlans').hidden = !r;
            $('glPlansListe').innerHTML = plans.length ? plans.map(function (b) {
                return '<li><p>' + esc(b.texte) + '</p><small>' + (b.lieu ? '<a href="lieu.html?l=' + encodeURIComponent(b.lieu.slug) + '">' + esc(b.lieu.nom) + '</a> · ' : '') + esc(dateFr(b.date)) + '</small></li>';
            }).join('') : '<li class="gl-vide-plan">Pas encore de bon plan dans cette région.</li>';
        } catch (e) {
            liste.innerHTML = '<p class="gl-vide">Le guide ne peut pas être affiché pour le moment.</p>';
        }
    }
    function carteLieu(l) {
        var pub = (l.publics || []).map(function (p) { return PUBLICS[p]; }).filter(Boolean).join(', ');
        return '<a class="gl-lieu" href="lieu.html?l=' + encodeURIComponent(l.slug) + '">' +
            '<span class="gl-lieu-ico" aria-hidden="true"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '"></i></span>' +
            '<span class="gl-lieu-txt"><b>' + esc(l.nom) + '</b><span>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + (etat.region ? '' : ' · ' + esc(l.regionNom)) + '</span>' +
            (pub || l.precisionPublic ? '<small>' + esc(pub) + (l.precisionPublic ? ' — ' + esc(l.precisionPublic) : '') + '</small>' : '') + '</span>' +
            '<span class="gl-lieu-note">' + (l.nbAvis ? '<b>' + note(l.note) + '</b><small>' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</span></a>';
    }
    function initCarte() {
        if (carte || !window.L || !$('glCarte')) return;
        carte = L.map('glCarte', { scrollWheelZoom: false, attributionControl: true }).setView([46.6, 2.4], 5);
        L.tileLayer(TUILES, { attribution: ATTRIB, subdomains: 'abcd', maxZoom: 18 }).addTo(carte);
        calque = L.layerGroup().addTo(carte);
    }
    function placerSurCarte(lieux, region) {
        initCarte();
        if (!carte) return;
        calque.clearLayers();
        var pts = [];
        lieux.forEach(function (l) {
            if (l.lat == null || l.lng == null) return;
            pts.push([l.lat, l.lng]);
            L.circleMarker([l.lat, l.lng], { radius: 8, color: '#111113', weight: 2, fillColor: '#ff1680', fillOpacity: 0.95 })
                .bindPopup('<b>' + esc(l.nom) + '</b><br>' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + '<br><a href="lieu.html?l=' + encodeURIComponent(l.slug) + '">Voir la fiche</a>')
                .addTo(calque);
        });
        if (pts.length > 1) carte.fitBounds(pts, { padding: [30, 30], maxZoom: 11 });
        else if (pts.length === 1) carte.setView(pts[0], 10);
        else carte.setView([46.6, 2.4], 5);
        setTimeout(function () { carte.invalidateSize(); }, 50);
    }

    // ---------- Modération (équipe) ----------
    async function chargerModeration() {
        if (!equipe() || !$('glModeration')) return;
        try {
            var d = await api('/moderation');
            var total = d.lieux.length + d.avis.length + d.bonsPlans.length + d.signales.length;
            $('glModeration').hidden = false;
            if (!total) { $('glModContenu').innerHTML = '<p class="gl-vide">Rien à valider pour le moment.</p>'; return; }
            var bloc = function (titre, items, rendu) { return items.length ? '<h3>' + titre + ' (' + items.length + ')</h3>' + items.map(rendu).join('') : ''; };
            var boutons = function (quoi, id, garder) {
                return '<div class="gl-mod-actions">' + (garder ? '<button type="button" class="gl-btn" data-mod="' + quoi + '" data-id="' + id + '" data-d="garder">Garder l\'avis</button><button type="button" class="gl-btn gl-btn-rouge" data-mod="' + quoi + '" data-id="' + id + '" data-d="refuser">Retirer l\'avis</button>'
                    : '<button type="button" class="gl-btn gl-btn-jaune" data-mod="' + quoi + '" data-id="' + id + '" data-d="publier">Publier</button><button type="button" class="gl-btn gl-btn-rouge" data-mod="' + quoi + '" data-id="' + id + '" data-d="refuser">Refuser</button>') + '</div>';
            };
            $('glModContenu').innerHTML =
                bloc('Lieux proposés', d.lieux, function (l) { return '<article class="gl-mod"><b>' + esc(l.nom) + '</b> · ' + esc(l.typeLibelle) + ' · ' + esc(l.ville) + ' (' + esc(l.regionNom) + ')<p>' + esc(l.adresse) + (l.site ? ' · ' + esc(l.site) : '') + '</p><p>' + esc(l.description) + '</p><small>Proposé par ' + esc(l.proposePar) + '</small>' + boutons('lieu', l.id) + '</article>'; }) +
                bloc('Avis à relire', d.avis, function (a) { return '<article class="gl-mod"><b>' + esc(a.lieu.nom) + '</b> · ' + a.note + '/5 · par ' + esc(a.auteur) + '<p><b>' + esc(a.titre) + '</b> ' + esc(a.texte) + '</p>' + boutons('avis', a.id) + '</article>'; }) +
                bloc('Bons plans', d.bonsPlans, function (b) { return '<article class="gl-mod">' + esc(b.lieu || b.region) + ' · par ' + esc(b.auteur) + '<p>' + esc(b.texte) + '</p>' + boutons('bon-plan', b.id) + '</article>'; }) +
                bloc('Avis signalés', d.signales, function (s) { return '<article class="gl-mod"><b>' + esc(s.lieu.nom) + '</b> · ' + s.nb + ' signalement(s) : ' + esc(s.motifs) + '<p><b>' + esc(s.titre) + '</b> ' + esc(s.texte) + '</p>' + boutons('signalement', s.id, true) + '</article>'; });
        } catch (e) {}
    }
    document.addEventListener('click', async function (e) {
        var b = e.target.closest('[data-mod]');
        if (!b) return;
        var d = b.getAttribute('data-d'), motif = '';
        if (d === 'refuser') { motif = prompt('Motif (visible par l\'équipe) :', '') ; if (motif === null) return; }
        b.disabled = true;
        try { await api('/moderation/' + b.getAttribute('data-mod') + '/' + b.getAttribute('data-id'), { method: 'POST', body: JSON.stringify({ decision: d, motif: motif }) }); toast('C\'est fait', 'success'); chargerModeration(); if (!surFiche) chargerRegions(); }
        catch (x) { toast(x.message, 'error'); b.disabled = false; }
    });

    async function chargerRegions() {
        try { REGIONS = (await api('/regions')).regions || []; } catch (e) { REGIONS = []; }
        remplirRegions(etat.region);
        if (!surFiche) charger();
    }

    // ============================================================
    // FICHE D'UN LIEU
    // ============================================================
    async function chargerFiche() {
        var slug = new URLSearchParams(location.search).get('l') || '';
        var zone = $('glFiche');
        try {
            var d = await api('/lieux/' + encodeURIComponent(slug));
            var l = lieuCourant = d.lieu;
            document.title = l.nom + ' — ' + l.typeLibelle + ' libertin à ' + l.ville + ' | Guide E-VISIOCAM';
            $('glArianeRegion').textContent = l.regionNom; $('glArianeRegion').href = 'guide.html?region=' + encodeURIComponent(l.region);
            $('glArianeLieu').textContent = l.nom;
            var pub = (l.publics || []).map(function (p) { return '<span class="gl-tag">' + PUBLICS[p] + '</span>'; }).join('');
            var infos = [['Adresse', l.adresse], ['Horaires', l.horaires], ['Tarifs', l.tarifs], ['Équipements', l.equipements], ['Tenue', l.tenue]]
                .filter(function (x) { return x[1]; }).map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('');
            if (l.site) infos += '<dt>Site</dt><dd><a href="' + esc(l.site) + '" target="_blank" rel="noopener nofollow ugc">' + esc(l.site.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')) + '</a></dd>';
            var mon = d.monAvis;
            var avis = d.avis.map(function (a) {
                return '<article class="gl-avis"><div class="gl-avis-tete"><span><b>' + esc(a.auteur) + '</b>' + (a.profil ? ' · ' + ({ couple: 'en couple', femme: 'femme seule', homme: 'homme seul' })[a.profil] : '') + (a.visite ? ' · visite en ' + esc(moisFr(a.visite)) : '') + '</span><span>Avis du ' + esc(dateFr(a.date)) + (a.modifie ? ' (modifié)' : '') + '</span></div>' +
                    '<div class="gl-avis-titre">' + etoiles(a.note) + (a.titre ? ' <b>' + esc(a.titre) + '</b>' : '') + '</div>' +
                    '<p>' + esc(a.texte) + '</p>' +
                    (a.reponse ? '<div class="gl-reponse"><b>Réponse de l\'établissement</b> · ' + esc(dateFr(a.reponse.date)) + '<p>' + esc(a.reponse.texte) + '</p></div>' : '') +
                    '<div class="gl-avis-actions"><button type="button" class="gl-lien-btn" data-utile="' + a.id + '">Utile (' + a.utiles + ')</button><button type="button" class="gl-lien-btn gl-gris" data-signaler="' + a.id + '">Signaler cet avis</button>' +
                    (equipe() ? '<button type="button" class="gl-lien-btn gl-gris" data-reponse="' + a.id + '">Saisir la réponse du lieu</button>' : '') + '</div></article>';
            }).join('');
            var dn = d.notes || {}; var notes = [['Accueil', dn.accueil], ['Ambiance', dn.ambiance], ['Propreté', dn.proprete], ['Rapport qualité-prix', dn.prix]];
            zone.innerHTML =
                '<div class="gl-fiche-grille"><div class="gl-fiche-principal">' +
                (l.statut !== 'publie' ? '<p class="gl-attente">Fiche en attente de validation (visible par l\'équipe uniquement).</p>' : '') +
                '<div class="gl-fiche-tete"><div><span class="gl-type"><i class="fa-solid ' + (ICONES[l.type] || ICONES.autre) + '" aria-hidden="true"></i> ' + esc(l.typeLibelle) + '</span><h1>' + esc(l.nom) + '</h1><p class="gl-ville">' + esc(l.ville) + ' · ' + esc(l.regionNom) + '</p><div class="gl-tags">' + pub + (l.precisionPublic ? '<span class="gl-tag">' + esc(l.precisionPublic) + '</span>' : '') + '</div></div>' +
                '<div class="gl-note-bloc">' + (l.nbAvis ? '<b>' + note(l.note) + '</b><small>sur 5 · ' + l.nbAvis + ' avis</small>' : '<small>Pas encore d\'avis</small>') + '</div></div>' +
                (l.description ? '<p class="gl-description">' + esc(l.description) + '</p>' : '') +
                (l.nbAvis ? '<div class="gl-notes-detail">' + notes.map(function (n) { return '<div><small>' + n[0] + '</small><b>' + note(n[1]) + '</b></div>'; }).join('') + '</div>' : '') +
                '<section class="gl-avis-bloc"><div class="gl-avis-entete"><h2>Avis des membres</h2><button type="button" class="gl-btn gl-btn-jaune" id="glDonnerAvis">' + (mon ? 'Modifier mon avis' : 'Donner mon avis') + '</button></div>' +
                (mon && mon.statut !== 'publie' ? '<p class="gl-attente">' + (mon.statut === 'attente' ? 'Votre avis est en cours de relecture par la modération.' : 'Votre avis n\'a pas été publié' + (mon.motif ? ' : ' + esc(mon.motif) : '.') + ' Vous pouvez le modifier.') + '</p>' : '') +
                (avis || '<p class="gl-vide">Soyez le premier à donner votre avis sur ce lieu.</p>') + '</section></div>' +
                '<aside class="gl-fiche-cote">' +
                '<section class="gl-encart"><h2>Infos pratiques</h2><dl>' + (infos || '<dt></dt><dd>Infos à compléter.</dd>') + '</dl><div id="glMiniCarte" class="gl-mini-carte"' + (l.lat == null ? ' hidden' : '') + '></div></section>' +
                '<section class="gl-encart"><h2>Bons plans</h2>' + (d.bonsPlans.length ? '<ul class="gl-plans-fiche">' + d.bonsPlans.map(function (b) { return '<li>' + esc(b.texte) + '<small>' + esc(dateFr(b.date)) + '</small></li>'; }).join('') + '</ul>' : '<p class="gl-vide-plan">Pas encore de bon plan.</p>') + '<button type="button" class="gl-lien-btn" id="glPlanLieu">Partager un bon plan →</button></section>' +
                '<section class="gl-encart gl-pointille"><b>Vous gérez ce lieu ?</b><p>Contactez-nous pour mettre la fiche à jour, ajouter vos photos officielles et répondre aux avis.</p><a class="gl-lien" href="contact.html">Revendiquer cette fiche →</a></section>' +
                (l.salon ? '<a class="gl-btn gl-large" href="chat.html?theme=' + encodeURIComponent(l.salon) + '">Discuter dans le salon ' + esc(l.regionNom) + '</a>' : '') +
                '</aside></div>';
            if (l.lat != null && window.L) {
                var m = L.map('glMiniCarte', { scrollWheelZoom: false, zoomControl: false }).setView([l.lat, l.lng], 14);
                L.tileLayer(TUILES, { attribution: ATTRIB, subdomains: 'abcd' }).addTo(m);
                L.circleMarker([l.lat, l.lng], { radius: 9, color: '#111113', weight: 2, fillColor: '#ff1680', fillOpacity: 1 }).addTo(m);
            }
            $('glDonnerAvis').addEventListener('click', function () {
                if (!connecte()) return versConnexion();
                var f = $('glFormAvis');
                if (mon) {
                    f.titre.value = mon.titre || ''; f.texte.value = mon.texte || ''; f.profil.value = mon.profil || ''; f.visite.value = mon.visite || '';
                    var vals = { note: mon.note, accueil: mon.notes.accueil, ambiance: mon.notes.ambiance, proprete: mon.notes.proprete, prix: mon.notes.prix };
                    Object.keys(vals).forEach(function (k) { var b = f.querySelector('[data-note="' + k + '"] button[data-v="' + vals[k] + '"]'); if (b) b.click(); });
                }
                ouvrir('glFenetreAvis');
            });
            $('glPlanLieu').addEventListener('click', function () { if (!connecte()) return versConnexion(); ouvrir('glFenetrePlan'); });
        } catch (e) {
            if (window.console) console.warn('Guide', e);
            zone.innerHTML = '<div class="gl-vide-bloc"><p>Ce lieu est introuvable ou n\'est pas encore publié.</p><a class="gl-lien" href="guide.html">← Retour au guide</a></div>';
        }
    }
    document.addEventListener('click', async function (e) {
        var u = e.target.closest('[data-utile]'), s = e.target.closest('[data-signaler]'), rp = e.target.closest('[data-reponse]');
        if (!u && !s && !rp) return;
        if (!connecte()) return versConnexion();
        try {
            if (u) { var r = await api('/avis/' + u.getAttribute('data-utile') + '/utile', { method: 'POST' }); u.textContent = 'Utile (' + r.utiles + ')'; }
            if (s) { var m = prompt('Pourquoi signalez-vous cet avis ? (faux avis, attaque personnelle, propos déplacés…)'); if (m === null) return; var r2 = await api('/avis/' + s.getAttribute('data-signaler') + '/signaler', { method: 'POST', body: JSON.stringify({ motif: m }) }); toast(r2.message, 'success'); }
            if (rp) { var t = prompt('Réponse de l\'établissement (laisser vide pour retirer) :'); if (t === null) return; await api('/avis/' + rp.getAttribute('data-reponse') + '/reponse', { method: 'POST', body: JSON.stringify({ texte: t }) }); chargerFiche(); }
        } catch (x) { toast(x.message, 'error'); }
    });

    // ---------- Démarrage ----------
    document.addEventListener('DOMContentLoaded', function () {
        brancherFormulaires();
        if (surFiche) { chargerRegions(); chargerFiche(); return; }
        var p = new URLSearchParams(location.search);
        etat.region = p.get('region') || ''; etat.type = p.get('type') || ''; etat.public = p.get('public') || '';
        document.querySelectorAll('[data-type]').forEach(function (b) {
            b.setAttribute('aria-pressed', String(b.getAttribute('data-type') === etat.type));
            b.addEventListener('click', function () {
                etat.type = b.getAttribute('data-type');
                document.querySelectorAll('[data-type]').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
                charger();
            });
        });
        $('glPublic').value = etat.public;
        $('glPublic').addEventListener('change', function () { etat.public = this.value; charger(); });
        var attente;
        $('glQ').addEventListener('input', function () { clearTimeout(attente); var v = this.value.trim(); attente = setTimeout(function () { etat.q = v; charger(); }, 300); });
        $('glFiltres').addEventListener('submit', function (e) { e.preventDefault(); });
        $('glRegions').addEventListener('click', function (e) {
            var b = e.target.closest('[data-region]'); if (!b) return;
            var s = b.getAttribute('data-region');
            etat.region = etat.region === s ? '' : s;
            charger();
        });
        document.addEventListener('click', function (e) {
            if (e.target.closest('#glProposer, [data-proposer]')) { if (!connecte()) return versConnexion(); remplirRegions(etat.region); ouvrir('glFenetreLieu'); }
            if (e.target.closest('#glAjouterPlan')) { if (!connecte()) return versConnexion(); remplirRegions(etat.region); ouvrir('glFenetrePlan'); }
        });
        chargerRegions();
        chargerModeration();
        // Leaflet est chargé en « defer » : on redessine la carte dès qu'il est prêt
        if (!window.L) window.addEventListener('load', function () { if (!carte) charger(); });
    });
})();
