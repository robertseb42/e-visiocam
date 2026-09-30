// ============ E-VISIOCAM - SCRIPT COMMUN ============

// Configuration Tailwind partagée
if (typeof tailwind !== 'undefined') {
    tailwind.config = {
        theme: {
            extend: {
                colors: {
                    brand: {
                        50: '#fdf2f8', 100: '#fce7f3', 500: '#ec4899',
                        600: '#e11d48', primary: '#e91e63',
                        hover: '#d81b60', dark: '#881337',
                    },
                    darkpurple: '#1a0b2e',
                    carddark: '#24143a'
                },
                fontFamily: { sans: ['Inter', 'sans-serif'] }
            }
        }
    };
}

// ============ MODALES ============
function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
}

// Fermer les modales en cliquant à l'extérieur
document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('fixed') && e.target.id.endsWith('Modal')) {
        closeModal(e.target.id);
    }
});

// Fermer avec Échap
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('[id$="Modal"]').forEach(m => {
            if (!m.classList.contains('hidden')) closeModal(m.id);
        });
    }
});

// ============ TOAST ============
function showToast(msg, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.className = 'fixed bottom-5 right-5 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-xs z-50 transition-all transform translate-y-20 opacity-0 pointer-events-none';
        toast.innerHTML = `
            <div class="w-7 h-7 rounded-full bg-brand-primary flex items-center justify-center shrink-0">
                <i class="fa-solid fa-check text-xs"></i>
            </div>
            <span id="toastMessage"></span>
        `;
        document.body.appendChild(toast);
    }

    const icons = {
        success: 'fa-check',
        error: 'fa-exclamation',
        info: 'fa-info',
        warning: 'fa-exclamation-triangle'
    };
    const colors = {
        success: 'bg-emerald-500',
        error: 'bg-rose-500',
        info: 'bg-blue-500',
        warning: 'bg-amber-500'
    };

    const iconBox = toast.querySelector('div');
    iconBox.className = `w-7 h-7 rounded-full ${colors[type] || colors.success} flex items-center justify-center shrink-0`;
    iconBox.innerHTML = `<i class="fa-solid ${icons[type] || icons.success} text-xs"></i>`;

    document.getElementById('toastMessage').innerText = msg;
    toast.classList.remove('translate-y-20', 'opacity-0', 'pointer-events-none');

    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => {
        toast.classList.add('translate-y-20', 'opacity-0', 'pointer-events-none');
    }, 3000);
}

// ============ MENU MOBILE ============
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    sidebar.classList.toggle('hidden');
    sidebar.classList.toggle('flex');
    sidebar.classList.toggle('absolute');
    sidebar.classList.toggle('z-30');
}

// ============ SÉCURITÉ ============
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============ DÉTECTION PAGE ACTIVE ============
document.addEventListener('DOMContentLoaded', () => {
    const current = window.location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('nav a[href]').forEach(a => {
        const href = a.getAttribute('href');
        if (href === current || (current === 'index.html' && href === './')) {
            a.classList.add('text-brand-primary', 'border-b-2', 'border-brand-primary', 'font-semibold');
        }
    });
});