const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { watchRoute, obtenerRutas } = require('./rutas');
const path = require('path');

const client = new Client({
  authStrategy: new LocalAuth(),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
  },
  puppeteer: {
    headless: true,
    executablePath: '/usr/bin/chromium',
    timeout: 60000,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ]
  }
});

// ── Eventos de conexión ──
client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('📱 Escanea el QR con WhatsApp');
});

client.on('loading_screen', (percent, message) => {
  console.log('⏳ Cargando:', percent, '%', message);
});

client.on('authenticated', () => {
  console.log('🔐 Autenticado correctamente');
});

client.on('auth_failure', msg => {
  console.error('❌ Error de autenticación:', msg);
});

client.on('ready', () => {
  console.log('✅ Bot de WhatsApp listo');
});

client.on('disconnected', reason => {
  console.warn('⚠️ Bot desconectado:', reason);
});

// ── Manejo de mensajes ──
client.on('message', async msg => {
  const body = msg.body.trim();
  const lower = body.toLowerCase();

  // ── Comando: !ruta <nombre> ──
  if (lower.startsWith('!ruta ')) {
    const ruta = body.slice(6).trim();

    if (!ruta) {
      await msg.reply('⚠️ Debes indicar el nombre de la ruta.\nEjemplo: *!ruta 1*');
      return;
    }

    await msg.reply(`🔍 Buscando la ruta *"${ruta}"*, espera un momento...`);

    try {
      const fileName = await watchRoute(ruta, './camiones/');
      const filePath = path.join('./camiones/', fileName);

      const media = MessageMedia.fromFilePath(filePath);
      await client.sendMessage(msg.from, media, {
        caption: `🚌 Ruta *${ruta}* - Estado actual`,
      });

    } catch (error) {
      if (error.visible) {
        await msg.reply(
          `❌ Ruta *"${ruta}"* no encontrada.\n\n📋 *Rutas disponibles:*\n${error.rutas}`
        );
      } else {
        console.error('[Bot] Error en !ruta:', error.message);
        await msg.reply('⚠️ Ocurrió un error al obtener la ruta. Intenta más tarde.');
      }
    }
    return;
  }

  // ── Comando: !rutas ──
  if (lower === '!rutas') {
    await msg.reply('🔍 Obteniendo lista de rutas...');

    try {
      const lista = await obtenerRutas();
      await msg.reply(`🗺️ *Rutas disponibles:*\n\n${lista}`);
    } catch (error) {
      console.error('[Bot] Error en !rutas:', error.message);
      await msg.reply('⚠️ No se pudo obtener la lista de rutas. Intenta más tarde.');
    }
    return;
  }

  // ── Comando: !ayuda ──
  if (lower === '!ayuda' || lower === '!help') {
    await msg.reply(
      `🤖 *Bot de Rutas UNE Sonora*\n\n` +
      `📋 *Comandos disponibles:*\n\n` +
      `*!ruta <nombre>* — Ver estado de una ruta\n` +
      `_Ejemplo: !ruta 1_\n\n` +
      `*!rutas* — Ver todas las rutas disponibles\n\n` +
      `*!ayuda* — Ver este mensaje`
    );
    return;
  }
});

// ── Iniciar el bot ──
client.initialize();