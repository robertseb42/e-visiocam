// ============================================================
// E-VISIOCAM — quiz de l'animateur dans les salons : boutons, compte à rebours, sons, blind test
// ------------------------------------------------------------
// Les sons et les airs du blind test sont joués par le navigateur (Web Audio) :
// aucun fichier audio, uniquement des airs du domaine public.
// Bouton 🔊 / 🔇 pour couper les sons (choix gardé : « evc-quiz-son »).
//   EvcQuiz.carte(msg)               → élément HTML du quiz (à ajouter dans le fil)
//   EvcQuiz.brancher(socket)         → écoute quiz:resultat et quiz:fin
// ============================================================
(function () {
    var CLE = 'evc-quiz-son';
    var ctx = null;
    function sonActif() { try { return localStorage.getItem(CLE) !== 'off'; } catch (e) { return true; } }
    function audio() {
        if (!sonActif()) return null;
        try {
            if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
            if (ctx.state === 'suspended') ctx.resume();
            return ctx;
        } catch (e) { return null; }
    }
    // Les navigateurs n'autorisent le son qu'après un geste : on « réveille » l'audio au premier clic ou à la première touche
    ['click', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { audio(); }, { once: true, passive: true }); });

    var NOTES = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, B4: 493.88, C5: 523.25, 'D#5': 622.25, D5: 587.33, E5: 659.25, G5: 783.99 };
    function note(a, freq, debut, duree, type, volume) {
        var o = a.createOscillator(), g = a.createGain();
        o.type = type || 'triangle'; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, debut);
        g.gain.exponentialRampToValueAtTime(volume || 0.18, debut + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, debut + duree * 0.95);
        o.connect(g); g.connect(a.destination);
        o.start(debut); o.stop(debut + duree);
    }
    function jouer(seq, tempo, type) {
        var a = audio(); if (!a) return 0;
        var t = a.currentTime + 0.05, n = tempo || 0.32;
        seq.forEach(function (x) {
            var nom = Array.isArray(x) ? x[0] : x, d = (Array.isArray(x) ? x[1] : 1) * n;
            if (nom && NOTES[nom]) note(a, NOTES[nom], t, d, type);
            t += d;
        });
        return t - a.currentTime;
    }

    // Airs du domaine public (début reconnaissable)
    var AIRS = {
        ode: [['E4'], ['E4'], ['F4'], ['G4'], ['G4'], ['F4'], ['E4'], ['D4'], ['C4'], ['C4'], ['D4'], ['E4'], ['E4', 1.5], ['D4', 0.5], ['D4', 2]],
        elise: [['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['D#5', 0.5], ['E5', 0.5], ['B4', 0.5], ['D5', 0.5], ['C5', 0.5], ['A4', 1.5]],
        jacques: [['C4'], ['D4'], ['E4'], ['C4'], ['C4'], ['D4'], ['E4'], ['C4'], ['E4'], ['F4'], ['G4', 2], ['E4'], ['F4'], ['G4', 2]],
        lune: [['C4'], ['C4'], ['C4'], ['D4'], ['E4', 2], ['D4', 2], ['C4'], ['E4'], ['D4'], ['D4'], ['C4', 3]],
        maman: [['C4'], ['C4'], ['G4'], ['G4'], ['A4'], ['A4'], ['G4', 2], ['F4'], ['F4'], ['E4'], ['E4'], ['D4'], ['D4'], ['C4', 2]],
        brahms: [['E4', 0.5], ['E4', 0.5], ['G4', 1.5], ['E4', 0.5], ['E4', 0.5], ['G4', 1.5], ['E4', 0.5], ['G4', 0.5], ['C5', 1], ['B4', 1], ['A4', 1], ['A4', 1], ['G4', 2]]
    };
    var SONS = {
        debut: function () { jouer([['C5', 0.5], ['E5', 0.5], ['G5', 1]], 0.14, 'square'); },
        bon: function () { jouer([['C5', 0.6], ['E5', 0.6], ['G5', 0.6], ['C5', 0.01], ['E5', 1.6]], 0.12, 'triangle'); },
        faux: function () { var a = audio(); if (a) { note(a, 180, a.currentTime + 0.02, 0.35, 'sawtooth', 0.08); note(a, 140, a.currentTime + 0.2, 0.45, 'sawtooth', 0.08); } },
        fin: function () { jouer([['G4', 0.5], ['E4', 0.5], ['C4', 1]], 0.16, 'triangle'); },
        tic: function () { var a = audio(); if (a) note(a, 1200, a.currentTime + 0.01, 0.05, 'square', 0.04); }
    };

    var quiz = {};   // id → { el, fin, minuteur, melodie }
    var esc = function (t) { var d = document.createElement('div'); d.textContent = t == null ? '' : String(t); return d.innerHTML; };

    // ---------- Styles ----------
    var css = document.createElement('style');
    css.textContent = [
        '.evc-quiz{margin-top:10px;display:grid;gap:8px}',
        '.evc-quiz-choix{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
        '@media(max-width:560px){.evc-quiz-choix{grid-template-columns:1fr}}',
        '.evc-quiz-choix button{padding:10px 12px;border-radius:12px;border:1px solid #ffe50066;background:#ffffff0d;color:inherit;font:700 13px Inter,system-ui,sans-serif;cursor:pointer;text-align:left;transition:transform .12s,background .2s,border-color .2s}',
        '.evc-quiz-choix button:hover:not(:disabled){background:#ffe50022;border-color:#ffe500;transform:translateY(-1px)}',
        '.evc-quiz-choix button:disabled{cursor:default}',
        '.evc-quiz-choix button .l{display:inline-flex;width:22px;height:22px;border-radius:7px;background:#ffe500;color:#111113;align-items:center;justify-content:center;font-size:11px;margin-right:8px}',
        '.evc-quiz-choix button.bon{background:#16a34a33;border-color:#22c55e}',
        '.evc-quiz-choix button.faux{background:#e11d4833;border-color:#f43f5e;opacity:.85}',
        '.evc-quiz-choix button.moi{outline:2px solid #ffe500;outline-offset:1px}',
        '.evc-quiz-barre{height:6px;border-radius:99px;background:#ffffff1a;overflow:hidden}',
        '.evc-quiz-barre i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#ffe500,#ff1680);transform-origin:left;transition:transform .25s linear}',
        '.evc-quiz-pied{display:flex;align-items:center;gap:8px;font-size:12px;opacity:.85}',
        '.evc-quiz-pied button{border:1px solid #ffffff33;background:transparent;color:inherit;border-radius:10px;padding:5px 10px;font:700 12px Inter,system-ui,sans-serif;cursor:pointer}',
        '.evc-quiz-pied .eq{display:inline-flex;gap:2px;align-items:flex-end;height:14px}',
        '.evc-quiz-pied .eq i{width:3px;background:#ffe500;border-radius:2px;animation:evcEq .8s ease-in-out infinite}',
        '.evc-quiz-pied .eq i:nth-child(2){animation-delay:.2s}.evc-quiz-pied .eq i:nth-child(3){animation-delay:.4s}',
        '@keyframes evcEq{0%,100%{height:4px}50%{height:14px}}',
        '.evc-quiz-msg{font-size:12px;font-weight:700}',
        '@media (prefers-reduced-motion:reduce){.evc-quiz-pied .eq i{animation:none;height:8px}}'
    ].join('');
    document.head.appendChild(css);

    function carte(msg) {
        var q = msg.quiz, d = document.createElement('div');
        d.className = 'evc-quiz';
        d.innerHTML =
            '<div class="evc-quiz-choix">' + q.choix.map(function (c, i) { return '<button type="button" data-i="' + i + '"><span class="l">' + 'ABCD'[i] + '</span>' + esc(c) + '</button>'; }).join('') + '</div>' +
            '<div class="evc-quiz-barre" aria-hidden="true"><i></i></div>' +
            '<div class="evc-quiz-pied">' + (q.melodie ? '<button type="button" data-ecouter>▶ Écouter l’air</button><span class="eq" hidden><i></i><i></i><i></i></span>' : '') +
            '<span class="evc-quiz-msg" aria-live="polite"></span><span style="margin-left:auto" data-reste></span>' +
            '<button type="button" data-son title="Couper / remettre le son">' + (sonActif() ? '🔊' : '🔇') + '</button></div>';
        var etat = { el: d, fin: q.fin, melodie: q.melodie, fini: false };
        quiz[q.id] = etat;
        var barre = d.querySelector('.evc-quiz-barre i'), reste = d.querySelector('[data-reste]');
        var total = Math.max(1000, q.fin - Date.now());
        function maj() {
            var r = Math.max(0, q.fin - Date.now());
            barre.style.transform = 'scaleX(' + (r / total) + ')';
            reste.textContent = etat.fini ? '' : Math.ceil(r / 1000) + ' s';
            if (!etat.fini && r > 0 && r <= 5000 && Math.ceil(r / 1000) !== etat.dernierTic) { etat.dernierTic = Math.ceil(r / 1000); SONS.tic(); }
            if (r <= 0 || etat.fini) { clearInterval(etat.minuteur); d.querySelectorAll('.evc-quiz-choix button').forEach(function (b) { b.disabled = true; }); }
        }
        etat.minuteur = setInterval(maj, 250); maj();
        d.addEventListener('click', function (e) {
            var b = e.target.closest('button'); if (!b) return;
            if (b.hasAttribute('data-son')) {
                var on = !sonActif();
                try { localStorage.setItem(CLE, on ? 'on' : 'off'); } catch (er) {}
                document.querySelectorAll('.evc-quiz [data-son]').forEach(function (x) { x.textContent = on ? '🔊' : '🔇'; });
                if (on) SONS.debut();
                return;
            }
            if (b.hasAttribute('data-ecouter')) return ecouter(etat);
            if (b.dataset.i !== undefined && !b.disabled && !etat.repondu) {
                etat.repondu = true;
                b.classList.add('moi');
                d.querySelectorAll('.evc-quiz-choix button').forEach(function (x) { x.disabled = true; });
                if (window.EvcQuiz._socket) window.EvcQuiz._socket.emit('quiz:repondre', { id: q.id, choix: Number(b.dataset.i) });
            }
        });
        // Arrivée du quiz : petit jingle, puis l'air pour le blind test
        if (Date.now() < q.fin - 2000) {
            SONS.debut();
            if (q.melodie) setTimeout(function () { ecouter(etat); }, 700);
        }
        return d;
    }

    function ecouter(etat) {
        var air = AIRS[etat.melodie]; if (!air) return;
        var duree = jouer(air, etat.melodie === 'elise' ? 0.36 : 0.34, 'triangle');
        var eq = etat.el.querySelector('.eq');
        if (!duree) { var m = etat.el.querySelector('.evc-quiz-msg'); m.textContent = 'Son coupé : cliquez sur 🔇 pour l’activer.'; return; }
        if (eq) { eq.hidden = false; setTimeout(function () { eq.hidden = true; }, duree * 1000); }
    }

    function brancher(socket) {
        window.EvcQuiz._socket = socket;
        socket.on('quiz:resultat', function (r) {
            var etat = quiz[r && r.id]; if (!etat) return;
            var m = etat.el.querySelector('.evc-quiz-msg');
            if (r.deja) { m.textContent = 'Vous avez déjà répondu.'; return; }
            var b = etat.el.querySelector('[data-i="' + r.choix + '"]');
            if (r.ok) { if (b) b.classList.add('bon'); m.textContent = '✅ Bonne réponse !'; SONS.bon(); }
            else { if (b) b.classList.add('faux'); m.textContent = '❌ Raté… attendez la réponse !'; SONS.faux(); }
        });
        socket.on('quiz:fin', function (f) {
            var etat = quiz[f && f.id]; if (!etat || etat.fini) return;
            etat.fini = true;
            var bons = etat.el.querySelector('[data-i="' + f.bonne + '"]');
            if (bons) bons.classList.add('bon');
            etat.el.querySelectorAll('.evc-quiz-choix button').forEach(function (x) { x.disabled = true; });
            var m = etat.el.querySelector('.evc-quiz-msg');
            if (!m.textContent || !/Bonne/.test(m.textContent)) m.textContent = f.gagnant ? '🏆 Gagné par ' + f.gagnant : '⏱️ Temps écoulé';
            if (!/Bonne/.test(m.textContent)) SONS.fin();
        });
    }

    window.EvcQuiz = { carte: carte, brancher: brancher, sons: SONS, _socket: null };
})();
