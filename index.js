const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const express = require('express');
const qrcode = require('qrcode');

const app = express();
app.use(express.json());

let sock;
let qrCodeData = '';
let connectionStatus = 'Desconectado / Esperando QR';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');
    
    sock = makeWASocket({
        logger: pino({ level: 'silent' }),
        auth: state
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            qrCodeData = qr;
            connectionStatus = 'Escanea el código QR';
            // También lo imprime en los logs de Render por si acaso
            console.log('Nuevo QR generado. Escanéalo en la web.');
        }
        
        if (connection === 'close') {
            connectionStatus = 'Conexión cerrada. Reconectando...';
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                setTimeout(connectToWhatsApp, 5000);
            }
        } else if (connection === 'open') {
            connectionStatus = '¡Bot conectado y activo!';
            qrCodeData = '';
            console.log('¡Conectado exitosamente a WhatsApp!');
        }
    });

    sock.ev.on('creds.update', saveCreds);
}

// Endpoint para enviar mensajes desde tu servidor Lightsail
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

// Página web principal que muestra el QR visualmente para escanear
app.get('/', async (req, res) => {
    if (qrCodeData) {
        try {
            const urlQrImg = await qrcode.toDataURL(qrCodeData);
            res.send(`
                <div style="text-align:center; font-family:sans-serif; margin-top:50px;">
                    <h2>Escanea este código QR con tu WhatsApp</h2>
                    <img src="${urlQrImg}" alt="Código QR WhatsApp" style="width:300px; height:300px;"/>
                    <p>Actualiza la página si el código expira.</p>
                </div>
            `);
        } catch (err) {
            res.send('Error generando la imagen del QR');
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
    console.log(`Servidor corriendo en puerto ${PORT}`);
    connectToWhatsApp();
});
