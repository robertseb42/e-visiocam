// ============================================================
// WIDGET RADIO FLOTTANT — PLATINE E-VISIOCAM
// Même esthétique que la platine de l'accueil, sur les pages qui
// n'ont pas de sidebar (En direct, Modèles, Salons, Messages…).
// S'injecte automatiquement si aucune platine n'est visible.
// ============================================================

(function() {
    // Éviter les doubles injections
    if (document.getElementById('radioWidgetFloating')) return;

    // Ne pas injecter si la platine est déjà VISIBLE dans la sidebar.
    // Si elle existe mais qu'elle est masquée (sidebar cachée sous 1024px), on la
    // retire du DOM pour éviter des identifiants en double et on prend le relais.
    var inlineWidget = document.getElementById('radioWidget');
    if (inlineWidget && inlineWidget.offsetParent !== null) {
        console.log('📻 Widget radio déjà visible dans la sidebar');
        return;
    }
    if (inlineWidget && inlineWidget.parentNode) {
        console.log('📻 Platine masquée sur cet écran : widget flottant en secours');
        inlineWidget.parentNode.removeChild(inlineWidget);
        // Retour à une fenêtre large : on recharge pour retrouver la platine.
        var mq = window.matchMedia('(min-width: 1024px)');
        var onBreakpoint = function(e) { if (e.matches) window.location.reload(); };
        if (mq.addEventListener) mq.addEventListener('change', onBreakpoint);
        else if (mq.addListener) mq.addListener(onBreakpoint);
    }

    // ---------- CRÉER LA PLATINE ----------
    var widget = document.createElement('div');
    widget.id = 'radioWidgetFloating';
    widget.innerHTML = `
        <!-- Version réduite : pastille discrète -->
        <div id="radioWidgetMinimized" class="hidden items-center gap-2 bg-white/95 backdrop-blur-md rounded-full px-4 py-2 shadow-xl border border-pink-200/60 cursor-pointer hover:shadow-2xl transition-all">
            <span class="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
            <i class="fa-solid fa-radio text-brand-primary"></i>
            <span id="radioMiniName" class="text-xs font-bold text-slate-800 max-w-[100px] truncate">Radio</span>
            <button onclick="event.stopPropagation(); togglePlay()" aria-label="Lecture / pause" class="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center">
                <i class="fa-solid fa-play text-xs" id="radioMiniPlayIcon"></i>
            </button>
        </div>

        <!-- Platine radio (même look que l'accueil ; styles dans style.css) -->
        <div id="radioWidgetExpanded" class="evc-deck evc-deck--compact">
            <div class="evc-deck-head">
                <span class="evc-deck-brand"><i></i>E-VISIOCAM <b>RADIO</b></span>
                <span class="evc-deck-tag"><i></i>LIVE
                    <button type="button" onclick="minimizeRadioWidget()" aria-label="Réduire la radio" title="Réduire"><i class="fa-solid fa-chevron-down"></i></button>
                </span>
            </div>

            <div class="evc-deck-platter">
                <div id="radioVinyl" class="evc-deck-vinyl">
                    <div class="evc-deck-label"><i class="fa-solid fa-music"></i></div>
                    <div class="evc-deck-spindle"></div>
                </div>
                <div id="radioTonearm" class="evc-deck-arm"><span class="evc-deck-weight"></span><span class="evc-deck-headshell"></span></div>
                <span class="evc-deck-adapter"></span>
                <span class="evc-deck-onair"><i></i>ON AIR</span>
                <!-- Zone utilisée par radio-widget.js pour les messages d'état -->
                <div id="radioFrame" style="display: none;"></div>
            </div>

            <div id="radioAudioControls" class="evc-deck-controls">
                <div class="evc-deck-row">
                    <button id="radioPlayBtn" type="button" onclick="togglePlay()" class="evc-deck-play" aria-label="Lecture / pause"><i class="fa-solid fa-play"></i></button>
                    <button type="button" onclick="prevRadio()" class="evc-deck-btn" aria-label="Radio précédente"><i class="fa-solid fa-backward-step"></i></button>
                    <button type="button" onclick="nextRadio()" class="evc-deck-btn" aria-label="Radio suivante"><i class="fa-solid fa-forward-step"></i></button>
                    <input type="range" min="0" max="1" step="0.05" value="0.6" oninput="setVolume(this.value)" class="evc-deck-volume" aria-label="Volume">
                </div>
                <div class="evc-deck-row">
                    <div class="evc-deck-speed" aria-hidden="true"><span>33</span><span>45</span></div>
                    <span class="evc-deck-status"><i></i><span id="radioStatus">PRÊT</span></span>
                </div>
                <p class="evc-deck-display" id="radioNowPlaying">---</p>
            </div>
        </div>
    `;

    // Style du conteneur
    widget.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';

    document.body.appendChild(widget);

    // Rotation du disque (mêmes règles que l'accueil)
    if (!document.getElementById('styleVinylSpin')) {
        var style = document.createElement('style');
        style.id = 'styleVinylSpin';
        style.textContent = '@keyframes vinylSpin{from{transform:rotate(0)}to{transform:rotate(360deg)}}'
            + '#radioVinyl.spinning{animation:vinylSpin 3s linear infinite}'
            + '#radioTonearm{transition:transform 1.2s ease}';
        document.head.appendChild(style);
    }

    // ---------- RÉDUIRE / AGRANDIR ----------
    // Réduite par défaut : la platine en grand ne masque plus la page.
    // Le choix est mémorisé pour les pages suivantes.
    function memoireOuverte(valeur) {
        try { localStorage.setItem('evcRadioOuvert', valeur ? '1' : '0'); } catch (e) {}
    }

    window.minimizeRadioWidget = function() {
        document.getElementById('radioWidgetExpanded').classList.add('hidden');
        document.getElementById('radioWidgetMinimized').classList.remove('hidden');
        document.getElementById('radioWidgetMinimized').classList.add('flex');
        memoireOuverte(false);
    };

    window.expandRadioWidget = function() {
        document.getElementById('radioWidgetMinimized').classList.add('hidden');
        document.getElementById('radioWidgetMinimized').classList.remove('flex');
        document.getElementById('radioWidgetExpanded').classList.remove('hidden');
        memoireOuverte(true);
    };

    var ouverte = false;
    try { ouverte = localStorage.getItem('evcRadioOuvert') === '1'; } catch (e) {}
    if (ouverte) window.expandRadioWidget(); else window.minimizeRadioWidget();

    // Clic sur la version réduite → rouvrir
    document.getElementById('radioWidgetMinimized').onclick = function() {
        window.expandRadioWidget();
    };

    // ---------- SYNCHRONISER L'ICÔNE MINI AVEC L'ÉTAT PLAY ----------
    var origUpdatePlayBtn = window.updatePlayBtn;
    window.updatePlayBtn = function(isPlaying) {
        if (origUpdatePlayBtn) origUpdatePlayBtn(isPlaying);
        var miniIcon = document.getElementById('radioMiniPlayIcon');
        if (miniIcon) {
            miniIcon.className = isPlaying
                ? 'fa-solid fa-pause text-xs'
                : 'fa-solid fa-play text-xs';
        }
    };

    // Synchroniser le nom de la station
    setInterval(function() {
        var mainName = document.getElementById('radioNowPlaying');
        var miniName = document.getElementById('radioMiniName');
        if (mainName && miniName && mainName.textContent !== miniName.textContent) {
            miniName.textContent = mainName.textContent;
        }
    }, 500);

    console.log('📻 Platine Technics flottante injectée');
})();
