// ============================================================
// SERVICE D'ENVOI D'EMAILS
// ------------------------------------------------------------
// 1. OVH (SMTP de votre boîte mail) si SMTP_HOST est défini   ← recommandé
//      SMTP_HOST=ssl0.ovh.net  SMTP_PORT=465
//      SMTP_USER=contact@e-visiocam.com  SMTP_PASS=<mot de passe de la boîte>
//      MAIL_FROM_EMAIL (facultatif, défaut : SMTP_USER)  MAIL_FROM_NAME (défaut : E-VISIOCAM)
// 2. Sinon SendGrid si SENDGRID_API_KEY est défini
// 3. Sinon mode simulation (les emails sont seulement écrits dans les logs)
// ============================================================
const sgMail = require('@sendgrid/mail');

const SMTP_HOST = process.env.SMTP_HOST;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM_EMAIL = process.env.MAIL_FROM_EMAIL || (SMTP_HOST ? process.env.SMTP_USER : process.env.SENDGRID_FROM_EMAIL) || 'noreply@e-visiocam.com';
const FROM_NAME = process.env.MAIL_FROM_NAME || process.env.SENDGRID_FROM_NAME || 'E-VISIOCAM';

let enabled = false;
let transport = null;   // OVH (nodemailer) ; null = SendGrid

