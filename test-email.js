require('dotenv').config();
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
sgMail.send({ to: 'robert.seb42@gmail.com', from: 'robert.seb42@gmail.com', subject: 'Test SendGrid E-VISIOCAM', text: 'Ceci est un test !' }).then(() => console.log('SUCCES - Email envoye !')).catch(e => { console.error('ERREUR:', e.message); if (e.response && e.response.body) console.error(JSON.stringify(e.response.body, null, 2)); });
