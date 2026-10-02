// ============================================================
// WIDGET RADIO FLOTTANT — PLATINE TECHNICS SL-1200 MK2
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

        <!-- Platine vinyle (même look que l'accueil) -->
        <div id="radioWidgetExpanded" class="rounded-2xl p-3 shadow-2xl"
             style="width: 252px; background: linear-gradient(145deg, #ececec 0%, #c8c8c8 40%, #b0b0b0 100%); border: 2px solid #8a8a8a; box-shadow: 0 14px 36px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6);">

            <!-- Plaque signalétique -->
            <div class="flex items-center justify-between mb-2 pb-1.5" style="border-bottom: 1px solid rgba(0,0,0,0.15);">
                <p class="text-slate-800 text-[10px] font-black tracking-[0.2em] uppercase" style="text-shadow: 0 1px 0 rgba(255,255,255,0.7);">⬤ TECHNICS</p>
                <div class="flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-rose-500 rounded-full" style="box-shadow: 0 0 8px #e91e63;"></span>
                    <span class="text-slate-700 text-[9px] font-bold tracking-wider">SL-1200</span>
                    <button onclick="minimizeRadioWidget()" aria-label="Réduire la radio" title="Réduire" class="text-slate-600 hover:text-slate-900 ml-1">
                        <i class="fa-solid fa-chevron-down text-[10px]"></i>
                    </button>
                </div>
            </div>

            <!-- Plateau + vinyle + bras -->
            <div class="relative aspect-square rounded-lg overflow-hidden flex items-center justify-center mb-2"
                 style="background: radial-gradient(circle at 50% 50%, #2a2a2a 0%, #1a1a1a 60%, #0a0a0a 100%); box-shadow: inset 0 0 20px rgba(0,0,0,0.8), inset 0 2px 4px rgba(0,0,0,0.6);">

                <div class="absolute inset-1 rounded-full" style="border: 1px dashed rgba(255,255,255,0.15);"></div>

                <div id="radioVinyl" class="relative rounded-full" style="width: 82%; height: 82%; background:
                    repeating-radial-gradient(circle at 50% 50%,
                        #0a0a0a 0px, #0a0a0a 2px,
                        #151515 3px, #151515 4px,
                        #0a0a0a 5px, #0a0a0a 6px);
                    box-shadow: 0 0 16px rgba(0,0,0,0.9), inset 0 0 24px rgba(0,0,0,0.5);">
                    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full flex items-center justify-center"
                         style="width: 40%; height: 40%; background: linear-gradient(135deg, #e91e63 0%, #9c27b0 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.5);">
                        <i class="fa-solid fa-music text-white/90" style="font-size: 1.1rem;"></i>
                    </div>
                    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full"
                         style="background: radial-gradient(circle, #888 0%, #444 100%);"></div>
                </div>

                <div id="radioTonearm" class="absolute"
                     style="top: 12%; right: 0; width: 42%; height: 4px;
                            transform-origin: right center;
                            transform: rotate(-25deg);
                            background: linear-gradient(90deg, #606060 0%, #909090 50%, #d0d0d0 100%);
                            border-radius: 2px;
                            box-shadow: 0 2px 4px rgba(0,0,0,0.5);">
                    <div class="absolute top-1/2 -translate-y-1/2"
                         style="right: -8px; width: 13px; height: 13px; border-radius: 3px;
                                background: linear-gradient(145deg, #c0c0c0, #606060);
                                box-shadow: inset 0 1px 0 rgba(255,255,255,0.5), 0 2px 3px rgba(0,0,0,0.4);"></div>
                    <div class="absolute top-1/2 -translate-y-1/2"
                         style="left: -2px; width: 11px; height: 16px;
                                background: linear-gradient(180deg, #3a3a3a 0%, #1a1a1a 100%);
                                border-radius: 2px 2px 3px 3px;
                                transform: translateY(-50%);
                                box-shadow: 0 2px 4px rgba(0,0,0,0.6);">
                        <div class="absolute" style="bottom: -4px; left: 50%; transform: translateX(-50%); width: 2px; height: 6px; background: #d0d0d0; border-radius: 0 0 2px 2px;"></div>
                    </div>
                </div>

                <div class="absolute top-2.5 left-2.5 w-2.5 h-2.5 rounded-full" style="background: radial-gradient(circle, #666, #333); box-shadow: inset 0 1px 2px rgba(0,0,0,0.5);"></div>

                <div class="absolute bottom-2 right-2 flex items-center gap-1">
                    <span class="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse" style="box-shadow: 0 0 6px #e91e63;"></span>
                    <span class="text-slate-400 text-[8px] font-bold tracking-wider">ON AIR</span>
                </div>

                <!-- Zone utilisée par radio-widget.js pour les messages d'état -->
                <div id="radioFrame" style="display: none;"></div>
            </div>

            <!-- Contrôles -->
            <div id="radioAudioControls" class="space-y-1.5">
                <div class="flex items-center gap-1.5">
                    <button id="radioPlayBtn" onclick="togglePlay()" aria-label="Lecture / pause"
                            class="flex items-center justify-center rounded-md active:scale-95 transition-all"
                            style="width: 38px; height: 38px; background: linear-gradient(180deg, #f5f5f5 0%, #c8c8c8 100%); border: 1px solid #8a8a8a; box-shadow: 0 3px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.8);">
                        <i class="fa-solid fa-play text-slate-800 text-xs"></i>
                    </button>
                    <button onclick="prevRadio()" aria-label="Radio précédente" class="flex items-center justify-center rounded-md active:scale-95"
                            style="width: 26px; height: 26px; background: linear-gradient(180deg, #f5f5f5 0%, #c8c8c8 100%); border: 1px solid #8a8a8a;">
                        <i class="fa-solid fa-backward-step text-slate-700 text-[9px]"></i>
                    </button>
                    <button onclick="nextRadio()" aria-label="Radio suivante" class="flex items-center justify-center rounded-md active:scale-95"
                            style="width: 26px; height: 26px; background: linear-gradient(180deg, #f5f5f5 0%, #c8c8c8 100%); border: 1px solid #8a8a8a;">
                        <i class="fa-solid fa-forward-step text-slate-700 text-[9px]"></i>
                    </button>
                    <input type="range" min="0" max="1" step="0.05" value="0.6" oninput="setVolume(this.value)" aria-label="Volume"
                           class="flex-1 accent-brand-primary" style="height: 4px; min-width: 40px;">
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center rounded-md overflow-hidden" style="background: #1a1a1a; border: 1px solid #000;">
                        <span class="px-1.5 py-0.5 text-[8px] font-black text-rose-400">33</span>
                        <span class="px-1.5 py-0.5 text-[8px] font-bold text-slate-500">45</span>
                    </div>
                    <div class="flex items-center gap-1">
                        <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full" style="box-shadow: 0 0 6px #10b981;"></span>
                        <span class="text-slate-700 text-[9px] font-bold tracking-wider" id="radioStatus">PRÊT</span>
                    </div>
                </div>

                <div class="rounded-md px-2 py-1.5" style="background: #0a0a0a; border: 1px solid #333; box-shadow: inset 0 2px 4px rgba(0,0,0,0.8);">
                    <p class="text-[10px] font-mono font-bold tracking-wider truncate text-center" id="radioNowPlaying"
                       style="color: #4ade80; text-shadow: 0 0 4px #4ade80;">---</p>
                </div>
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
            + '#radioTonearm{transition:transform 1.2s ease}'
            + '#radioWidgetFloating .text-slate-800{color:#232326}'
            + '#radioWidgetFloating .text-slate-700{color:#3b3b41}'
            + '#radioWidgetFloating .text-slate-500{color:#4a4a52}'
            + '#radioWidgetFloating .text-slate-400{color:#55555c}';
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
