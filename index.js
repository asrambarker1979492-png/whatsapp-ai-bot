 require('dotenv').config();
const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    Browsers,
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// ---------------------------------------------------------------------
// உங்கள் வாட்ஸ்அப் எண் (Country Code உடன்)
// ---------------------------------------------------------------------
const PHONE_NUMBER = "94751294924"; 

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getAIResponse(prompt) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-3.6-flash" });
        const result = await model.generateContent(prompt);
        return result.response.text();
    } catch (error) {
        console.error("AI பிழை விவரம்:", error.message);
        return "மன்னிக்கவும், தற்சமயம் என்னால் பதில் அளிக்க முடியவில்லை.";
    }
}

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: Browsers.ubuntu("Chrome"),
        syncFullHistory: false
    });

    sock.ev.on('creds.update', saveCreds);

    let isCodeRequested = false;

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR தோன்றும் கட்டத்தில் Pairing Code-ஐக் கோருதல்
        if (qr && !sock.authState.creds.registered && !isCodeRequested) {
            isCodeRequested = true;
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(PHONE_NUMBER);
                    console.log(`\n==================================================`);
                    console.log(`உங்கள் WhatsApp இணைப்பு கோட் (Pairing Code): ${code}`);
                    console.log(`==================================================\n`);
                } catch (err) {
                    console.error("Pairing Code பெறுவதில் பிழை:", err);
                }
            }, 3000);
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('WhatsApp வெற்றிகரமாக இணைக்கப்பட்டது!');
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];

        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const textMessage = msg.message.conversation || msg.message.extendedTextMessage?.text;

        if (textMessage) {
            console.log(`பெறப்பட்ட மெசேஜ் (${sender}): ${textMessage}`);
            const aiReply = await getAIResponse(textMessage);
            await sock.sendMessage(sender, { text: aiReply }, { quoted: msg });
        }
    });
}

connectToWhatsApp();