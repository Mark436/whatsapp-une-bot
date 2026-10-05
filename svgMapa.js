/**
 * Render de un mapa simple de una ruta a SVG. Función pura, sin dependencias.
 *
 * Proyecta el recorrido (polilínea), las paradas y los camiones (con su
 * orientación/rumbo) a un canvas SVG. Pensado para convertirse a PNG con
 * `sharp` antes de enviarse por WhatsApp.
 *
 * Recibe los DTOs de `une-api-client` como objetos planos: `ruta` (con
 * `recorrido`, `colorPrimario`, `nombre`), `paradas` (con `ubicacion`) y
 * `camiones` (con `ubicacion`, `rumbo`, `deshabilitado`, `id`).
 *
 * La proyección es **Web Mercator** (la misma que usan los tiles de OSM/Esri),
 * así que un fondo de mapas traído por `mapaTiles.js` (capa `base` de
 * `<image>`) cuadra exactamente bajo el recorrido. Sin fondo, se dibuja un
 * lienzo plano `#eef3f8`.
 */

/** Dimensiones por defecto del canvas de salida. */
const DIMENSIONES_DEFECTO = { width: 800, height: 600 }
const MARGEN = 30
const MARGEN_SUP = 62 // deja libre la franja del título

/** Web Mercator: lng → [0, 1] (normalizado). */
export function mercatorX(lng) {
  return (lng + 180) / 360
}

/** Web Mercator: lat → [0, 1] (normalizado). */
export function mercatorY(lat) {
  const rad = (lat * Math.PI) / 180
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2
}

/**
 * Calcula la transformación que hace caber puntos Mercator normalizados
 * `{x, y}` en el canvas: escala + offsets (offsets = px del bbox al origen).
 * Devuelve también el bbox Mercator, útil para posicionar tiles debajo.
 */
export function ajustarEscala(puntos, width, height) {
  const minX = Math.min(...puntos.map((p) => p.x))
  const maxX = Math.max(...puntos.map((p) => p.x))
  const minY = Math.min(...puntos.map((p) => p.y))
  const maxY = Math.max(...puntos.map((p) => p.y))
  const spanX = Math.max(maxX - minX, 1e-9)
  const spanY = Math.max(maxY - minY, 1e-9)
  const altoUtil = height - MARGEN_SUP - MARGEN
  const escala = Math.min((width - 2 * MARGEN) / spanX, altoUtil / spanY)
  const offX = (width - spanX * escala) / 2 - minX * escala
  const offY = MARGEN_SUP + (altoUtil - spanY * escala) / 2 - minY * escala
  return {
    minX,
    maxX,
    minY,
    maxY,
    escala,
    offX,
    offY,
    // Área Mercator que cubre TODO el canvas (para pedir tiles de borde a borde)
    visMinX: -offX / escala,
    visMaxX: (width - offX) / escala,
    visMinY: -offY / escala,
    visMaxY: (height - offY) / escala,
  }
}

/** Proyección Web Mercator (lat/lng → píxeles), escalada a un cuadro. */
function proyectar(puntos, width, height) {
  const t = ajustarEscala(
    puntos.map((p) => ({ x: mercatorX(p.lng), y: mercatorY(p.lat) })),
    width,
    height
  )
  return puntos.map((p) => ({
    x: t.offX + mercatorX(p.lng) * t.escala,
    y: t.offY + mercatorY(p.lat) * t.escala,
  }))
}

/**
 * Genera un string SVG con el recorrido de la ruta, sus paradas y los camiones
 * (rotados según su rumbo).
 *
 * `opciones.base` (opcional) es una lista de capas de fondo `{ x, y, width,
 * height, dataUrl }` (ver `mapaTiles.js`): se dibujan primero, debajo de todo.
 */
