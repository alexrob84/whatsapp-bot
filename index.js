const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

let sock;
let qrCodeData = '';
let connectionStatus = 'Iniciando conexión...';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = qr;
            connectionStatus = 'Escanea el código QR';
            console.log('QR generado correctamente.');
        }
        
        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`Conexión cerrada. Código: ${statusCode}`);
            
            if (statusCode !== DisconnectReason.loggedOut) {
                connectionStatus = 'Reconectando con WhatsApp...';
                setTimeout(connectToWhatsApp, 5000);
            } else {
                connectionStatus = 'Sesión cerrada por el usuario. Vuelve a escanear el QR.';
                qrCodeData = '';
            }
        } else if (connection === 'open') {
            connectionStatus = '¡Bot conectado y activo!';
            qrCodeData = '';
            console.log('¡Conectado exitosamente!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

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

app.get('/', async (req, res) => {
    if (qrCodeData) {
        try {
            const urlQrImg = await qrcode.toDataURL(qrCodeData);
            res.send(`
                <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                    <h2>Escanea este código QR con tu WhatsApp</h2>
                    <img src="${urlQrImg}" alt="Código QR" style="width:300px; height:300px;"/>
                    <p>Si no se conecta, actualiza la página en unos segundos.</p>
                </div>
            `);
        } catch (err) {
            res.send('Error generando el QR visual');
        }
    } else {
        res.send(`
            <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                <h2>Estado: ${connectionStatus}</h2>
            </div>
        `);
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Servidor en puerto ${PORT}`);
    connectToWhatsApp();
});
