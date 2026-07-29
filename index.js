const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');

const app = express();
app.use(express.json());

let sock;
let qrCodeGlobal = '';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) qrCodeGlobal = qr;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) connectToWhatsApp();
        } else if (connection === 'open') {
            console.log('¡Conectado exitosamente en la nube!');
            qrCodeGlobal = '';
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Endpoint HTTP para que tu Lightsail le mande el mensaje
app.post('/enviar-mensaje', async (req, res) => {
    const { numero, mensaje } = req.body;
    try {
        if (!sock) return res.status(500).json({ error: 'Bot no inicializado' });
        const jid = `${numero}@s.whatsapp.net`;
        await sock.sendMessage(jid, { text: mensaje });
        res.json({ success: true, message: 'Mensaje enviado' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Ruta para ver el estado o escanear el QR inicialmente desde la web de Render/Railway
app.get('/', (req, res) => {
    res.send(qrCodeGlobal ? `Escanea este QR con WhatsApp: ${qrCodeGlobal}` : 'Bot conectado y activo.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en puerto ${PORT}`);
    connectToWhatsApp();
});