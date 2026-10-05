// ============================================================
// PASSAGE AU TOUT GRATUIT — remise à zéro unique des soldes de crédits
// ------------------------------------------------------------
// Les soldes existants venaient d'achats en simulation (aucun paiement réel).
// Au premier démarrage de cette version, chaque solde est remis à zéro, avec une ligne
// « reset » dans l'historique du membre. Ne s'exécute qu'une seule fois (réglage du site).
// ============================================================
const database = require('./database');
const CLE = 'credits_reset_gratuit';

function remettreAZero() {
    const { db } = database;
    if (database.getSetting(CLE)) return 0;
    let n = 0;
    db.transaction(() => {
        const soldes = db.prepare('SELECT user_id, balance FROM credits_balance WHERE balance <> 0').all();
        const ins = db.prepare(`INSERT INTO credits_transactions (user_id, type, amount, description, metadata) VALUES (?, 'reset', ?, ?, ?)`);
        soldes.forEach(s => {
            ins.run(s.user_id, -s.balance, 'Remise à zéro : E-VISIOCAM devient entièrement gratuit', JSON.stringify({ ancienSolde: s.balance }));
            n++;
        });
        db.prepare('UPDATE credits_balance SET balance = 0, total_purchased = 0, total_spent = 0, updated_at = CURRENT_TIMESTAMP').run();
        database.setSetting(CLE, new Date().toISOString());
    })();
    try { database.addLog('CREDITS_RESET', 'Passage au gratuit : ' + n + ' solde(s) de crédits remis à zéro', null); } catch (e) {}
    console.log('🎁 Passage au gratuit : ' + n + ' solde(s) de crédits remis à zéro');
    return n;
}

module.exports = { remettreAZero, CLE };
