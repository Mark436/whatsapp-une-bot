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
 */

/** Dimensiones por defecto del canvas de salida. */
const DIMENSIONES_DEFECTO = { width: 800, height: 600 }
const MARGEN = 30

/** Proyección equirectangular simple (lat/lng → píxeles), escalada a un cuadro. */
function proyectar(puntos, width, height) {
  const lats = puntos.map((p) => p.lat)
  const lngs = puntos.map((p) => p.lng)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)

  const cos = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const spanLng = Math.max(maxLng - minLng, 1e-6)
  const spanLat = Math.max(maxLat - minLat, 1e-6 * cos)

  const escalaX = cos * spanLng
  const escalaY = spanLat
  const escala = Math.min((width - 2 * MARGEN) / escalaX, (height - 2 * MARGEN) / escalaY)

  return puntos.map((p) => ({
    x: MARGEN + cos * (p.lng - minLng) * escala,
    y: MARGEN + (maxLat - p.lat) * escala,
  }))
}

/**
 * Genera un string SVG con el recorrido de la ruta, sus paradas y los camiones
 * (rotados según su rumbo).
 */
export function rutaASvg(ruta, paradas, camiones, dimensiones = DIMENSIONES_DEFECTO) {
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
    .map((p) => circle(p.x, p.y, 4, '#e74c3c'))
    .join('')

  const camionesSvg = camionesActivos
    .map((c, i) => bus(pts[parIdx + i].x, pts[parIdx + i].y, c.rumbo, c.code))
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#eef3f8"/>
  <text x="${width / 2}" y="18" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle" fill="#333">${esc(ruta.nombre)}</text>
  <path d="${path}" fill="none" stroke="${ruta.colorPrimario ?? '#0088ff'}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  ${paradasSvg}
  ${camionesSvg}
</svg>`
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

/** Dibuja un bus como un rectángulo con una punta que indica la dirección. */
/** Dibuja un bus como una flecha, usando coordenadas relativas al centro. */
function bus(x, y, rumbo, etiqueta) {
  const angulo = rumbo ?? 0

  // Forma base del bus en coordenadas LOCALES.
  // El centro del bus está en (0, 0).
  // La punta apunta hacia arriba (norte).
  const puntos = [
    '-5,-7', // arriba izquierda
    '5,-7', // arriba derecha
    '5,-2', // abajo derecha del cuerpo
    '0,7', // punta
    '-5,-2', // abajo izquierda del cuerpo
  ].join(' ')
  return `
<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">

      <!-- Camión: solamente él rota -->
      <g transform="rotate(${angulo})">
        <polygon
          points="${puntos}"
          fill="#c0392b"
          stroke="#fff"
          stroke-width="1.5"
          stroke-linejoin="round"
        />
      </g>

      <!-- Etiqueta: NO rota -->
      <text
        x="9"
        y="-7"
        font-family="sans-serif"
        font-size="10"
        fill="#333"
      >${esc(etiqueta)}</text>

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
