// ============================================================
// LECTEUR RADIO VINTAGE - STYLE TECHNICS SL-1200 MK2
// E-VISIOCAM
// ============================================================

var allRadios = [];
var currentRadioIndex = 0;
var audioEl = null;
var userWantsToPlay = false;
var isPlaying = false;

// ---------- SESSION STORAGE ----------
function saveRadioState() {
    try {
        sessionStorage.setItem('evisio_radio_index', currentRadioIndex);
        sessionStorage.setItem('evisio_radio_playing', userWantsToPlay ? '1' : '0');
        sessionStorage.setItem('evisio_radio_volume', audioEl ? audioEl.volume : 0.6);
    } catch (e) {}
}

function loadRadioState() {
    try {
        return {
            index: parseInt(sessionStorage.getItem('evisio_radio_index') || '0') || 0,
            playing: sessionStorage.getItem('evisio_radio_playing') === '1',
            volume: parseFloat(sessionStorage.getItem('evisio_radio_volume') || '0.6') || 0.6
        };
    } catch (e) {
        return { index: 0, playing: false, volume: 0.6 };
    }
}

// ---------- INIT AUDIO ----------
function initAudio() {
    if (audioEl) return;
    audioEl = new Audio();
    // Ne pas forcer crossOrigin : beaucoup de flux radio publics n'envoient pas
    // Access-Control-Allow-Origin. Un <audio> simple peut pourtant les lire.
    audioEl.preload = 'none';
    audioEl.volume = loadRadioState().volume;

    audioEl.addEventListener('playing', function() {
        isPlaying = true;
        updatePlatter(true);
        updateTonearm(true);
        // Lecture conservée en sourdine en attendant le premier clic : on le dit clairement
        updateRadioStatus(audioEl.muted ? 'SON COUPÉ · CLIQUEZ' : 'LECTURE');
        userWantsToPlay = true;
        saveRadioState();
    });
    audioEl.addEventListener('pause', function() {
        isPlaying = false;
        updatePlatter(false);
        updateTonearm(false);
        if (userWantsToPlay) updateRadioStatus('PAUSE');
        saveRadioState();
    });
    audioEl.addEventListener('waiting', function() {
        updateRadioStatus('CHARGEMENT...');
    });
    audioEl.addEventListener('error', function() {
        var err = audioEl && audioEl.error;
        console.error('📻 Erreur flux radio', err ? { code: err.code, message: err.message, src: audioEl.currentSrc || audioEl.src } : 'inconnue');
        isPlaying = false;
        updatePlayBtn(false);
        updatePlatter(false);
        updateTonearm(false);
        updateRadioStatus('FLUX INDISPONIBLE');
    });
    audioEl.addEventListener('volumechange', function() {
        saveRadioState();
    });
    // Nouvelle tentative dès que le flux est prêt (ou que l'onglet revient au premier plan)
    audioEl.addEventListener('canplay', retenterLecture);
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) retenterLecture();
    });
}

// ---------- PLATEAU QUI TOURNE ----------
function updatePlatter(playing) {
    var platter = document.getElementById('radioVinyl');
    if (!platter) return;
    if (playing) {
        platter.style.animationPlayState = 'running';
        platter.classList.add('spinning');
    } else {
        platter.style.animationPlayState = 'paused';
        platter.classList.remove('spinning');
    }
}

// ---------- BRAS DE LECTURE ----------
function updateTonearm(playing) {
    var tonearm = document.getElementById('radioTonearm');
    if (!tonearm) return;
    // Pivot en bas à droite, le bras remonte vers le disque :
    // 2°    = repos (à côté du disque)
    // -22°  = lecture (pointe posée sur le sillon, le disque arrive devant la pointe)
    if (playing) {
        tonearm.style.transform = 'rotate(12deg)';
    } else {
        tonearm.style.transform = 'rotate(0deg)';
    }
}

// ============================================================
// LA RADIO CONTINUE D'UNE PAGE À L'AUTRE
// Les navigateurs interdisent de démarrer un son sans action du visiteur.
// Astuce : le flux reste branché en sourdine sur la nouvelle page, et le son
// revient instantanément au premier clic / toucher / touche de clavier.
// ============================================================
function armResume() {
    if (window.__radioResumeArmed) return;
    window.__radioResumeArmed = true;
    var handler = function() { resumeRadio(); };
    ['pointerdown', 'touchstart', 'keydown'].forEach(function(ev) {
        document.addEventListener(ev, handler, { passive: true });
    });
}

// Le visiteur vient d'agir : on remet le son
function resumeRadio() {
    if (!audioEl || !audioEl.src || !userWantsToPlay) return;
    audioEl.muted = false;
    updatePlayBtn(true);
    var p = audioEl.play();
    if (p !== undefined) {
        p.then(function() {
            updateRadioStatus('LECTURE');
            updatePlatter(true);
            updateTonearm(true);
        }).catch(function() {
            audioEl.muted = true;
            audioEl.play().catch(function() {});
            updateRadioStatus('CLIQUE ▶');
        });
    }
}

// Le flux est relancé en sourdine : prêt à être entendu au premier clic
function keepPlayingMuted() {
    if (!audioEl || !audioEl.src) return;
    audioEl.muted = true;
    var p = audioEl.play();
    if (p !== undefined) {
        p.then(function() {
            isPlaying = true;
            updatePlatter(true);
            updateTonearm(true);
            updateRadioStatus('SON COUPÉ · CLIQUEZ');
        }).catch(function() {
            updateRadioStatus('CLIQUE ▶');
        });
    }
    armResume();
    updateRadioStatus('SON COUPÉ · CLIQUEZ');
}

