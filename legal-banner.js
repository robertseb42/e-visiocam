// ============================================================
// BANNIÈRE LÉGALE +18 (obligatoire pour sites adultes)
// ============================================================

(function() {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const skipPages = ['cgu.html', 'confidentialite.html', 'a-propos.html', 'contact.html', 'mentions-legales.html', 'cookies.html', 'rgpd.html'];
    if (skipPages.includes(currentPage)) return;
    if (localStorage.getItem('evisiocam_legal_accepted') === '1') return;

    function createBanner() {
        const banner = document.createElement('div');
        banner.id = 'legalOverlay';
        banner.style.cssText = `
            position: fixed; inset: 0;
            background: rgba(15, 23, 42, 0.95);
            backdrop-filter: blur(10px);
            z-index: 99999;
            display: flex; align-items: center; justify-content: center;
            padding: 1rem;
            font-family: 'Inter', sans-serif;
        `;

        banner.innerHTML = `
            <div style="
                background: white; border-radius: 24px;
                max-width: 520px; width: 100%;
                padding: 32px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.4);
                text-align: center;
                max-height: 90vh; overflow-y: auto;
            ">
                <div style="
                    width: 70px; height: 70px; border-radius: 20px;
                    background: linear-gradient(135deg, #e91e63, #9c27b0);
                    color: white; display: flex; align-items: center;
                    justify-content: center; font-size: 32px; margin: 0 auto 20px;
                ">🔞</div>

                <h1 style="font-size: 24px; font-weight: 900; color: #0f172a; margin: 0 0 12px; line-height: 1.2;">
                    Contenu réservé aux adultes
                </h1>

                <p style="font-size: 14px; color: #64748b; margin: 0 0 24px; line-height: 1.6;">
                    Ce site contient du contenu réservé aux personnes majeures.
                    Veuillez cocher les 3 cases ci-dessous pour continuer.
                </p>

                <div style="text-align: left; margin: 0 0 24px;">
                    <label style="
                        display: flex; align-items: flex-start; gap: 12px;
                        padding: 14px; border-radius: 12px;
                        background: #f8fafc; margin-bottom: 10px;
                        cursor: pointer; transition: background 0.2s;
                    ">
                        <input type="checkbox" id="checkAge" class="legal-checkbox" style="
                            width: 20px; height: 20px; cursor: pointer;
                            margin-top: 2px; accent-color: #e91e63; flex-shrink: 0;
                        ">
                        <span style="font-size: 13px; color: #334155; line-height: 1.5;">
                            Je certifie avoir <strong>18 ans ou plus</strong> et être légalement autorisé à consulter ce type de contenu dans mon pays.
                        </span>
                    </label>

                    <label style="
                        display: flex; align-items: flex-start; gap: 12px;
                        padding: 14px; border-radius: 12px;
                        background: #f8fafc; margin-bottom: 10px;
                        cursor: pointer; transition: background 0.2s;
                    ">
                        <input type="checkbox" id="checkVoluntary" class="legal-checkbox" style="
                            width: 20px; height: 20px; cursor: pointer;
                            margin-top: 2px; accent-color: #e91e63; flex-shrink: 0;
                        ">
                        <span style="font-size: 13px; color: #334155; line-height: 1.5;">
                            Je consulte ce contenu <strong>volontairement</strong> et je ne me considère pas offensé(e).
                        </span>
                    </label>

                    <label style="
                        display: flex; align-items: flex-start; gap: 12px;
                        padding: 14px; border-radius: 12px;
                        background: #f8fafc; margin-bottom: 10px;
                        cursor: pointer; transition: background 0.2s;
                    ">
                        <input type="checkbox" id="checkCgu" class="legal-checkbox" style="
                            width: 20px; height: 20px; cursor: pointer;
                            margin-top: 2px; accent-color: #e91e63; flex-shrink: 0;
                        ">
                        <span style="font-size: 13px; color: #334155; line-height: 1.5;">
                            J'accepte les <a href="cgu.html" target="_blank" style="color: #e91e63; text-decoration: underline; font-weight: bold;">CGU</a>
                            et la <a href="confidentialite.html" target="_blank" style="color: #e91e63; text-decoration: underline; font-weight: bold;">politique de confidentialité</a>.
                        </span>
                    </label>
                </div>

                <button id="acceptLegalBtn" disabled style="
                    width: 100%; padding: 16px;
                    background: #e2e8f0; color: #94a3b8;
                    font-weight: bold; border: none;
                    border-radius: 14px; font-size: 15px;
                    cursor: not-allowed;
                    margin-bottom: 12px;
                    transition: all 0.2s;
                ">
                    ⚠️ Cochez les 3 cases pour continuer
                </button>

                <button id="quitLegalBtn" style="
                    width: 100%; padding: 12px;
                    background: #f1f5f9; color: #64748b;
                    font-weight: 600; border: none;
                    border-radius: 12px; font-size: 13px;
                    cursor: pointer;
                ">
                    ← Quitter le site
                </button>

                <div style="
                    margin-top: 20px; padding-top: 20px;
                    border-top: 1px solid #e2e8f0;
                ">
                    <div style="
                        display: flex;
                        justify-content: center;
                        gap: 12px;
                        flex-wrap: wrap;
                        font-size: 11px;
                        margin-bottom: 12px;
                    ">
                        <a href="mentions-legales.html" target="_blank" style="color: #64748b; text-decoration: underline;">Mentions légales</a>
                        <a href="cgu.html" target="_blank" style="color: #64748b; text-decoration: underline;">CGU</a>
                        <a href="confidentialite.html" target="_blank" style="color: #64748b; text-decoration: underline;">Confidentialité</a>
                        <a href="cookies.html" target="_blank" style="color: #64748b; text-decoration: underline;">Cookies</a>
                        <a href="rgpd.html" target="_blank" style="color: #e91e63; text-decoration: underline; font-weight: bold;">RGPD</a>
                    </div>

                    <div style="font-size: 11px; color: #94a3b8; line-height: 1.6;">
                        <p style="margin: 0 0 6px;">🆘 <strong>Signalement contenu illégal :</strong></p>
                        <p style="margin: 0 0 4px;">
                            <a href="https://www.internet-signalement.gouv.fr" target="_blank" style="color: #e91e63; text-decoration: none; font-weight: bold;">
                                PHAROS (internet-signalement.gouv.fr)
                            </a>
                        </p>
                        <p style="margin: 0;">
                            📧 <a href="mailto:abuse@e-visiocam.com" style="color: #e91e63; text-decoration: none;">
                                abuse@e-visiocam.com
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(banner);

        const checkboxes = banner.querySelectorAll('.legal-checkbox');
        const acceptBtn = banner.querySelector('#acceptLegalBtn');

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                if (allChecked) {
                    acceptBtn.disabled = false;
                    acceptBtn.style.background = 'linear-gradient(135deg, #e91e63, #f43f5e)';
                    acceptBtn.style.color = 'white';
                    acceptBtn.style.cursor = 'pointer';
                    acceptBtn.innerText = '✓ J\'ai 18 ans ou plus, entrer';
                } else {
                    acceptBtn.disabled = true;
                    acceptBtn.style.background = '#e2e8f0';
                    acceptBtn.style.color = '#94a3b8';
                    acceptBtn.style.cursor = 'not-allowed';
                    const remaining = Array.from(checkboxes).filter(c => !c.checked).length;
                    acceptBtn.innerText = '⚠️ Cochez les ' + remaining + ' case' + (remaining > 1 ? 's' : '') + ' restante' + (remaining > 1 ? 's' : '');
                }
            });
        });

        acceptBtn.addEventListener('click', () => {
            if (acceptBtn.disabled) return;
            localStorage.setItem('evisiocam_legal_accepted', '1');
            localStorage.setItem('evisiocam_legal_date', new Date().toISOString());
            banner.remove();
        });

        banner.querySelector('#quitLegalBtn').addEventListener('click', () => {
            window.location.href = 'https://www.google.com';
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createBanner);
    } else {
        createBanner();
    }
})();