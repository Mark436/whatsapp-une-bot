import path from 'path'
import logger from './logger'
import playwrightManager from './playwrightManager'
import routeCache from './routeCache'
import { InputError, ScraperError } from './errors'

import { FIFOQueue } from './utils'

const UNE_URL = 'https://unesonora.com/'
const IMAGES_DIR = path.join(__dirname, 'camiones')

// Inicializa la cola FIFO para que todas las operaciones de scraping sean 1 por 1
const taskQueue = new FIFOQueue()

/**
 * Acepta el modal de privacidad si aparece
 */
/**
 * Acepta el modal de privacidad si aparece o lo destruye a la fuerza
 */
/**
 * Espera y acepta el modal de privacidad siguiendo el flujo natural de la web
 */
async function aceptarPrivacidad(page) {
  const boton = page.getByRole('button', {
    name: 'He leído y acepto el Aviso de Privacidad',
  })
  const modal = page.locator('[data-testid="TermsModal"]')
  // Usamos el selector exacto que te dio el error en los logs
  const backdrop = page.locator('.modalBase_backdrop__3Y-Zy')

  try {
    // 1. Damos 3 segundos para que aparezca el botón (por si la conexión es lenta)
    await boton.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {})

    if (await boton.isVisible()) {
      // 2. Hacemos clic. Usamos force por si hay animaciones ejecutándose
      await boton.click({ force: true })

      // 3. Esperamos estrictamente a que el modal y su fondo gris desaparezcan
      await modal.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
      await backdrop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})

      // 4. Una pausa minúscula de seguridad para asegurar que el DOM se estabilizó
      await page.waitForTimeout(500)
    }
  } catch (error) {
    console.error(error)
  }
}
/**
 * Abre la página y espera a que estén disponibles las rutas
 */
async function prepararPagina(page) {
  await page.goto(UNE_URL, { waitUntil: 'domcontentloaded' })
  await aceptarPrivacidad(page)
  await page.waitForSelector('.mapRoutesSidebar_body-list__1sd3l li button', {
    timeout: 15000,
  })
}

/**
 * Obtiene todas las rutas visibles
 */
async function extraerNombresRutas(page) {
  return page
    .locator('.mapRoutesSidebar_body-list__1sd3l li button')
    .evaluateAll((btns) => btns.map((btn) => btn.textContent.trim()).filter(Boolean))
}

/**
 * Tarea privada: forzar scrapeo de rutas
 */
async function _scrapeRutas() {
  logger.info('Inicio del scraper: extrayendo lista de rutas')
  const page = await playwrightManager.getBrowserPage()

  try {
    await prepararPagina(page)
    const rutas = await extraerNombresRutas(page)
    logger.info(`Fin del scraper: ${rutas.length} rutas encontradas`)
    return rutas
  } catch (error) {
    throw new ScraperError('No se pudo obtener la lista de rutas del sitio', {
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
  let rutasDisponibles = routeCache.getRutas()

  // Si no hay caché, descargar las rutas primero
  if (!rutasDisponibles || rutasDisponibles.length === 0) {
    rutasDisponibles = await _scrapeRutas()
    routeCache.setRutas(rutasDisponibles)
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
async function obtenerRutas(force = false) {
  return taskQueue.add(async () => {
    if (!force) {
      const cached = routeCache.getRutas()
      if (cached && cached.length > 0) {
        return cached.map((r) => `• ${r}`).join('\n')
      }
    }

    const rutas = await _scrapeRutas()
    routeCache.setRutas(rutas)
    return rutas.map((r) => `• ${r}`).join('\n')
  })
}

/**
 * Toma screenshot de una ruta específica
 */
async function watchRoute(ruta) {
  return taskQueue.add(async () => {
    logger.info(`Inicio del scraper: procesando solicitud para "${ruta}"`)

    // Obtenemos el nombre tal cual está en la web (case sensitive) sin abrir el DOM
    const nombreRutaExacto = await buscarRutaExacta(ruta)
    logger.info(`Match encontrado en caché: "${nombreRutaExacto}"`)

    const page = await playwrightManager.getBrowserPage()

    try {
      await prepararPagina(page)

      const botonMenuVerRutas = await page.locator('button:has-text("Ver una línea")')
      if (await botonMenuVerRutas.isVisible().catch(() => false)) {
        await botonMenuVerRutas.click()
        await page.waitForTimeout(1000) // Esperamos 1 segundo a que la barra lateral termine de deslizarse
      }

      // Usamos text-is para que Playwright busque el botón con el texto idéntico y exacto
      const botonRuta = page.locator(
        `.mapRoutesSidebar_body-list__1sd3l button:text-is("${nombreRutaExacto}")`
      )
      const existe = await botonRuta.count()

      if (!existe) {
        logger.warn(`Cuando falla una ruta: Ruta "${nombreRutaExacto}" no encontrada en el DOM`)
        const rutasActualizadas = await extraerNombresRutas(page)
        routeCache.setRutas(rutasActualizadas)

        throw new InputError(
          `Ruta "${nombreRutaExacto}" no encontrada actualmente en el sistema.`,
          {
            visible: true,
            rutas: rutasActualizadas.map((r) => `• ${r}`).join('\n'),
          }
        )
      }

      logger.info(`Cuando una ruta se encuentra: Preparando captura para "${nombreRutaExacto}"`)
      await botonRuta.first().click()
      await page.waitForTimeout(3000) // Dar tiempo a marcadores y trazado en el mapa

      const filePath = path.join(
        IMAGES_DIR,
        `${nombreRutaExacto.replace(/\s+/g, '_')}_${Date.now()}.jpg`
      )
      await page.screenshot({ path: filePath, fullPage: true })

      logger.info(`Fin del scraper: captura guardada temporalmente en ${filePath}`)
      return filePath
    } catch (error) {
      if (error instanceof InputError) throw error
      throw new ScraperError(`Error al capturar la ruta "${nombreRutaExacto}"`, { cause: error })
    }
  })
}

module.exports = {
  obtenerRutas,
  watchRoute,
}
