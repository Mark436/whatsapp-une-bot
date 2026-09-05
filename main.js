import path from 'path'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import qrcode from 'qrcode-terminal'
import logger from './logger.js'
import { limpiarDirectorio } from './utils.js'
import { handleCommands } from './commands.js'
import whatsappWebPackage from 'whatsapp-web.js'
const { Client, LocalAuth } = whatsappWebPackage
const CACHE_DIR_IMAGES = path.join(__dirname, 'camiones')
whatsappWebPackage.ClientOptions

/**
 * Resuelve un ejecutable de Chromium para puppeteer.
 * Prioridad: env CHROME_PATH > rutas de sistema conocidas (Chrome/Edge) >
 * default de puppeteer. En Linux (Docker) esas rutas no existen y se usa el
 * Chrome de puppeteer que ya viene en la imagen.
 */
function resolverChrome() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe')
      : null,
  ].filter(Boolean)
  return candidatos.find((c) => existsSync(c))
}

// Limpiar basura anterior al arrancar
limpiarDirectorio(CACHE_DIR_IMAGES, '.png')

const chromePath = resolverChrome()
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    timeout: 60000,
    ...(chromePath ? { executablePath: chromePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-first-run',
      '--no-zygote',
    ],
  },
})

logger.info('Cuando se inicia el bot: Inicializando instancia de WhatsApp Web...')

// ---------------- EVENTS ----------------

client.on('qr', (qr) => {
  logger.info('QR generado, esperando escaneo...')
  qrcode.generate(qr, { small: true })
  console.warn('\n📱 Escanea el QR superior con tu aplicación de WhatsApp')
})

client.on('loading_screen', (percent, message) => {
  logger.info(`Cargando WhatsApp: ${percent}% - ${message}`)
})

client.on('authenticated', () => {
  logger.info('Cuando se autentica WhatsApp: Autenticación exitosa.')
})

client.on('auth_failure', (msg) => {
  logger.error(`Error crítico de autenticación en WhatsApp: ${msg}`)
})

client.on('ready', () => {
  logger.info('WhatsApp Bot listo y escuchando mensajes.')
})

client.on('disconnected', (reason) => {
  logger.warn(`Cuando se desconecta: Bot desconectado por la razón: ${reason}`)
})

// ---------------- MESSAGES ----------------

client.on('message_create', async (msg) => {
  try {
    await handleCommands(msg)
  } catch (error) {
    logger.error('Error crítico no manejado al procesar mensaje', error.stack)
  }
})

// Manejo de apagado correcto del bot
process.on('SIGINT', async () => {
  logger.info('Apagando bot manualmente...')
  await client.destroy().catch(() => {})
  process.exit(0)
})

// La página de web.whatsapp.com a veces se recarga justo cuando wwebjs está
// inyectando su script ("Execution context was destroyed"). Eso es transitorio
// (p. ej. tras un perfil sin sesión validada que deriva a ?post_logout=1), así
// que se reintenta: destroy() y vuelve a initialize().
async function iniciar() {
  const INTENTOS = 3
  for (let intento = 1; intento <= INTENTOS; intento++) {
    try {
      await client.initialize()
      return
    } catch (error) {
      logger.warn(`Intento ${intento}/${INTENTOS} de inicializar falló: ${error.message}`)
      if (intento === INTENTOS) {
        logger.error('No se pudo inicializar el bot tras varios intentos.')
        process.exit(1)
      }
      await client.destroy().catch(() => {})
      await new Promise((resolve) => setTimeout(resolve, 1500 * intento))
    }
  }
}

iniciar()
