// ============================================================
// LECTEUR RADIO VINTAGE - E-VISIOCAM
// Supporte : flux direct (audio natif) + iframe embed
// Lecture continue entre les pages (via sessionStorage)
// ============================================================

var allRadios = [];
var currentRadioIndex = 0;
var audioEl = null;
var userWantsToPlay = false; // L'utilisateur a cliqué sur play

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
        updateRadioStatus('En lecture');
        updatePlayBtn(true);
        userWantsToPlay = true;
        saveRadioState();
    });
    audioEl.addEventListener('pause', function() {
        if (userWantsToPlay) {
            updateRadioStatus('En pause');
        }
        updatePlayBtn(false);
        saveRadioState();
    });
    audioEl.addEventListener('waiting', function() {
        updateRadioStatus('Chargement...');
    });
    audioEl.addEventListener('error', function() {
        updateRadioStatus('Erreur de flux');
    });
    audioEl.addEventListener('volumechange', function() {
        saveRadioState();
    });
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
            // Restaurer la radio depuis sessionStorage
            var state = loadRadioState();
            var targetIndex = state.index >= 0 && state.index < allRadios.length ? state.index : 0;
            playRadio(targetIndex, state.playing);
        } else {
            showRadioPlaceholder('Aucune radio disponible');
        }
    } catch (err) {
        console.error('Erreur radios:', err);
        showRadioPlaceholder('Erreur de chargement');
    }
}

function showRadioPlaceholder(text) {
    var frame = document.getElementById('radioFrame');
    if (!frame) return;
    frame.innerHTML = '<p class="text-white text-xs text-center px-2">📻 ' + text + '</p>';
}

// ---------- LIRE UNE RADIO ----------
function playRadio(index, autoPlay) {
    if (allRadios.length === 0) return;
    if (index < 0) index = allRadios.length - 1;
    if (index >= allRadios.length) index = 0;

    currentRadioIndex = index;
    var radio = allRadios[index];
    saveRadioState();

    var frame = document.getElementById('radioFrame');
    var nowPlaying = document.getElementById('radioNowPlaying');

    if (!frame) return;

    // Stopper l'ancien flux
    if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }

    if (nowPlaying) nowPlaying.textContent = radio.name;

    // Si flux direct → utiliser <audio>
    if (radio.stream_url && radio.stream_url.trim()) {
        frame.innerHTML = '<div class="w-full h-full flex flex-col items-center justify-center text-white p-4">' +
            '<i class="fa-solid fa-radio text-4xl mb-2 opacity-80"></i>' +
            '<p class="text-xs text-center font-bold">Flux direct</p>' +
            '<p class="text-[10px] text-white/70 mt-1 text-center break-all px-2">' + (radio.stream_url.split('/').pop() || '') + '</p>' +
            '</div>';
        audioEl.src = radio.stream_url;
        audioEl.load();
        updateRadioStatus(autoPlay ? 'Chargement...' : 'Prêt à écouter');
        updatePlayBtn(false);
        showPlayButton();

        // ⚠️ Auto-play si on était en train d'écouter
        if (autoPlay) {
            var playPromise = audioEl.play();
            if (playPromise !== undefined) {
                playPromise.catch(function(err) {
                    console.warn('Autoplay bloqué par le navigateur :', err.message);
                    updateRadioStatus('Clique sur ▶');
                    userWantsToPlay = false;
                    saveRadioState();
                });
            }
        }
    } else if (radio.html_embed && radio.html_embed.trim()) {
        // Iframe classique
        frame.innerHTML = radio.html_embed;
        updateRadioStatus('En lecture');
        hidePlayButton();
    } else {
        showRadioPlaceholder('Radio mal configurée');
    }

    console.log('📻 Lecture :', radio.name, autoPlay ? '(auto)' : '');
}

// ---------- BOUTONS PLAY/PAUSE/VOLUME ----------
function showPlayButton() {
    var controls = document.getElementById('radioAudioControls');
    if (controls) controls.style.display = 'flex';
}

function hidePlayButton() {
    var controls = document.getElementById('radioAudioControls');
    if (controls) controls.style.display = 'none';
}

function updatePlayBtn(isPlaying) {
    var btn = document.getElementById('radioPlayBtn');
    if (!btn) return;
    btn.innerHTML = isPlaying 
        ? '<i class="fa-solid fa-pause"></i>' 
        : '<i class="fa-solid fa-play"></i>';
}

function updateRadioStatus(text) {
    var status = document.getElementById('radioStatus');
    if (status) status.textContent = text;
}

function togglePlay() {
    if (!audioEl || !audioEl.src) return;
    if (audioEl.paused) {
        userWantsToPlay = true;
        saveRadioState();
        audioEl.play().catch(function(err) {
            updateRadioStatus('Erreur de lecture');
            console.error('Erreur play:', err);
        });
    } else {
        userWantsToPlay = false;
        saveRadioState();
        audioEl.pause();
    }
}

function setVolume(val) {
    if (audioEl) {
        audioEl.volume = parseFloat(val);
        saveRadioState();
    }
}

// ---------- NAVIGATION ----------
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

// ⚠️ Sauvegarder l'état avant de quitter la page
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
