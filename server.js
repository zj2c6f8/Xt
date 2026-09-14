const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

let botSock;
let userSessions = {};

// 1. ඔයාගේ Main Bot Number එක (+94743646051) Start කිරීම
async function startMainBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth_bot');
    const { version } = await fetchLatestBaileysVersion();

    botSock = makeWASocket({
        version,
        auth: state,
        logger: pino({ level: 'silent' })
    });

    botSock.ev.on('creds.update', saveCreds);
    
    botSock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('Main OTP Bot Active on +94743646051');
        }
    });
}
startMainBot();

// 2. User ට OTP (Pairing Code) යවන සහ Connect කරන API Endpoint
app.post('/api/connect-user', async (req, res) => {
    const { userPhone } = req.body;
    if (!userPhone) return res.status(400).json({ error: 'Phone number is required' });

    try {
        const sessionPath = `./auth_user_${userPhone}`;
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
        
        const userSock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: false
        });

        userSock.ev.on('creds.update', saveCreds);

        // Pairing Code එක Generate කිරීම
        setTimeout(async () => {
            if (!userSock.authState.creds.registered) {
                const code = await userSock.requestPairingCode(userPhone);
                
                // ඔයාගේ Main Bot (+94743646051) එකෙන් User ගේ WhatsApp එකට Code එක යැවීම
                const formattedNum = userPhone.replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                await botSock.sendMessage(formattedNum, { text: `🔑 ඔයාගේ Verification Code එක: *${code}*` });

                userSessions[userPhone] = userSock;
                res.json({ success: true, message: 'OTP sent to user WhatsApp!', code: code });
            }
        }, 3000);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. User ගේ Incoming Messages බැලීම
app.get('/api/messages/:phone', (req, res) => {
    const userSock = userSessions[req.params.phone];
    if (!userSock) return res.status(404).json({ error: 'Session not active' });

    userSock.ev.on('messages.upsert', async ({ messages }) => {
        res.json({ messages });
    });
});

app.listen(3000, () => console.log('Server running on port 3000'));
