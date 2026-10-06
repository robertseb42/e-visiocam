// ============================================================
// E-VISIOCAM - Actions déclarées dans le HTML, sans code inline
// ------------------------------------------------------------
// Remplace les onclick="…", onsubmit="…", oninput="…", onchange="…" que la CSP stricte
// (sans 'unsafe-inline') bloque. Dans le HTML :
//
//   <button data-click="showTab" data-click-args='["users", "$this"]'>
//   <form data-submit="sendMessage" data-submit-args='["$event"]'>
//   <input data-input="setVolume" data-input-args='["$value"]'>
//
// data-<événement>          nom de la fonction globale à appeler
// data-<événement>-args     (facultatif) arguments en JSON ; jetons spéciaux :
//                           "$this" = l'élément, "$event" = l'événement, "$value" = this.value
// data-<événement>-prevent  (facultatif) annule l'action par défaut (équivaut à « return false »)
// data-<événement>-stop     (facultatif) arrête la propagation (équivaut à event.stopPropagation())
//
// À charger dans le <head>, sans defer : chaque élément est branché dès que le navigateur le
// lit, et le contenu ajouté plus tard (innerHTML…) est branché automatiquement.
//
// Sécurité : seules les fonctions de la liste AUTORISEES peuvent être appelées. Sans cette liste,
// un pirate capable d'injecter du HTML (sans script) pourrait déclencher n'importe quelle fonction
// globale du site en ajoutant un data-click. Toute nouvelle fonction doit être ajoutée ici.
// ============================================================
(function () {
    'use strict';

    var AUTORISEES = new Set([
        // Barre de navigation, menu mobile, radio (plusieurs pages)
        'ouvrirNotifications', 'toggleMobileSidebar', 'goLive',
        'togglePlay', 'setVolume', 'prevRadio', 'nextRadio',
        // Connexion, inscription, mot de passe
        'togglePassword', 'checkStrength',
        // Mon compte, récompenses, tableau de bord
        'saveProfile', 'changePassword', 'deleteAccount', 'loadTransactions', 'toggleLive',
        // Messagerie privée
        'openNewConvModal', 'closeNewConvModal', 'deleteCurrentConversation', 'closeConversation', 'sendMessage',
        // Live (caméras)
        'startCamera', 'stopCamera', 'startBroadcast', 'stopBroadcast', 'toggleMyCamera', 'toggleMyMic',
        'remplirMur', 'viderMur', 'refreshStreams',
        // Salon de chat
        'ouvrirVolet', 'fermerVolet', 'ouvrirLivePrive', 'toggleCameraView', 'sendReaction',
        'openGiftModal', 'closeGiftModal', 'confirmSendGift', 'openReportModal', 'closeReportModal', 'submitReport',
        'fermerPrive', 'fermerCadenas',
        // Modération
        'showTab', 'filterReports', 'loadReports', 'loadAllStreams', 'stopWatching', 'addWord', 'testerFiltre',
        'offrirA', 'loadUsers', 'loadViewLogs',
        // Administration
        'toggleMaintenance', 'lancerSauvegarde', 'telechargerSauvegarde', 'chargerStats', 'exporterStats',
        'handlePromoteMod', 'chargerRecompenses', 'offrirCredits', 'enregistrerAnimateur', 'enregistrerRecompenses',
        'remettreDefautRecompenses', 'openRadioModal', 'closeRadioModal', 'saveRadio', 'setContactBox',
        'loadContactMessages', 'closeModal', 'copyTempPassword'
    ]);

    var EVENEMENTS = ['click', 'submit', 'input', 'change'];
    var SELECTEUR = EVENEMENTS.map(function (t) { return '[data-' + t + ']'; }).join(',');
    var branches = new WeakMap();   // élément -> types déjà branchés

    function resoudre(arg, el, e) {
        if (arg === '$this') return el;
        if (arg === '$event') return e;
        if (arg === '$value') return el.value;
        return arg;
    }

    function executer(el, type, e) {
        var nom = el.getAttribute('data-' + type);
        if (!nom) return;   // attribut retiré depuis le branchement
        if (!AUTORISEES.has(nom)) {
            console.error('[actions] fonction non autorisée : ' + nom);
            return;
        }
        var fn = window[nom];
        if (typeof fn !== 'function') {
            console.error('[actions] fonction introuvable : ' + nom);
            return;
        }
        var args = [];
        var brut = el.getAttribute('data-' + type + '-args');
        if (brut) {
            try { args = JSON.parse(brut); } catch (err) {
                console.error('[actions] arguments invalides pour ' + nom + ' : ' + brut);
                return;
            }
        }
        if (el.hasAttribute('data-' + type + '-prevent')) e.preventDefault();
        if (el.hasAttribute('data-' + type + '-stop')) e.stopPropagation();
        fn.apply(el, args.map(function (a) { return resoudre(a, el, e); }));
    }

    function brancher(el) {
        var faits = branches.get(el);
        if (!faits) { faits = {}; branches.set(el, faits); }
        EVENEMENTS.forEach(function (type) {
            if (faits[type] || !el.hasAttribute('data-' + type)) return;
            faits[type] = true;
            el.addEventListener(type, function (e) { executer(el, type, e); });
        });
    }

    function parcourir(racine) {
        if (racine.nodeType !== 1) return;
        if (racine.matches(SELECTEUR)) brancher(racine);
        racine.querySelectorAll(SELECTEUR).forEach(brancher);
    }

    // Observe tout le document, y compris pendant que le navigateur le lit.
    new MutationObserver(function (mutations) {
        mutations.forEach(function (m) {
            if (m.type === 'attributes') brancher(m.target);
            else m.addedNodes.forEach(parcourir);
        });
    }).observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: EVENEMENTS.map(function (t) { return 'data-' + t; })
    });
    parcourir(document.documentElement);
})();