export function rutaASvg(
  ruta,
  paradas,
  camiones,
  dimensiones = DIMENSIONES_DEFECTO,
  opciones = {}
) {
  const { width, height } = dimensiones
  // Solo se dibujan las unidades activas en servicio (descartamos las que la
  // API marca como "disabled"/fuera de servicio, igual que el mapa oficial).
  const camionesActivos = camiones.filter((c) => !c.deshabilitado)
  const todos = [
    ...ruta.recorrido,
    ...paradas.map((p) => p.ubicacion),
    ...camionesActivos.map((c) => c.ubicacion),
  ]

  // Si no hay puntos, devolvemos un lienzo vacío con el nombre.
  if (todos.length === 0) {
    return svgMarco(width, height, ruta.nombre)
  }

  const pts = proyectar(todos, width, height)
  const recIdx = ruta.recorrido.length
  const parIdx = recIdx + paradas.length

  const path = pts
    .slice(0, recIdx)
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const paradasSvg = pts
    .slice(recIdx, parIdx)
    .map((p) => circle(p.x, p.y, 3, '#e74c3c'))
    .join('')

  const posBuses = camionesActivos.map((c, i) => ({ x: pts[parIdx + i].x, y: pts[parIdx + i].y }))
  const camionesSvg = camionesActivos
    .map((c, i) => bus(posBuses[i].x, posBuses[i].y, c.rumbo, c.code, c.accesible))
    .join('')
  const etiquetasSvg = etiquetasCamiones(
    camionesActivos.map((c, i) => ({ ...posBuses[i], texto: etiquetaCorta(c.code) })),
    width,
    height
  )

  const fondoSvg = opciones.base?.length
    ? opciones.base.map(imagen).join('')
    : '<rect width="100%" height="100%" fill="#eef3f8"/>'
  const veloSvg = opciones.base?.length
    ? `<rect width="100%" height="100%" fill="#ffffff" fill-opacity="${VELO_OPACIDAD}"/>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${fondoSvg}
  ${veloSvg}
  <rect x="0" y="0" width="${width}" height="38" fill="#1f2d3d" fill-opacity="0.88"/>
  <text x="${width / 2}" y="26" font-family="sans-serif" font-size="22" font-weight="bold" text-anchor="middle" fill="#ffffff">${esc(ruta.nombre)}</text>
  <text x="14" y="25" font-family="sans-serif" font-size="14" fill="#cfd8e3">${camionesActivos.length} unidades</text>
  <text x="${width - 14}" y="25" font-family="sans-serif" font-size="14" text-anchor="end" fill="#cfd8e3">${new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Hermosillo' })}</text>
  <path d="${path}" fill="none" stroke="${ruta.colorPrimario ?? '#0088ff'}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  ${paradasSvg}
  ${camionesSvg}
  ${etiquetasSvg}
  ${leyenda(height)}
</svg>`
}

const VELO_OPACIDAD = 0.5 // 0 = mapa original, 1 = totalmente blanco
const COLOR_CAMION = '#ff8c00'
const COLOR_ACCESIBLE = '#0d47a1'

/** Leyenda del mapa (esquina inferior izquierda). */
function leyenda(height) {
  const y0 = height - 88
  const flecha = (cy, color) =>
    `<polygon transform="translate(30 ${cy})" points="0,-8 6,7 0,3 -6,7" fill="${color}" stroke="#222" stroke-width="1" stroke-linejoin="round"/>`
  return `
  <g font-family="sans-serif" font-size="13" fill="#222">
    <rect x="12" y="${y0}" width="170" height="76" rx="6" fill="#ffffff" fill-opacity="0.9" stroke="#999" stroke-width="1"/>
    ${flecha(y0 + 18, COLOR_CAMION)}
    <text x="46" y="${y0 + 23}">Camión</text>
    ${flecha(y0 + 40, COLOR_ACCESIBLE)}
    <text x="46" y="${y0 + 45}">Camión accesible</text>
    <circle cx="30" cy="${y0 + 61}" r="3.5" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>
    <text x="46" y="${y0 + 66}">Parada</text>
  </g>`
}

const ETIQUETA_CORTA = true // true: "0107"; false: "SIT-0107"
const ETIQ_ALTO = 15
const ETIQ_ANCHO_CHAR = 7.6

function etiquetaCorta(code) {
  const t = String(code)
  return ETIQUETA_CORTA ? t.replace(/^SIT-/i, '') : t
}

