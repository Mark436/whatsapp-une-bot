import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

import qrcode from 'qrcode-terminal'
import logger from './logger.js'
import { limpiarDirectorio } from './utils.js'
import { handleCommands } from './commands.js'
import { closeBrowser } from './playwrightManager.js'
import whatsappWebPackage from 'whatsapp-web.js'
const { Client, LocalAuth } = whatsappWebPackage
const CACHE_DIR_IMAGES = path.join(__dirname, 'camiones')

// Limpiar basura anterior al arrancar
limpiarDirectorio(CACHE_DIR_IMAGES, '.jpg')

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    timeout: 60000,
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
  await closeBrowser()
  process.exit(0)
})

client.initialize()
