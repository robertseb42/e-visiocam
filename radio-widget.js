// ============================================================
// LECTEUR RADIO VINTAGE - E-VISIOCAM
// ============================================================

var allRadios = [];
var currentRadioIndex = 0;

async function loadRadios() {
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
    var status = document.getElementById('radioStatus');

    if (!frame) return;

    // Insérer le HTML embed
    frame.innerHTML = radio.html_embed;
    if (nowPlaying) nowPlaying.textContent = radio.name;
    if (status) status.textContent = 'En lecture';

    console.log('📻 Lecture :', radio.name);
}

function nextRadio() {
    playRadio(currentRadioIndex + 1);
}

function prevRadio() {
    playRadio(currentRadioIndex - 1);
}

// Auto-charger au démarrage
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadRadios);
} else {
    loadRadios();
}

// Exposer globalement
window.playRadio = playRadio;
window.nextRadio = nextRadio;
window.prevRadio = prevRadio;
window.loadRadios = loadRadios;
