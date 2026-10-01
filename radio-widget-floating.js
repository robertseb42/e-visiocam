// ============================================================
// WIDGET RADIO FLOTTANT - E-VISIOCAM
// S'injecte automatiquement sur toutes les pages
// ============================================================

(function() {
    // Éviter les doubles injections
    if (document.getElementById('radioWidgetFloating')) return;

    // Ne pas injecter si le widget est déjà dans la sidebar
    if (document.getElementById('radioWidget')) {
        console.log('📻 Widget radio déjà présent dans la sidebar');
        return;
    }

    // ---------- CRÉER LE WIDGET HTML ----------
    var widget = document.createElement('div');
    widget.id = 'radioWidgetFloating';
    widget.innerHTML = `
        <div id="radioWidgetMinimized" class="hidden items-center gap-2 bg-white/95 backdrop-blur-md rounded-full px-4 py-2 shadow-xl border border-pink-200/60 cursor-pointer hover:shadow-2xl transition-all">
            <span class="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
            <i class="fa-solid fa-radio text-brand-primary"></i>
            <span id="radioMiniName" class="text-xs font-bold text-slate-800 max-w-[100px] truncate">Radio</span>
            <button onclick="event.stopPropagation(); togglePlay()" class="w-7 h-7 rounded-full bg-brand-primary text-white flex items-center justify-center">
                <i class="fa-solid fa-play text-xs" id="radioMiniPlayIcon"></i>
            </button>
        </div>

        <div id="radioWidgetExpanded" class="bg-white/95 backdrop-blur-md rounded-2xl p-4 shadow-2xl border border-pink-200/60" style="width: 260px;">
            <div class="flex items-center justify-between mb-3">
                <p class="text-slate-800 text-xs font-bold tracking-widest uppercase flex items-center gap-1">
                    <i class="fa-solid fa-radio text-brand-primary"></i> E-VISIO RADIO
                </p>
                <div class="flex gap-1 items-center">
                    <span class="w-2 h-2 bg-rose-500 rounded-full animate-pulse"></span>
                    <span class="text-brand-primary text-[10px] font-bold">ON AIR</span>
                    <button onclick="event.stopPropagation(); minimizeRadioWidget()" class="ml-1 text-slate-400 hover:text-slate-700">
                        <i class="fa-solid fa-chevron-down text-xs"></i>
                    </button>
                </div>
            </div>

            <div class="bg-gradient-to-br from-pink-50 to-purple-50 rounded-xl p-2 border border-pink-100 shadow-inner">
                <div class="aspect-video bg-gradient-to-br from-pink-500 to-purple-600 rounded-lg overflow-hidden flex items-center justify-center relative" id="radioFrame">
                    <p class="text-white text-xs text-center px-2" id="radioPlaceholder">
                        📻 Sélectionne une radio
                    </p>
                </div>
            </div>

            <div id="radioAudioControls" class="flex items-center gap-2 mt-3" style="display: none;">
                <button id="radioPlayBtn" onclick="togglePlay()" class="w-10 h-10 rounded-full bg-brand-primary hover:bg-brand-hover text-white flex items-center justify-center shadow-lg shadow-pink-500/30">
                    <i class="fa-solid fa-play"></i>
                </button>
                <input type="range" min="0" max="1" step="0.05" value="0.6" oninput="setVolume(this.value)" class="flex-1 accent-brand-primary">
            </div>

            <div class="flex items-center justify-between mt-3">
                <div class="flex gap-2">
                    <button onclick="prevRadio()" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all">
                        <i class="fa-solid fa-backward-step text-xs"></i>
                    </button>
                    <button onclick="nextRadio()" class="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-brand-primary hover:text-white transition-all">
                        <i class="fa-solid fa-forward-step text-xs"></i>
                    </button>
                </div>
                <div class="flex items-center gap-1">
                    <span class="w-2 h-2 bg-emerald-500 rounded-full"></span>
                    <span class="text-slate-500 text-[10px] font-bold" id="radioStatus">Prêt</span>
                </div>
            </div>

            <p class="text-slate-800 text-xs text-center mt-2 font-bold truncate" id="radioNowPlaying">—</p>
        </div>
    `;

    // Style du conteneur
    widget.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';

    document.body.appendChild(widget);

    // Exposer les fonctions de minimisation
    window.minimizeRadioWidget = function() {
        document.getElementById('radioWidgetExpanded').classList.add('hidden');
        document.getElementById('radioWidgetMinimized').classList.remove('hidden');
        document.getElementById('radioWidgetMinimized').classList.add('flex');
    };

    window.expandRadioWidget = function() {
        document.getElementById('radioWidgetMinimized').classList.add('hidden');
        document.getElementById('radioWidgetMinimized').classList.remove('flex');
        document.getElementById('radioWidgetExpanded').classList.remove('hidden');
    };

    // Clic sur la version minimisée → rouvrir
    document.getElementById('radioWidgetMinimized').onclick = function() {
        window.expandRadioWidget();
    };

    // ---------- SYNCHRONISER L'ICÔNE MINI AVEC L'ÉTAT PLAY ----------
    var origUpdatePlayBtn = window.updatePlayBtn;
    window.updatePlayBtn = function(isPlaying) {
        // Appeler l'original
        if (origUpdatePlayBtn) origUpdatePlayBtn(isPlaying);
        // Mettre à jour l'icône mini
        var miniIcon = document.getElementById('radioMiniPlayIcon');
        if (miniIcon) {
            miniIcon.className = isPlaying 
                ? 'fa-solid fa-pause text-xs' 
                : 'fa-solid fa-play text-xs';
        }
    };

    // Synchroniser le nom
    var origUpdateNowPlaying = window.updateRadioStatus;
    setInterval(function() {
        var mainName = document.getElementById('radioNowPlaying');
        var miniName = document.getElementById('radioMiniName');
        if (mainName && miniName && mainName.textContent !== miniName.textContent) {
            miniName.textContent = mainName.textContent;
        }
    }, 500);

    console.log('📻 Widget radio flottant injecté');
})();