/**
 * Coloca las etiquetas de los camiones sin que se encimen entre sí, con otros
 * íconos, con la franja del título ni con la leyenda. Prueba varias posiciones
 * alrededor de cada ícono y elige la que menos choque.
 */
function etiquetasCamiones(buses, width, height) {
  const choca = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0
  const fijos = [
    { x0: 0, y0: 0, x1: width, y1: 40 }, // franja del título
    { x0: 12, y0: height - 88, x1: 182, y1: height - 12 }, // leyenda
    ...buses.map((b) => ({ x0: b.x - 12, y0: b.y - 14, x1: b.x + 12, y1: b.y + 12 })),
  ]
  const puestas = []
  let svg = ''

  for (const b of buses) {
    const ancho = b.texto.length * ETIQ_ANCHO_CHAR + 6
    const h = ETIQ_ALTO
    const candidatos = [
      { x0: b.x + 13, y0: b.y - 17 }, // derecha, arriba
      { x0: b.x + 13, y0: b.y + 2 }, // derecha, abajo
      { x0: b.x - 13 - ancho, y0: b.y - 17 }, // izquierda, arriba
      { x0: b.x - 13 - ancho, y0: b.y + 2 }, // izquierda, abajo
      { x0: b.x - ancho / 2, y0: b.y - 14 - h }, // arriba
      { x0: b.x - ancho / 2, y0: b.y + 13 }, // abajo
    ].map((c) => ({ ...c, x1: c.x0 + ancho, y1: c.y0 + h }))

    let mejor = candidatos[0]
    let menos = Infinity
    for (const c of candidatos) {
      const fuera = c.x0 < 0 || c.x1 > width || c.y1 > height ? 1000 : 0
      const choques = fuera + fijos.concat(puestas).filter((o) => choca(c, o)).length
      if (choques < menos) {
        menos = choques
        mejor = c
      }
      if (menos === 0) break
    }
    puestas.push(mejor)
    svg += `<text x="${(mejor.x0 + 3).toFixed(1)}" y="${(mejor.y1 - 3).toFixed(1)}" font-family="sans-serif" font-size="12" font-weight="bold" fill="#222" stroke="#ffffff" stroke-width="3" paint-order="stroke">${esc(b.texto)}</text>`
  }
  return svg
}

/** Capa de fondo: un tile como `<image>` embebido (data URI), bajo todo. */
function imagen(capa) {
  return `<image href="${capa.dataUrl}" x="${capa.x.toFixed(2)}" y="${capa.y.toFixed(2)}" width="${capa.width.toFixed(2)}" height="${capa.height.toFixed(2)}" preserveAspectRatio="none"/>`
}

function svgMarco(width, height, titulo) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#eef3f8"/>
  <text x="50%" y="50%" font-family="sans-serif" font-size="16" text-anchor="middle" fill="#666">${esc(titulo)} — sin datos</text>
</svg>`
}

function circle(x, y, r, fill) {
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${fill}" stroke="#fff" stroke-width="1.5"/>`
}

/** Dibuja un bus como una flecha grande que apunta hacia donde avanza. */
function bus(x, y, rumbo, etiqueta, accesible) {
  const angulo = rumbo ?? 0
  const color = accesible ? COLOR_ACCESIBLE : COLOR_CAMION

  // Forma en coordenadas LOCALES, centro en (0, 0).
  // La punta apunta al norte (arriba = Y negativo en SVG).
  const puntos = ['0,-11', '7,8', '0,3.5', '-7,8'].join(' ')

  return `
<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
  <!-- Solo la flecha rota; el halo blanco la separa del mapa y de las paradas -->
  <g transform="rotate(${angulo})">
    <polygon points="${puntos}" fill="${color}" stroke="#ffffff" stroke-width="4" stroke-linejoin="round"/>
    <polygon points="${puntos}" fill="${color}" stroke="#222222" stroke-width="1.5" stroke-linejoin="round"/>
  </g>

</g>
  `
}

/** Escapa texto para incrustarlo en SVG de forma segura. */
function esc(texto) {
  return String(texto)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
