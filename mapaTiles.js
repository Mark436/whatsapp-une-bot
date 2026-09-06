/**
 * Fondo de mapa de calles (tiles Web Mercator) para los mapas SVG del bot.
 *
 * Calcula el bbox de un conjunto de puntos (recorrido + paradas + unidades
 * activas), elige un zoom que quepa en el canvas con pocos tiles (máx. 9) y
 * descarga las imágenes desde un servidor de tiles, con caché en disco bajo
 * `camiones/tiles/`. Devuelve las capas listas para `rutaASvg(..., { base })`:
 * cada una con su rectángulo en píxeles del canvas (misma proyección Mercator
 * que `svgMapa.js`, así los tiles cuadran exactamente debajo del recorrido).
 *
 * Fuentes por defecto: Esri World Street Map (etiquetas de calles, sin key) y,
 * como respaldo, OSM estándar. Si no se puede bajar ningún tile, devuelve
 * `null` y el mapa cae al fondo plano.
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ajustarEscala, mercatorX, mercatorY } from './svgMapa.js'

const MAX_TILES = 16
const MAX_ZOOM = 18
const DIR_CACHE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'camiones', 'tiles')

const FUENTES = [
  {
    nombre: 'esri',
    tipo: 'image/jpeg',
    ext: 'jpg',
    tileUrl: (z, x, y) =>
      `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}.png`,
  },
  {
    nombre: 'osm',
    tipo: 'image/png',
    ext: 'png',
    tileUrl: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    cabeceras: { 'User-Agent': 'whatsapp-une-bot (uso no comercial)' },
  },
]

/** Índices de tile (x, y) que cubren una coordenada Mercator normalizada. */
function tileDeMercator(nx, ny, z) {
  const n = 2 ** z
  return {
    x: Math.min(Math.max(Math.floor(nx * n), 0), n - 1),
    y: Math.min(Math.max(Math.floor(ny * n), 0), n - 1),
  }
}

/**
 * El zoom más alto cuyo rectángulo de tiles (contando el bbox) no supera
 * `maxTiles`. A más zoom, más nombres de calles; a menos, menos tiles.
 */
function elegirZoom(bbox, maxTiles) {
  for (let z = MAX_ZOOM; z >= 0; z--) {
    const n = 2 ** z
    const countX = Math.floor(bbox.maxX * n) - Math.floor(bbox.minX * n) + 1
    const countY = Math.floor(bbox.maxY * n) - Math.floor(bbox.minY * n) + 1
    if (countX * countY <= maxTiles) return z
  }
  return 0
}

async function existeRuta(ruta) {
  try {
    await access(ruta)
    return true
  } catch {
    return false
  }
}

/** Devuelve el tile desde la caché (null si no está), con su MIME/ext. */
async function leerCache(z, x, y, dirCache) {
  const exts = ['png', 'jpg']
  for (const ext of exts) {
    const ruta = path.join(dirCache, String(z), String(y), `${x}.${ext}`)
    if (!(await existeRuta(ruta))) continue
    return {
      buf: await readFile(ruta),
      tipo: ext === 'png' ? 'image/png' : 'image/jpeg',
      ext,
    }
  }
  return null
}

/** Descarga el tile de una fuente; devuelve el PNG/JPEG o null si falla. */
async function descargarTile(fuentes, z, x, y) {
  for (const fuente of fuentes) {
    const url = fuente.tileUrl(z, x, y)
    let res
    try {
      res = await fetch(url, { headers: fuente.cabeceras ?? {} })
    } catch {
      continue
    }
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    // Descarta tiles "placeholder" diminutos que algunos servidores devuelven.
    if (buf.length < 200) continue
    return { buf, tipo: fuente.tipo, ext: fuente.ext }
  }
  return null
}

/**
 * Obtiene la capa `base` para `rutaASvg` dado un conjunto de puntos
 * `{ lat, lng }` y las dimensiones del canvas.
 *
 * Devuelve `[{ x, y, width, height, dataUrl }]` o `null` si no se pudo
 * descargar ningún tile (o no hay puntos).
 */
export async function obtenerTilesBase(puntos, dimensiones, opciones = {}) {
  if (!puntos || puntos.length === 0) return null
  const maxTiles = opciones.maxTiles ?? MAX_TILES
  const dirCache = opciones.dirCache ?? DIR_CACHE
  const fuentes = opciones.fuentes ?? FUENTES

  try {
    const t = ajustarEscala(
      puntos.map((p) => ({ x: mercatorX(p.lng), y: mercatorY(p.lat) })),
      dimensiones.width,
      dimensiones.height
    )

    const zoom = elegirZoom(t, maxTiles)
    const n = 2 ** zoom
    const minTx = tileDeMercator(t.minX, t.minY, zoom).x
    const maxTx = tileDeMercator(t.maxX, t.maxY, zoom).x
    const minTy = tileDeMercator(t.minX, t.minY, zoom).y
    const maxTy = tileDeMercator(t.maxX, t.maxY, zoom).y

    const capas = []
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        let tile = await leerCache(zoom, tx, ty, dirCache)
        if (!tile) {
          const desc = await descargarTile(fuentes, zoom, tx, ty)
          if (!desc) continue
          const fileName = path.join(dirCache, String(zoom), String(ty), `${tx}.${desc.ext}`)
          await mkdir(path.dirname(fileName), { recursive: true })
          await writeFile(fileName, desc.buf).catch(() => {})
          tile = desc
        }

        // Rectángulo del tile en píxeles del canvas (misma transformación que
        // el render: Mercator normalizado → px). Fuera del canvas se recorta solo.
        const nx0 = tx / n
        const ny0 = ty / n
        const nx1 = (tx + 1) / n
        const ny1 = (ty + 1) / n
        capas.push({
          x: t.offX + nx0 * t.escala,
          y: t.offY + ny0 * t.escala,
          width: (nx1 - nx0) * t.escala,
          height: (ny1 - ny0) * t.escala,
          dataUrl: `data:${tile.tipo};base64,${tile.buf.toString('base64')}`,
        })
      }
    }

    return capas.length > 0 ? capas : null
  } catch {
    // Cualquier fallo (red, permisos, formato) → sin fondo: mapa plano.
    return null
  }
}
