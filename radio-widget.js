// ============================================================
// LECTEUR RADIO VINTAGE - E-VISIOCAM
// Supporte : flux direct (audio natif) + iframe embed
// ============================================================

var allRadios = [];
var currentRadioIndex = 0;
var audioEl = null;

function initAudio() {
    if (audioEl) return;
    audioEl = new Audio();
    audioEl.volume = 0.6;
    audioEl.addEventListener('playing', function() {
        updateRadioStatus('En lecture');
        updatePlayBtn(true);
    });
    audioEl.addEventListener('pause', function() {
        updateRadioStatus('En pause');
        updatePlayBtn(false);
    });
    audioEl.addEventListener('waiting', function() {
        updateRadioStatus('Chargement...');
    });
    audioEl.addEventListener('error', function() {
        updateRadioStatus('Erreur de flux');
    });
}

async function loadRadios() {
    initAudio();
    try {
        var res = await fetch('https://e-visiocam-api.onrender.com/api/radios');
        var data = await res.json();
        allRadios = data.radios || [];
        console.log('📻 Radios chargées :', allRadios.length);
        if (allRadios.length > 0) {
            playRadio(0);
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
    frame.innerHTML = '<p class="text-amber-400 text-xs text-center px-2">📻 ' + text + '</p>';
}

function playRadio(index) {
    if (allRadios.length === 0) return;
    if (index < 0) index = allRadios.length - 1;
    if (index >= allRadios.length) index = 0;

    currentRadioIndex = index;
    var radio = allRadios[index];

    var frame = document.getElementById('radioFrame');
    var nowPlaying = document.getElementById('radioNowPlaying');

    if (!frame) return;

    if (audioEl) { audioEl.pause(); audioEl.removeAttribute('src'); audioEl.load(); }

    if (nowPlaying) nowPlaying.textContent = radio.name;

    if (radio.stream_url && radio.stream_url.trim()) {
        frame.innerHTML = '<div class="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-black text-amber-100 p-4">' +
            '<i class="fa-solid fa-radio text-4xl mb-2 text-amber-400"></i>' +
            '<p class="text-xs text-center text-amber-200">Flux direct</p>' +
            '<p class="text-[10px] text-slate-400 mt-1 text-center break-all px-2">' + (radio.stream_url.split('/').pop() || '') + '</p>' +
            '</div>';
        audioEl.src = radio.stream_url;
        audioEl.load();
        updateRadioStatus('Prêt à écouter');
        updatePlayBtn(false);
        showPlayButton();
    } else if (radio.html_embed && radio.html_embed.trim()) {
        frame.innerHTML = radio.html_embed;
        updateRadioStatus('En lecture');
        hidePlayButton();
    } else {
        showRadioPlaceholder('Radio mal configurée');
    }

    console.log('📻 Lecture :', radio.name);
}

function showPlayButton() {
    var controls = document.getElementById('radioAudioControls');
    if (controls) controls.style.display = 'flex';
    console.log('✅ Bouton play affiché');
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
        audioEl.play().catch(function(err) {
            updateRadioStatus('Cliquez pour activer');
            console.error('Erreur play:', err);
        });
    } else {
        audioEl.pause();
    }
}

function setVolume(val) {
    if (audioEl) audioEl.volume = parseFloat(val);
}

function nextRadio() { playRadio(currentRadioIndex + 1); }
function prevRadio() { playRadio(currentRadioIndex - 1); }

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRadios);
} else {
    loadRadios();
}

window.playRadio = playRadio;
window.nextRadio = nextRadio;
window.prevRadio = prevRadio;
window.loadRadios = loadRadios;
window.togglePlay = togglePlay;
window.setVolume = setVolume;
