console.log('HOLA')

const fs = require('fs');
const path = require('path');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { watchRoute, obtenerRutas } = require('./rutas');
const { InputError } = require('./errors');

const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, 'camiones');

function limpiarCache(dir) {
  fs.mkdirSync(dir, { recursive: true });

  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith('.jpg')) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function eliminarArchivo(filePath) {
  if (!filePath) return;

  fs.unlink(filePath, err => {
    if (err && err.code !== 'ENOENT') {
      console.warn('[Bot] No se pudo eliminar archivo temporal:', filePath, err.message);
    }
  });
}

limpiarCache(CACHE_DIR);

const client = new Client({
  authStrategy: new LocalAuth(),

  // ✅ FIX PRINCIPAL: eliminar webVersionCache

  puppeteer: {
    headless: 'new',
    timeout: 60000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-zygote",
    ]
  }
});

// ---------------- EVENTS ----------------

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

// ---------------- MESSAGES ----------------

client.on('message', async msg => {
  const body = msg.body.trim();
  const lower = body.toLowerCase();

  if (lower.startsWith('!ruta ')) {
    const ruta = body.slice(6).trim();

    if (!ruta) {
      await msg.reply('⚠️ Debes indicar el nombre de la ruta.\nEjemplo: *!ruta 1*');
      return;
    }

    await msg.reply(`🔍 Buscando la ruta *"${ruta}"*, espera un momento...`);

    let filePath;

    try {
      filePath = await watchRoute(ruta, CACHE_DIR);

      const media = MessageMedia.fromFilePath(filePath);
      await client.sendMessage(msg.from, media, {
        caption: `🚌 Ruta *${ruta}* - Estado actual`,
      });

    } catch (error) {
      if (error instanceof InputError && error.visible) {
        await msg.reply(
          `❌ Ruta *"${ruta}"* no encontrada.\n\n📋 *Rutas disponibles:*\n${error.rutas}`
        );
      } else {
        console.error('[Bot] Error en !ruta:', error);
        await msg.reply('⚠️ Ocurrió un error al obtener la ruta. Intenta más tarde.');
      }
    } finally {
      eliminarArchivo(filePath);
    }

    return;
  }

  if (lower === '!rutas') {
    await msg.reply('🔍 Obteniendo lista de rutas...');

    try {
      const lista = await obtenerRutas();
      await msg.reply(`🗺️ *Rutas disponibles:*\n\n${lista}`);
    } catch (error) {
      console.error('[Bot] Error en !rutas:', error);
      await msg.reply('⚠️ No se pudo obtener la lista de rutas. Intenta más tarde.');
    }

    return;
  }

  if (lower === '!ayuda' || lower === '!help') {
    await msg.reply('🔍 Cargando ayuda y rutas disponibles...');

    try {
      const lista = await obtenerRutas();
      await msg.reply(
        `🤖 *Bot de Rutas UNE Sonora*\n\n` +
        `📋 *Comandos disponibles:*\n\n` +
        `*!ruta <nombre>* — Ver estado de una ruta\n` +
        `_Ejemplo: !ruta 1_\n\n` +
        `*!rutas* — Ver todas las rutas disponibles\n\n` +
        `*!ayuda* — Ver este mensaje\n\n` +
        `🗺️ *Rutas disponibles:*\n\n${lista}`
      );
    } catch (error) {
      console.error('[Bot] Error en !ayuda:', error);
      await msg.reply(
        `🤖 *Bot de Rutas UNE Sonora*\n\n` +
        `📋 *Comandos disponibles:*\n\n` +
        `*!ruta <nombre>* — Ver estado de una ruta\n` +
        `_Ejemplo: !ruta 1_\n\n` +
        `*!rutas* — Ver todas las rutas disponibles\n\n` +
        `*!ayuda* — Ver este mensaje\n\n` +
        `⚠️ No se pudo cargar la lista de rutas en este momento. Usa *!rutas* más tarde.`
      );
    }

    return;
  }
});
setTimeout(()=>{
  client.initialize();
},10000)