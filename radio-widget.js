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
    audioEl.crossOrigin = 'anonymous';
    audioEl.volume = loadRadioState().volume;

    audioEl.addEventListener('playing', function() {
        isPlaying = true;
        updatePlatter(true);
        updateTonearm(true);
        updateRadioStatus('LECTURE');
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
        updateRadioStatus('ERREUR');
    });
    audioEl.addEventListener('volumechange', function() {
        saveRadioState();
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
    // -25° = repos (à l'extérieur du vinyle)
    // -5°  = lecture (au milieu du vinyle)
    if (playing) {
        tonearm.style.transform = 'rotate(-5deg)';
    } else {
        tonearm.style.transform = 'rotate(-25deg)';
    }
}

// ---------- CHARGER LES RADIOS ----------
async function loadRadios() {
    initAudio();
    try {
        var res = await fetch('https://e-visiocam-api.onrender.com/api/radios');
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
        audioEl.src = radio.stream_url;
        audioEl.load();
        updateRadioStatus(autoPlay ? 'CHARGEMENT...' : 'PRÊT');
        showPlayButton();

        if (autoPlay) {
            var playPromise = audioEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.warn('Autoplay bloqué :', err.message);
                    updateRadioStatus('CLIQUE ▶');
                    userWantsToPlay = false;
                    saveRadioState();
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
    if (audioEl.paused) {
        userWantsToPlay = true;
        audioEl.play().catch(function(err) {
            updateRadioStatus('ERREUR');
        });
    } else {
        userWantsToPlay = false;
        audioEl.pause();
    }
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
    saveRadioState();
    if (audioEl) audioEl.pause();
});

window.playRadio = playRadio;
window.nextRadio = nextRadio;
window.prevRadio = prevRadio;
window.loadRadios = loadRadios;
window.togglePlay = togglePlay;
window.setVolume = setVolume;
