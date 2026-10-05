// ============================================================
// MOTS INTERDITS TIRÉS DES CGU — ajoutés une seule fois à la liste existante
// ------------------------------------------------------------
// Chaque groupe correspond à une règle des CGU (articles 2, 3, 5 et 6).
// Gravité : 2 = masqué ; 3 = message bloqué et envoyé à la modération ;
//           4-5 = bloqué, envoyé à la modération et auteur muet 10 minutes.
// Les mots déjà présents ne sont pas modifiés. Le Super Admin peut ensuite retirer
// ou régler chaque mot dans Modération → Mots interdits ; un mot retiré n'est pas remis.
// ============================================================
const database = require('./database');
const CLE = 'banned_words_cgu_v1';

const LISTE = [
    // Art. 3 et 6 — mineurs : déclaration d'âge et exploitation (le plus grave)
    ...[12, 13, 14, 15, 16, 17].flatMap(n => [['j ai ' + n + ' ans', 5], ['jai ' + n + ' ans', 5]]),
    ['je suis mineur', 5], ['je suis mineure', 5], ['suis mineure', 5], ['pas encore majeur', 5], ['pas encore majeure', 5],
    ['pedophile', 5], ['pedophilie', 5], ['pedopornographie', 5], ['pedoporno', 5], ['pedo', 5],
    ['lolicon', 5], ['shotacon', 5], ['jailbait', 5], ['preteen', 5],

    // Art. 6 — violences sexuelles, zoophilie, inceste, contenus intimes non consentis
    ['zoophilie', 5], ['zoophile', 5], ['bestialite', 5],
    ['inceste', 3], ['revenge porn', 4], ['sextape volee', 4], ['photos volees', 4],
    ['je t enregistre', 3], ['je vais t enregistrer', 3], ['je vais te filmer', 3], ['capture de ta cam', 3],

    // Art. 6 — menaces et incitation à se faire du mal
    ['je vais te tuer', 5], ['je vais te retrouver', 4], ['je sais ou tu habites', 4],
    ['suicide toi', 5], ['va te suicider', 5], ['va te pendre', 5], ['tue toi', 5],

    // Art. 6 — injures discriminatoires et haine (bloquées, auteur muet)
    ['bougnoule', 4], ['bicot', 4], ['negre', 4], ['negro', 4], ['youpin', 4], ['youtre', 4],
    ['sale arabe', 4], ['sale noir', 4], ['sale juif', 4], ['sale musulman', 4], ['sale blanc', 4],
    ['sale pd', 4], ['sale gouine', 4], ['tarlouze', 4], ['tapette', 2], ['pd', 3], ['gouine', 3],

    // Art. 2 et 6 — argent, paiements et prostitution (interdits sur le site)
    ['paypal', 3], ['iban', 3], ['mon rib', 3], ['western union', 3], ['moneygram', 3],
    ['neosurf', 3], ['transcash', 3], ['paysafecard', 3], ['carte pcs', 3], ['coupon pcs', 3],
    ['bitcoin', 3], ['usdt', 3], ['crypto wallet', 3],
    ['onlyfans', 3], ['mym fans', 3], ['escort', 3], ['escorte', 3],
    ['plan payant', 3], ['rdv payant', 3], ['contre paiement', 3], ['contre argent', 3], ['mes tarifs', 3], ['tarif la passe', 3],

    // Art. 6 — escroquerie et hameçonnage
    ['envoie moi le code', 3], ['donne moi le code', 3], ['donne moi ton mot de passe', 4],

    // Art. 5 — injures courantes (masquées)
    ['pute', 2], ['batard', 2], ['encule', 2], ['ntm', 2], ['nique ta mere', 3], ['ta gueule', 2], ['abruti', 2], ['salaud', 2]
];

function appliquer() {
    try {
        if (database.getSetting && database.getSetting(CLE)) return 0;
        const sansAccent = t => String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const deja = new Set(database.getBannedWords().map(w => sansAccent(w.word)));
        let n = 0;
        LISTE.forEach(([mot, gravite]) => {
            if (deja.has(sansAccent(mot))) return;
            try { database.addBannedWord(mot, gravite); n++; } catch (e) {}
        });
        if (database.setSetting) database.setSetting(CLE, new Date().toISOString());
        try { require('./filtre-mots').invalider(); } catch (e) {}
        if (n) console.log('🚫 Mots interdits des CGU ajoutés : ' + n);
        return n;
    } catch (e) { console.error('Mots des CGU :', e.message); return 0; }
}

module.exports = { appliquer, LISTE };