if (SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = require('nodemailer');
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    transport = nodemailer.createTransport({
        host: SMTP_HOST,
        port: port,
        secure: port === 465,                       // 465 = SSL ; 587 = STARTTLS
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    enabled = true;
    console.log('✅ Emails via SMTP ' + SMTP_HOST + ' (' + FROM_EMAIL + ')');
    transport.verify().then(
        () => console.log('✅ Connexion SMTP OK'),
        err => console.error('❌ Connexion SMTP impossible :', err.message)
    );
} else if (SENDGRID_API_KEY && SENDGRID_API_KEY.startsWith('SG.')) {
    sgMail.setApiKey(SENDGRID_API_KEY);
    enabled = true;
    console.log('✅ SendGrid initialisé (' + FROM_EMAIL + ')');
} else {
    console.log('⚠️  Envoi d\'emails désactivé (mode simulation)');
}

// ============================================================
// FONCTION PRINCIPALE D'ENVOI
// ============================================================
async function sendMail({ to, subject, html, text, replyTo, attachments }) {
    if (!enabled) {
        console.log('📧 [SIMULATION] Email vers ' + to + ' : ' + subject);
        return { simulated: true };
    }

    try {
        if (transport) {
            await transport.sendMail({
                from: { name: FROM_NAME, address: FROM_EMAIL },
                to: to,
                subject: subject,
                text: text || '',
                html: html,
                // « Répondre » renvoie vers cette adresse (ex. : le visiteur du formulaire de contact)
                ...(replyTo ? { replyTo: replyTo } : {}),
                ...(attachments ? { attachments: attachments } : {})
            });
        } else {
            const msg = {
                to: to,
                from: { email: FROM_EMAIL, name: FROM_NAME },
                subject: subject,
                text: text || '',
                html: html
            };
            if (replyTo) msg.replyTo = replyTo;
            if (attachments) msg.attachments = attachments.map(a => ({
                filename: a.filename, type: a.contentType || 'application/octet-stream', disposition: 'attachment',
                content: Buffer.isBuffer(a.content) ? a.content.toString('base64') : String(a.content)
            }));
            await sgMail.send(msg);
        }
        console.log('📧 Email envoyé à ' + to + ' : ' + subject);
        return { success: true };
    } catch (err) {
        console.error('❌ Erreur envoi email à ' + to + ' :', err.message);
        if (err.response && err.response.body) {
            console.error('   Details:', JSON.stringify(err.response.body, null, 2));
        }
        return { error: err.message };
    }
}

// ============================================================
// TEMPLATE HTML
// ============================================================
function emailTemplate(title, content, ctaText, ctaUrl) {
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            body { font-family: 'Inter', Arial, sans-serif; background: #f1f5f9; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
            .header { background: linear-gradient(135deg, #e91e63, #9c27b0); padding: 40px 20px; text-align: center; }
            .header h1 { color: white; margin: 0; font-size: 28px; font-weight: 900; letter-spacing: 1px; }
            .header p { color: rgba(255,255,255,0.8); margin: 8px 0 0; font-size: 14px; }
            .content { padding: 40px 30px; color: #334155; line-height: 1.6; }
            .content h2 { color: #0f172a; font-size: 22px; margin: 0 0 16px; }
            .content p { margin: 0 0 16px; font-size: 15px; }
            .content ul { margin: 0 0 16px; padding-left: 20px; }
            .content li { margin-bottom: 8px; font-size: 14px; }
            .cta { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #e91e63, #f43f5e); color: white !important; text-decoration: none; border-radius: 12px; font-weight: bold; margin: 16px 0; }
            .footer { background: #f8fafc; padding: 24px; text-align: center; font-size: 12px; color: #94a3b8; }
            .footer a { color: #e91e63; text-decoration: none; }
            .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 8px; margin: 16px 0; font-size: 13px; color: #78350f; }
            table { width: 100%; border-collapse: collapse; margin: 16px 0; }
            td { padding: 10px; font-size: 14px; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>E-VISIOCAM</h1>
                <p>Chat cam en direct & rencontres live</p>
            </div>
            <div class="content">
                <h2>${title}</h2>
                ${content}
                ${ctaText ? '<a href="' + ctaUrl + '" class="cta">' + ctaText + '</a>' : ''}
            </div>
            <div class="footer">
                <p>© 2026 E-VISIOCAM - Tous droits réservés</p>
                <p>
                    <a href="${siteUrl}">Accueil</a> •
                    <a href="${siteUrl}/cgu.html">CGU</a> •
                    <a href="${siteUrl}/confidentialite.html">Confidentialité</a>
                </p>
                <p style="margin-top: 12px; font-size: 11px;">
                    🔞 Contenu réservé aux adultes (+18).<br>
                    Signalement : <a href="mailto:abuse@e-visiocam.com">abuse@e-visiocam.com</a>
                </p>
            </div>
        </div>
    </body>
    </html>
    `;
}

// ============================================================
// 1. EMAIL DE BIENVENUE
// ============================================================
async function sendWelcomeEmail(user) {
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    return sendMail({
        to: user.email,
        subject: '🎉 Bienvenue sur E-VISIOCAM !',
        html: emailTemplate(
            'Bienvenue ' + user.username + ' ! 🎉',
            `
            <p>Merci de rejoindre <strong>E-VISIOCAM</strong>, la plateforme de chat cam en direct.</p>
            <p>Ton compte a bien été créé. Voici ce que tu peux faire :</p>
            <ul>
                <li>💬 <strong>Discuter</strong> en temps réel avec la communauté</li>
                <li>🎥 <strong>Regarder</strong> des lives de nos modèles vérifiés</li>
                <li>🎁 <strong>Envoyer</strong> des cadeaux virtuels</li>
                <li>💰 <strong>Acheter</strong> des crédits pour discuter en privé</li>
            </ul>
            <p>Pour commencer, connecte-toi dès maintenant !</p>
            `,
            'Accéder à mon compte',
            siteUrl + '/login.html'
        ),
        text: 'Bienvenue sur E-VISIOCAM ! Connecte-toi : ' + siteUrl + '/login.html'
    });
}

// ============================================================
// 2. RÉINITIALISATION DE MOT DE PASSE
// ============================================================
async function sendPasswordResetEmail(user, resetToken) {
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    const resetUrl = siteUrl + '/reset-password.html?token=' + resetToken;
    return sendMail({
        to: user.email,
        subject: '🔑 Réinitialisation de ton mot de passe',
        html: emailTemplate(
            'Réinitialisation de mot de passe',
            `
            <p>Bonjour <strong>${user.username}</strong>,</p>
            <p>Tu as demandé à réinitialiser ton mot de passe.</p>
            <p>Clique sur le bouton ci-dessous pour choisir un nouveau mot de passe :</p>
            <div class="warning">
                ⏰ Ce lien est valable pendant <strong>1 heure</strong> uniquement.
            </div>
            <p style="font-size: 13px; color: #64748b;">
                Si tu n'es pas à l'origine de cette demande, ignore cet email.
                Ton mot de passe actuel reste inchangé.
            </p>
            `,
            'Réinitialiser mon mot de passe',
            resetUrl
        ),
        text: 'Réinitialisation : ' + resetUrl
    });
}

// ============================================================
// 3. ALERTE MODÉRATEUR
// ============================================================
async function sendModeratorAlert(report, targetUsername, reporterUsername) {
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    return sendMail({
        to: process.env.MODERATOR_EMAIL || process.env.SENDGRID_FROM_EMAIL,
        subject: '🚨 Nouveau signalement - ' + (targetUsername || 'Utilisateur'),
        html: emailTemplate(
            'Nouveau signalement 🚨',
            `
            <p>Un nouveau signalement vient d'être créé.</p>
            <table>
                <tr style="background: #f8fafc;">
                    <td style="font-weight: bold;">Utilisateur signalé :</td>
                    <td>${targetUsername || 'Utilisateur #' + (report.target_id || '?')}</td>
                </tr>
                <tr>
                    <td style="font-weight: bold;">Raison :</td>
                    <td>${report.reason || '—'}</td>
                </tr>
                <tr style="background: #f8fafc;">
                    <td style="font-weight: bold;">Priorité :</td>
                    <td>${report.priority || 1}/5 ${(report.priority >= 4) ? '⚠️ URGENT' : ''}</td>
                </tr>
                <tr>
                    <td style="font-weight: bold;">Signalé par :</td>
                    <td>${reporterUsername}</td>
                </tr>
                ${report.description ? '<tr style="background: #f8fafc;"><td style="font-weight: bold;">Description :</td><td>' + report.description + '</td></tr>' : ''}
            </table>
            `,
            'Voir dans le panneau de modération',
            siteUrl + '/moderation.html'
        ),
        text: 'Nouveau signalement : ' + targetUsername + ' - ' + report.reason
    });
}

// ============================================================
// 4. CONFIRMATION D'ACHAT DE CRÉDITS
// ============================================================
async function sendCreditsPurchaseEmail(user, credits, amount) {
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    return sendMail({
        to: user.email,
        subject: '💰 Achat de crédits confirmé',
        html: emailTemplate(
            'Achat de crédits confirmé 💰',
            `
            <p>Bonjour <strong>${user.username}</strong>,</p>
            <p>Ton achat de crédits a bien été enregistré.</p>
            <table>
                <tr style="background: #f8fafc;">
                    <td style="font-weight: bold;">Crédits ajoutés :</td>
                    <td style="color: #10b981; font-weight: bold;">+${credits} crédits</td>
                </tr>
                ${amount ? '<tr><td style="font-weight: bold;">Montant payé :</td><td>' + amount + '</td></tr>' : ''}
            </table>
            <p>Tu peux dès maintenant utiliser tes crédits pour :</p>
            <ul>
                <li>🎁 Envoyer des cadeaux</li>
                <li>💬 Discuter en privé avec des modèles</li>
                <li>⭐ Soutenir tes créateurs préférés</li>
            </ul>
            `,
            'Voir mon solde',
            siteUrl + '/credits.html'
        ),
        text: 'Achat confirmé : +' + credits + ' crédits'
    });
}

// ============================================================
// 5. NOTIFICATION CADEAU REÇU
// ============================================================
async function sendGiftNotificationEmail(user, gift, senderUsername, message) {
    const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const siteUrl = process.env.SITE_URL || 'https://www.e-visiocam.com';
    return sendMail({
        to: user.email,
        subject: '🎁 Tu as reçu un cadeau !',
        html: emailTemplate(
            'Tu as reçu un cadeau ! 🎁',
            `
            <p>Bonjour <strong>${escape(user.username)}</strong>,</p>
            <p><strong>${escape(senderUsername)}</strong> t'a envoyé :</p>
            <div style="text-align: center; padding: 20px; background: #f8fafc; border-radius: 12px; margin: 20px 0;">
                <div style="font-size: 60px;">${escape(gift.emoji)}</div>
                <p style="font-size: 18px; font-weight: bold; margin: 8px 0;">${escape(gift.name)}</p>
                <p style="font-size: 12px; color: #64748b; margin: 0;">Valeur : ${escape(gift.price)} crédits</p>
            </div>
            ${message ? '<p style="font-style: italic; color: #64748b;">"' + escape(message) + '"</p>' : ''}
            `,
            'Voir le chat',
            siteUrl + '/chat.html'
        ),
        text: senderUsername + ' t\'a envoyé ' + gift.name + ' !'
    });
}

module.exports = {
    sendMail,
    emailTemplate,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendModeratorAlert,
    sendCreditsPurchaseEmail,
    sendGiftNotificationEmail,
    isEnabled: () => enabled
};