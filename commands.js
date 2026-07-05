import whatsappWebPackage from 'whatsapp-web.js'
import logger from './logger.js'
import { watchRoute, obtenerRutas } from './routeService.js'
import { clearCache } from './routeCache.js'
import { eliminarArchivo } from './utils.js'
import { InputError } from './errors.js'

const { MessageMedia } = whatsappWebPackage

async function extraerInfoContacto(msg) {
  try {
    const contact = await msg.getContact()
    const chat = await msg.getChat()
    return {
      nombre: contact.pushname || contact.name || 'Desconocido',
      numero: contact.number || 'SinNúmero',
      chatId: chat.id._serialized,
      chat,
    }
  } catch (error) {
    logger.error('Error al extraer información del contacto', error.stack)
    return { nombre: 'Error', numero: 'Error', chatId: 'Error', chat: null }
  }
}

export async function handleCommands(msg) {
  const body = msg.body.trim()
  const lower = body.toLowerCase()

  if (!lower.startsWith('!')) return

  const start = Date.now()
  const { nombre, numero, chatId, chat } = await extraerInfoContacto(msg)

  logger.info(`${nombre} (${numero}) en chat [${chatId}] ejecutó el comando: ${body}`)

  if (chat) {
    await chat.sendSeen()
    await chat.sendStateTyping()
  }

  try {
    if (lower.startsWith('!ruta ')) {
      logger.info('Cuando alguien solicita una captura (!ruta)')
      await handleRuta(msg, body.slice(6).trim())
    } else if (lower === '!rutas') {
      logger.info('Cuando alguien solicita rutas (!rutas)')
      await handleRutas(msg)
    } else if (lower === '!ayuda' || lower === '!help') {
      logger.info('Cuando alguien solicita ayuda (!ayuda)')
      await handleAyuda(msg)
    } else if (lower === '!actualizar') {
      logger.info('Solicitud de actualización manual del caché (!actualizar)')
      await handleActualizar(msg)
    }
  } finally {
    if (chat) {
      await chat.clearState()
    }
    const duration = Date.now() - start
    logger.info(`Comando ${body} completado en ${duration}ms`)
  }
}

async function handleRuta(msg, ruta) {
  if (!ruta) {
    await msg.reply('⚠️ Debes indicar el nombre de la ruta.\nEjemplo: *!ruta 1*')
    return
  }

  await msg.reply(`🔍 Buscando la ruta *"${ruta}"*, espera un momento...`)

  let filePath
  try {
    filePath = await watchRoute(ruta)

    const media = MessageMedia.fromFilePath(filePath)
    await msg.reply(media, undefined, {
      caption: `🚌 Ruta *${ruta}* - Estado actual`,
    })
  } catch (error) {
    if (error instanceof InputError && error.visible) {
      await msg.reply(`❌ ${error.message}\n\n📋 *Opciones:*\n${error.rutas}`)
    } else {
      // AQUÍ: Si el error viene de Playwright, extraemos la causa real
      const realError = error.cause ? error.cause.stack : error.stack
      logger.error(`Error capturando ruta ${ruta}`, realError)

      await msg.reply('⚠️ Ocurrió un error interno al obtener la ruta. Intenta más tarde.')
    }
  } finally {
    eliminarArchivo(filePath)
  }
}

async function handleRutas(msg) {
  try {
    const lista = await obtenerRutas()
    await msg.reply(`🗺️ *Rutas disponibles:*\n\n${lista}`)
  } catch (error) {
    logger.error('Error al obtener lista de rutas', error.stack)
    await msg.reply('⚠️ No se pudo obtener la lista de rutas en este momento.')
  }
}

async function handleAyuda(msg) {
  try {
    const lista = await obtenerRutas()
    await msg.reply(
      `🤖 *Bot de Rutas UNE Sonora*\n\n` +
        `📋 *Comandos disponibles:*\n\n` +
        `*!ruta <nombre>* — Ver estado de una ruta\n` +
        `_Ejemplo: !ruta 1_\n\n` +
        `*!rutas* — Ver todas las rutas (rápido)\n\n` +
        `*!actualizar* — Recargar rutas en sistema\n\n` +
        `*!ayuda* — Ver este mensaje\n\n` +
        `🗺️ *Rutas disponibles:*\n\n${lista}`
    )
  } catch (error) {
    logger.error('Error al cargar la ayuda', error.stack)
    await msg.reply('⚠️ No se pudo cargar la información de ayuda completamente.')
  }
}

async function handleActualizar(msg) {
  try {
    clearCache()
    await obtenerRutas(true)
    await msg.reply('✅ Caché de rutas actualizado correctamente desde el servidor.')
  } catch (error) {
    logger.error('Error forzando actualización de caché', error.stack)
    await msg.reply('⚠️ Hubo un error al actualizar el caché de rutas.')
  }
}
