// Smoke test: resuelve una ruta por nombre, genera el mapa SVG -> PNG y lo
// guarda en camiones/ sin pasar por WhatsApp.
//
// Uso: node scripts/probar-mapa.js [ruta]
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { UneApiClient } from 'une-api-client'
import { rutaASvg } from '../svgMapa.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const ruta = process.argv[2] || 'caturegli'
const DIMENSIONES = { width: 1200, height: 900 }

const client = new UneApiClient()

const coincidencias = await client.buscarRutasPorNombre(ruta)
if (coincidencias.length !== 1) {
  console.error(`Se esperaba 1 coincidencia para "${ruta}", hay ${coincidencias.length}:`)
  for (const c of coincidencias) console.error(`- ${c.nombre}`)
  process.exit(1)
}
console.log(`Resuelta por nombre: ${coincidencias[0].id} — ${coincidencias[0].nombre}`)

const info = await client.consultarRuta(ruta)
if (!info) {
  console.error(`No se pudo resolver la ruta "${ruta}"`)
  process.exit(1)
}
console.log(
  `paradas: ${info.paradas.length} | unidades: ${info.camiones.length} | recorrido: ${info.ruta.recorrido.length} pts`
)

const svg = rutaASvg(info.ruta, info.paradas, info.camiones, DIMENSIONES)

const dir = path.join(__dirname, '..', 'camiones')
await mkdir(dir, { recursive: true })
const base = path.join(dir, info.ruta.nombre.replace(/\s+/g, '_'))
await writeFile(`${base}.svg`, svg, 'utf8')
await sharp(Buffer.from(svg)).png().toFile(`${base}.png`)

console.log(`Mapa generado: ${base}.png`)
