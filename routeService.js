import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { UneApiClient } from 'une-api-client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import logger from './logger.js'
import { getRutas, setRutas } from './routeCache.js'
import { InputError, ScraperError } from './errors.js'
import { rutaASvg } from './svgMapa.js'

import { FIFOQueue } from './utils.js'

const IMAGES_DIR = path.join(__dirname, 'camiones')
const DIMENSIONES_MAPA = { width: 1200, height: 900 }

// Cliente único de la API de UNE (auth anónima de Firebase automática).
const client = new UneApiClient()

// Inicializa la cola FIFO para que todas las operaciones sean 1 por 1
const taskQueue = new FIFOQueue()

/**
 * Obtiene todas las rutas desde la API de UNE (listarRutas -> nombres).
 */
async function _listarRutasDesdeApi() {
  logger.info('Inicio: descargando lista de rutas de la API de UNE')
  try {
    const rutas = await client.listarRutas()
    const nombres = rutas.map((r) => r.nombre)
    logger.info(`Fin: ${nombres.length} rutas encontradas desde la API`)
    return nombres
  } catch (error) {
    throw new ScraperError('No se pudo obtener la lista de rutas de la API', {
      cause: error,
    })
  }
}

/**
 * Limpia el texto ignorando mayúsculas y palabras clave innecesarias (linea, ruta)
 */
function limpiarTextoBusqueda(texto) {
  return String(texto)
    .toLowerCase()
    .replace(/\b(línea|linea|ruta)\b/g, '') // Ignora estas palabras
    .trim()
    .replace(/\s+/g, ' ') // Elimina espacios dobles
}

/**
 * Busca inteligentemente la ruta solicitada en el caché.
 * Si encuentra varias, pide aclaración. Si encuentra una, devuelve el nombre exacto.
 */
async function buscarRutaExacta(inputUsuario) {
  let rutasDisponibles = getRutas()

  // Si no hay caché, descargar las rutas primero
  if (!rutasDisponibles || rutasDisponibles.length === 0) {
    rutasDisponibles = await _listarRutasDesdeApi()
    setRutas(rutasDisponibles)
  }

  const inputLimpio = limpiarTextoBusqueda(inputUsuario)

  // Buscar coincidencias (exactas o si la ruta contiene el número/palabra que se buscó)
  const coincidencias = rutasDisponibles.filter((ruta) => {
    const rutaLimpia = limpiarTextoBusqueda(ruta)
    return rutaLimpia === inputLimpio || rutaLimpia.includes(inputLimpio)
  })

  if (coincidencias.length === 0) {
    throw new InputError(`No encontré ninguna ruta que coincida con "${inputUsuario}".`, {
      visible: true,
      rutas: rutasDisponibles.map((r) => `• ${r}`).join('\n'),
    })
  }

  if (coincidencias.length > 1) {
    // Si hay varias coincidencias (ej. "18 A" y "18 B"), verificamos si por casualidad
    // hay una coincidencia exacta de todas formas.
    const coincidenciaExacta = coincidencias.find((r) => limpiarTextoBusqueda(r) === inputLimpio)
    if (coincidenciaExacta) return coincidenciaExacta

    // Si no hay una exacta, devolvemos el error con la lista de opciones reducida
    throw new InputError(`Hay varias rutas parecidas a "${inputUsuario}". ¿Cuál de estas buscas?`, {
      visible: true,
      rutas: coincidencias.map((r) => `• ${r}`).join('\n'),
    })
  }

  // Si solo hubo una coincidencia, es un "match" perfecto
  return coincidencias[0]
}

/**
 * Obtiene las rutas (usa caché si está disponible, a menos que force = true)
 */
export async function obtenerRutas(force = false) {
  return taskQueue.add(async () => {
    if (!force) {
      const cached = getRutas()
      if (cached && cached.length > 0) {
        return cached.map((r) => `• ${r}`).join('\n')
      }
    }

    const rutas = await _listarRutasDesdeApi()
    setRutas(rutas)
    return rutas.map((r) => `• ${r}`).join('\n')
  })
}

/**
 * Genera el mapa (SVG -> PNG) de una ruta consultando la API de UNE.
 */
export async function watchRoute(ruta) {
  return taskQueue.add(async () => {
    logger.info(`Inicio: procesando solicitud para "${ruta}"`)

    // Obtenemos el nombre tal cual está en la API (case sensitive) sin abrir el DOM
    const nombreRutaExacto = await buscarRutaExacta(ruta)
    logger.info(`Match encontrado en caché: "${nombreRutaExacto}"`)

    try {
      logger.info(`Cuando una ruta se encuentra: Consultando datos de "${nombreRutaExacto}"`)
      const info = await client.consultarRuta(nombreRutaExacto)

      if (!info) {
        const rutasDisponibles = getRutas() ?? (await _listarRutasDesdeApi())
        throw new InputError(
          `Ruta "${nombreRutaExacto}" no encontrada actualmente en el sistema.`,
          {
            visible: true,
            rutas: rutasDisponibles.map((r) => `• ${r}`).join('\n'),
          }
        )
      }

      logger.info(
        `paradas: ${info.paradas.length} | unidades: ${info.camiones.length} | recorrido: ${info.ruta.recorrido.length} pts`
      )

      const svg = rutaASvg(info.ruta, info.paradas, info.camiones, DIMENSIONES_MAPA)
      const filePath = path.join(
        IMAGES_DIR,
        `${nombreRutaExacto.replace(/\s+/g, '_')}_${Date.now()}.png`
      )
      await sharp(Buffer.from(svg)).png().toFile(filePath)

      logger.info(`Fin: mapa generado temporalmente en ${filePath}`)
      return filePath
    } catch (error) {
      if (error instanceof InputError) throw error
      throw new ScraperError(`Error al generar el mapa de "${nombreRutaExacto}"`, {
        cause: error,
      })
    }
  })
}
