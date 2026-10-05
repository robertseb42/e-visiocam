// ============================================================
// E-VISIOCAM — « MA CAM » DEPUIS UN SALON
// ------------------------------------------------------------
// Permet d'allumer sa caméra sans quitter le salon (ex. un modérateur demande
// une vérification d'identité), puis, si on veut, de diffuser dans le salon.
// S'appuie sur la caméra persistante (window.top.EvcCamSession) : la caméra
// reste allumée en changeant de page. Sans l'appli (page ouverte seule) : renvoie vers live.html.
// ============================================================
(function () {
    'use strict';
    if (window.EvcMaCam) return;

    function session() {
        try { return (window.top !== window && window.top.EvcCamSession) || null; } catch (e) { return null; }
    }
    function toast(msg, type) { if (typeof showToast === 'function') showToast(msg, type || 'success'); }

    function styles() {
        if (document.getElementById('maCamCss')) return;
        var css = document.createElement('style');
        css.id = 'maCamCss';
        css.textContent = [
            '#maCamPanneau{position:fixed;inset:0;z-index:9000;background:#0008;display:flex;align-items:flex-end;justify-content:center;font-family:Inter,system-ui,sans-serif}',
            '@media (min-width:640px){#maCamPanneau{align-items:center}}',
            '#maCamPanneau .carte{width:100%;max-width:420px;background:#1c1c20;color:#f5f5f6;border:1px solid #ff1680;border-radius:18px 18px 0 0;padding:16px 16px calc(16px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px #0009}',
            '@media (min-width:640px){#maCamPanneau .carte{border-radius:18px}}',
            'html[data-theme="light"] #maCamPanneau .carte{background:#fff;color:#172039}',
            '#maCamPanneau .haut{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
            '#maCamPanneau h2{font-size:16px;font-weight:800;margin:0}',
            '#maCamPanneau .x{background:none;border:0;color:inherit;font-size:22px;line-height:1;cursor:pointer;opacity:.7;padding:4px 8px}',
            '#maCamPanneau .ecran{position:relative;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;margin-bottom:10px}',
            '#maCamPanneau video{width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}',
            '#maCamPanneau .vide{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#8b8b95;font-size:13px;text-align:center;padding:10px}',
            '#maCamPanneau .pastille{position:absolute;top:8px;left:8px;background:#ef4444;color:#fff;font-size:10px;font-weight:800;padding:3px 7px;border-radius:6px}',
            '#maCamPanneau .info{font-size:12.5px;line-height:1.5;opacity:.8;margin:0 0 12px}',
            '#maCamPanneau .boutons{display:grid;gap:8px}',
            '#maCamPanneau .ligne{display:grid;grid-template-columns:1fr 1fr;gap:8px}',
            '#maCamPanneau button.b{border:0;border-radius:11px;padding:12px;font:700 14px Inter,system-ui,sans-serif;cursor:pointer;color:#fff;background:#e91e63}',
            '#maCamPanneau button.b[disabled]{opacity:.5;cursor:wait}',
            '#maCamPanneau button.live{background:linear-gradient(90deg,#ef4444,#e11d48)}',
            '#maCamPanneau button.gris{background:#ffffff14;color:inherit}',
            'html[data-theme="light"] #maCamPanneau button.gris{background:#eef1f6}',
            '#maCamPanneau a.plus{display:block;text-align:center;font-size:12.5px;color:#ff4d9a;margin-top:10px;text-decoration:none;font-weight:600}',
            '#maCamBtn .point{display:none;width:7px;height:7px;border-radius:50%;background:#ef4444;margin-left:2px}',
            '#maCamBtn.actif .point{display:inline-block}'
        ].join('\n');
        document.head.appendChild(css);
    }

    function fermer() { var el = document.getElementById('maCamPanneau'); if (el) el.remove(); }

    function dessiner() {
        var el = document.getElementById('maCamPanneau');
        var S = session();
        if (!el || !S) return;
        var e = S.getState();
        var html = '<div class="carte" role="dialog" aria-modal="true" aria-label="Ma caméra">'
            + '<div class="haut"><h2>📷 Ma caméra</h2><button class="x" data-fermer aria-label="Fermer">×</button></div>'
            + '<div class="ecran"><video autoplay muted playsinline></video>'
            + (e.active ? '' : '<div class="vide">Caméra éteinte</div>')
            + (e.broadcasting ? '<div class="pastille">● EN DIRECT</div>' : '') + '</div>';

        if (!e.active) {
            html += '<p class="info">Une fois allumée, ta caméra est visible par l\'équipe de modération (par exemple pour une vérification d\'identité). Les autres membres ne la voient que si tu diffuses.</p>'
                + '<div class="boutons"><button class="b" data-allumer>Activer ma caméra</button></div>';
        } else if (!e.broadcasting) {
            html += '<p class="info">Ta caméra est allumée et visible par l\'équipe de modération. Les membres du salon ne la voient pas encore.</p>'
                + '<div class="boutons"><button class="b live" data-diffuser>🔴 Diffuser dans le salon</button>'
                + '<button class="b gris" data-couper>Couper ma caméra</button></div>';
        } else {
            html += '<p class="info">Tu es en direct : les membres te voient.</p>'
                + '<div class="boutons"><div class="ligne">'
                + '<button class="b gris" data-masquer>' + (e.cameraOff ? '👁️ Afficher cam' : '🙈 Masquer cam') + '</button>'
                + '<button class="b gris" data-micro>' + (e.micMuted ? '🎤 Activer micro' : '🔇 Couper micro') + '</button></div>'
                + '<button class="b gris" data-arreter>Arrêter la diffusion</button>'
                + '<button class="b gris" data-couper>Couper ma caméra</button></div>';
        }
        html += '<a class="plus" href="live.html">Plus d\'options (live privé, regarder d\'autres lives) →</a></div>';
        el.innerHTML = html;

        var v = el.querySelector('video');
        if (e.stream) {
            try { v.srcObject = new MediaStream(e.stream.getVideoTracks()); } catch (er) { v.srcObject = e.stream; }
            v.play().catch(function () {});
        }
        function sur(attr, fn) { var b = el.querySelector('[' + attr + ']'); if (b) b.onclick = fn; }
        sur('data-fermer', fermer);
        sur('data-allumer', async function () {
            this.disabled = true; this.textContent = 'Activation…';
            try { await S.start(); toast('Caméra activée'); }
            catch (er) { if (!er.evcGere && er.name !== 'Annule') toast('Impossible d\'activer la caméra', 'error'); }
            dessiner();
        });
        sur('data-diffuser', async function () {
            this.disabled = true; this.textContent = 'Lancement…';
            try { await S.startBroadcast({ private: false }); toast('Tu es en direct dans le salon'); }
            catch (er) { toast(er.message || 'Diffusion impossible', 'error'); }
            dessiner();
        });
        sur('data-arreter', function () { S.stopBroadcast(); dessiner(); });
        sur('data-couper', function () { S.stop(); dessiner(); });
        sur('data-masquer', function () { S.toggleCamera(); dessiner(); });
        sur('data-micro', function () { S.toggleMic(); dessiner(); });
    }

    function ouvrir() {
        if (!session()) { location.href = 'live.html'; return; }   // page ouverte hors de l'appli
        styles();
        fermer();
        var el = document.createElement('div');
        el.id = 'maCamPanneau';
        el.addEventListener('click', function (ev) { if (ev.target === el) fermer(); });
        document.body.appendChild(el);
        dessiner();
    }

    function majBouton() {
        var b = document.getElementById('maCamBtn');
        var S = session();
        if (!b || !S) return;
        var e = S.getState();
        b.classList.toggle('actif', !!e.active);
        b.title = e.broadcasting ? 'Ma caméra : en direct' : e.active ? 'Ma caméra : allumée' : 'Allumer ma caméra';
    }

    // La caméra change (ici, sur une autre page, ou récupérée après mise en veille)
    window.addEventListener('evc:cam', function (ev) {
        if (!ev.detail || ev.detail.type !== 'state') return;
        majBouton();
        if (document.getElementById('maCamPanneau')) dessiner();
    });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') fermer(); });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { styles(); majBouton(); });
    else { styles(); majBouton(); }

    window.EvcMaCam = { ouvrir: ouvrir, fermer: fermer };
})();
