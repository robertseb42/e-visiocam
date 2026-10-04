// ============================================================
// FILTRE AUTOMATIQUE DES MOTS INTERDITS (table banned_words)
// ------------------------------------------------------------
// Gravité du mot (réglée dans Modération → Mots interdits) :
//   1-2 : le mot est masqué (★★★) et le message part quand même
//   3   : le message est bloqué et signalé à la modération
//   4-5 : bloqué, signalé, et l'auteur devient muet automatiquement (10 min par défaut,
//         variable AUTO_MUTE_MINUTES)
// La recherche ignore majuscules, accents, chiffres déguisés (c0nn4rd), lettres répétées
// (connaaard) et lettres séparées (c.o.n.n.a.r.d), sans toucher aux mots qui ne font que
// contenir un mot interdit (« charme » ne déclenche pas « arme »).
// ============================================================
const database = require('./database');

const AUTO_MUTE_MINUTES = Math.max(1, parseInt(process.env.AUTO_MUTE_MINUTES || '10', 10) || 10);
let cache = null;

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '€': 'e', '!': 'i' };
function normaliser(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[013457@$€!]/g, c => LEET[c] || c)
        .replace(/(.)\1{2,}/g, '$1$1');           // « connaaaard » → « connaard »
}
const compacter = t => t.replace(/(.)\1+/g, '$1');   // « connard » → « conard » (comparaison souple)

function mots() {
    if (!cache) {
        cache = database.getBannedWords().map(w => {
            const n = normaliser(w.word).replace(/[^a-z0-9 ]/g, '').trim();
            return { mot: w.word, n, c: compacter(n), gravite: Math.min(5, Math.max(1, w.severity || 1)) };
        }).filter(w => w.n.length >= 2);
    }
    return cache;
}
function invalider() { cache = null; }

// Variantes acceptées d'un mot : pluriel (s, x) ; féminin (e, es) seulement pour les mots de 5 lettres et plus
// (sinon « arme » attraperait « armée »)
const variante = (tok, w) => tok === w || tok === w + 's' || tok === w + 'x' ||
    (w.length >= 5 && (tok === w + 'e' || tok === w + 'es'));
// Comparaison sans lettres doublées (« conard ») : mots de 5 lettres et plus seulement
const souple = (tok, w) => w.n.length >= 5 && variante(compacter(tok), w.c);

function analyser(texte) {
    const liste = mots();
    const resultat = { texte, gravite: 0, trouves: [] };
    if (!liste.length || !texte) return resultat;

    // Découpage en mots, en gardant la position d'origine pour pouvoir masquer
    const morceaux = [];
    const re = /[\p{L}\p{N}@$€]+/gu;
    let m;
    while ((m = re.exec(texte))) morceaux.push({ debut: m.index, fin: m.index + m[0].length, n: normaliser(m[0]) });

    const aMasquer = [];
    const noter = (w, debut, fin) => {
        resultat.gravite = Math.max(resultat.gravite, w.gravite);
        if (!resultat.trouves.includes(w.mot)) resultat.trouves.push(w.mot);
        aMasquer.push([debut, fin]);
    };

    liste.forEach(w => {
        const nbMots = w.n.split(' ').length;
        if (nbMots > 1) {                                  // expression de plusieurs mots
            for (let i = 0; i + nbMots <= morceaux.length; i++) {
                const bloc = morceaux.slice(i, i + nbMots).map(x => x.n).join(' ');
                if (bloc === w.n) noter(w, morceaux[i].debut, morceaux[i + nbMots - 1].fin);
            }
            return;
        }
        morceaux.forEach(x => { if (variante(x.n, w.n) || souple(x.n, w)) noter(w, x.debut, x.fin); });
        // Lettres séparées : « c o n n a r d », « c.o.n.n.a.r.d », « f.d.p »
        // (morceaux de 1-2 lettres pour les mots de 4 lettres et plus ; lettre par lettre pour les mots de 3)
        if (w.n.length >= 3) {
            const court = w.n.length >= 4 ? 2 : 1;
            for (let i = 0; i < morceaux.length; i++) {
                if (morceaux[i].n.length > court) continue;
                let j = i, colle = '';
                while (j < morceaux.length && morceaux[j].n.length <= court && colle.length < w.n.length + 2) {
                    colle += morceaux[j].n;
                    if (j > i && (variante(colle, w.n) || souple(colle, w))) { noter(w, morceaux[i].debut, morceaux[j].fin); break; }
                    j++;
                }
            }
        }
    });

    if (aMasquer.length) {
        let t = texte;
        aMasquer.sort((a, b) => b[0] - a[0]).forEach(([d, f]) => { t = t.slice(0, d) + '★'.repeat(Math.max(3, Math.min(8, f - d))) + t.slice(f); });
        resultat.texte = t;
    }
    return resultat;
}

// Décision pour un message : { ok, texte } ou { ok:false, message } (+ signalement / sourdine automatique)
function controler(user, texte, lieu) {
    const r = analyser(texte);
    if (!r.gravite) return { ok: true, texte };
    if (r.gravite <= 2) return { ok: true, texte: r.texte, masque: true };

    try {
        database.flagMessage(0, user.id, 'Mot interdit (' + r.trouves.join(', ') + ') — ' + lieu + ' : ' + String(texte).slice(0, 300), 1);
        database.addLog('AUTO_FILTER', 'Message de ' + user.username + ' bloqué (' + lieu + ', mot interdit : ' + r.trouves.join(', ') + ')', null, user.id);
    } catch (e) {}

    if (r.gravite >= 4) {
        try { require('./sanctions').appliquer({ cible: user, auteur: null, type: 'mute', minutes: AUTO_MUTE_MINUTES, raison: 'Mot interdit : ' + r.trouves.join(', ') }); } catch (e) {}
        return { ok: false, message: 'Message bloqué : il contient un mot interdit. Vous ne pouvez plus écrire pendant ' + AUTO_MUTE_MINUTES + ' minutes.' };
    }
    return { ok: false, message: 'Message bloqué : il contient un mot interdit par le règlement du site.' };
}

module.exports = { analyser, controler, invalider, normaliser, AUTO_MUTE_MINUTES };