// On retente la lecture dès que le flux est prêt ou que l'onglet revient au premier plan
function retenterLecture() {
    if (!audioEl || !audioEl.src || !userWantsToPlay || !audioEl.paused) return;
    audioEl.play().catch(function() {});
}

// ---------- CHARGER LES RADIOS ----------
async function loadRadios() {
    initAudio();
    try {
        var res = await fetch('https://api.e-visiocam.com/api/radios');
        var data = await res.json();
        allRadios = data.radios || [];
        console.log('📻 Radios chargées :', allRadios.length);
        if (allRadios.length > 0) {
            var state = loadRadioState();
            var targetIndex = state.index >= 0 && state.index < allRadios.length ? state.index : 0;
            playRadio(targetIndex, state.playing);
        } else {
            showRadioPlaceholder('Aucune radio');
        }
    } catch (err) {
        console.error('Erreur radios:', err);
        showRadioPlaceholder('Erreur');
    }
}

function showRadioPlaceholder(text) {
    var frame = document.getElementById('radioFrame');
    if (!frame) return;
    frame.innerHTML = '<p class="text-slate-400 text-xs text-center px-2">' + text + '</p>';
}

// ---------- LIRE UNE RADIO ----------
function playRadio(index, autoPlay) {
    if (allRadios.length === 0) return;
    if (index < 0) index = allRadios.length - 1;
    if (index >= allRadios.length) index = 0;

    currentRadioIndex = index;
    var radio = allRadios[index];
    saveRadioState();

    var nowPlaying = document.getElementById('radioNowPlaying');
    if (nowPlaying) nowPlaying.textContent = radio.name;

    if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }

    if (radio.stream_url && radio.stream_url.trim()) {
        var streamUrl = String(radio.stream_url || '').trim();
        // Une page HTTPS ne peut pas lire un flux HTTP (mixed content).
        if (location.protocol === 'https:' && /^http:\/\//i.test(streamUrl)) {
            console.error('📻 Flux HTTP bloqué sur page HTTPS :', streamUrl);
            updateRadioStatus('FLUX HTTP BLOQUÉ');
            showPlayButton();
            return;
        }
        audioEl.src = streamUrl;
        audioEl.load();
        updateRadioStatus(autoPlay ? 'CHARGEMENT...' : 'PRÊT');
        showPlayButton();

        if (autoPlay) {
            var playPromise = audioEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.warn('Autoplay bloqué :', err.message);
                    // On garde l'intention de lecture : le flux repart en sourdine
                    // et le son revient au premier clic (la radio ne s'arrête plus
                    // quand on change de page).
                    userWantsToPlay = true;
                    saveRadioState();
                    keepPlayingMuted();
                });
            }
        }
    } else {
        showRadioPlaceholder('Radio sans flux');
        hidePlayButton();
    }

    console.log('📻 Lecture :', radio.name);
}

// ---------- BOUTONS ----------
function showPlayButton() {
    var controls = document.getElementById('radioAudioControls');
    if (controls) controls.style.display = 'block';
}

function hidePlayButton() {
    var controls = document.getElementById('radioAudioControls');
    if (controls) controls.style.display = 'none';
}

function updatePlayBtn(isPlaying) {
    var btn = document.getElementById('radioPlayBtn');
    if (!btn) return;
    var icon = btn.querySelector('i');
    if (icon) {
        icon.className = isPlaying 
            ? 'fa-solid fa-pause' 
            : 'fa-solid fa-play';
    }
    // Update mini icon
    var miniIcon = document.getElementById('radioMiniPlayIcon');
    if (miniIcon) {
        miniIcon.className = isPlaying 
            ? 'fa-solid fa-pause text-xs' 
            : 'fa-solid fa-play text-xs';
    }
}

function updateRadioStatus(text) {
    var status = document.getElementById('radioStatus');
    if (status) status.textContent = text;
}

function togglePlay() {
    if (!audioEl || !audioEl.src) return;
    // Le flux tourne en sourdine après un changement de page : le 1er clic remet le son
    if (audioEl.muted && !audioEl.paused) {
        userWantsToPlay = true;
        resumeRadio();
        saveRadioState();
        return;
    }
    if (audioEl.paused) {
        userWantsToPlay = true;
        audioEl.muted = false;
        updateRadioStatus('CHARGEMENT...');
        audioEl.play().then(function() {
            updatePlayBtn(true);
            updateRadioStatus('LECTURE');
        }).catch(function(err) {
            console.error('📻 Lecture impossible :', err);
            updatePlayBtn(false);
            updateRadioStatus(err && err.name === 'NotAllowedError' ? 'CLIQUE ▶' : 'FLUX INDISPONIBLE');
        });
    } else {
        userWantsToPlay = false;
        audioEl.pause();
    }
    saveRadioState();
    updatePlayBtn(!audioEl.paused);
}

function setVolume(val) {
    if (audioEl) {
        audioEl.volume = parseFloat(val);
        saveRadioState();
    }
}

function nextRadio() {
    var wasPlaying = userWantsToPlay;
    playRadio(currentRadioIndex + 1, wasPlaying);
}

function prevRadio() {
    var wasPlaying = userWantsToPlay;
    playRadio(currentRadioIndex - 1, wasPlaying);
}

// ---------- INIT ----------
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRadios);
} else {
    loadRadios();
}

window.addEventListener('beforeunload', function() {
    // On garde l'état (station, volume, lecture) pour la page suivante
    saveRadioState();
});

window.playRadio = playRadio;
window.nextRadio = nextRadio;
window.prevRadio = prevRadio;
window.loadRadios = loadRadios;
window.togglePlay = togglePlay;
window.setVolume = setVolume;
window.resumeRadio = resumeRadio;
window.keepPlayingMuted = keepPlayingMuted;
