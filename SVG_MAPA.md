# Mapa en SVG (`svgMapa.js`)

Documento explicativo del render de mapas de rutas a SVG. El mapa no es una
imagen estática: es un **string SVG generado en memoria** y convertido a PNG
con `sharp` al responder un comando `!ruta`.

---

## 1. Dónde vive

- **Generador**: `svgMapa.js` → `rutaASvg(ruta, paradas, camiones, dimensiones?)`
  (función pura, sin dependencias).
- **Quién lo usa**:
  - `routeService.js` → `watchRoute()` (flujo del bot por WhatsApp).
  - `scripts/probar-mapa.js` → smoke test que guarda `.svg` + `.png` en
    `camiones/` sin pasar por WhatsApp.
- **Conversión a PNG**: `sharp(Buffer.from(svg)).png().toFile(...)`.

---

## 2. Entradas (DTOs de `une-api-client`)

| Argumento     | Tipo                           | Uso en el SVG                                                                  |
| ------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `ruta`        | `Ruta`                         | `recorrido` → `<path>`; `nombre` → título; `colorPrimario` → color de la línea |
| `paradas`     | `Parada[]`                     | `paradas[i].ubicacion` (`{lat,lng}`) → `<circle>`                              |
| `camiones`    | `Camion[]`                     | `ubicacion`, `rumbo`, `id` → `<polygon>` + etiqueta                            |
| `dimensiones` | `{ width, height }` (opcional) | Canvas; default `800x600` (el bot usa `1200x900`)                              |

> Las unidades con `deshabilitado = true` se **filtran** (no se dibujan),
> igual que el mapa oficial.

---

## 3. Cómo se genera

### 3.1 Proyección (`proyectar()`)

Proyección **equirectangular simple** lat/lng → píxeles:

1. Se toman los **mínimos/máximos** de lat y lng de _todos_ los puntos
   (recorrido + paradas + unidades).
2. Corrección por `cos` de la latitud media (para no distorsionar la
   proporción al acercarse a Hermosillo).
3. Escala única con `Math.min` para que todo el conjunto quepa en el canvas
   menos el `MARGEN` de 30 px.

Consecuencia: **no hay mapa base de calles**; el lienzo se autocontiene
alrededor del recorrido de la ruta.

### 3.2 Capas dibujadas (orden z)

1. Fondo: `<rect>` `#eef3f8`.
2. Título: `ruta.nombre`, centrado arriba (`y=18`).
3. Recorrido: `<path>` con **"M"** en el primer punto y **"L"** en el resto,
   `fill="none"`, `stroke` = `ruta.colorPrimario` (o `#0088ff` por defecto),
   grosor 5, extremos redondeados.
4. Paradas: `<circle>` radio 4, `#e74c3c`, borde blanco 1.5.
5. Unidades: `<polygon>` 14×9 px rotado según `c.rumbo` (grados), `#c0392b`,
   borde blanco 1.5 + `<text>` con `c.id` (ej. `H-586`).

---

## 4. Colores

| Color     | Elemento                   |
| --------- | -------------------------- |
| `#eef3f8` | Fondo del lienzo           |
| `#0088ff` | Recorrido (default)        |
| `#e74c3c` | Paradas                    |
| `#c0392b` | Unidades en servicio       |
| `#333`    | Textos (título, etiquetas) |

---

## 5. Ejemplo real (Línea 10 Caturegli)

Datos de una corrida de `scripts/probar-mapa.js "10 caturegli"`:

| Dato                       | Valor                          |
| -------------------------- | ------------------------------ |
| Canvas                     | 1200×900                       |
| Puntos del recorrido       | 245                            |
| Paradas                    | 241                            |
| Camiones del grupo         | 5                              |
| Camiones activos dibujados | 4 (H-586, H-559, H-667, H-585) |

El archivo `camiones/Línea_10_Caturegli.svg` guarda una versión **formateada
para lectura** (path en varias líneas y comentarios explicativos), que renderiza
idéntico al PNG.

---

## 6. El código tal cual (muestra anotada)

Muestra **real** del archivo `camiones/Línea_10_Caturegli.svg`, con el
recorrido y las paradas abreviados (`...`) para que sea legible en el doc. Las
anotaciones `<!-- ENTRADA -->` marcan en qué parte del SVG entra cada dato.

```svg
<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">

  <!-- ENTRADA: sempre igual (fondo del lienzo) -->
  <rect width="100%" height="100%" fill="#eef3f8"/>

  <!-- ENTRADA: ruta.nombre -->
  <text x="600" y="18" font-family="sans-serif" font-size="15" font-weight="bold" text-anchor="middle" fill="#333">Línea 10 Caturegli</text>

  <!-- ENTRADA: ruta.recorrido[i] proyectado -> "M" (primero) + "L" (resto)
       Los x,y son px ya calculados por proyectar(). -->
  <path d="M428.6,445.1 L428.9,466.7 L444.1,467.1 L459.1,466.4 L461.2,465.9 L488.1,466.0 L488.3,530.9 ...
    ... L428.5,435.3 L428.5,444.7"
    fill="none" stroke="#0088ff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/>
  <!-- (245 segmentos; stroke = ruta.colorPrimario o #0088ff por defecto) -->

  <!-- ENTRADA: paradas[i].ubicacion proyectada. 241 circulos identicos. -->
  <circle cx="1067.8" cy="853.7" r="4" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>
  <circle cx="1041.8" cy="804.6" r="4" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>
  <circle cx="532.2" cy="499.3" r="4" fill="#e74c3c" stroke="#fff" stroke-width="1.5"/>
  <!-- ... 238 circulos mas ... -->

  <!-- ENTRADA: camiones[i] activos (deshabilitado = false).
       Rectangulo 14x9px rotado segun c.rumbo; etiqueta = c.id. -->
  <polygon points="422.2,298.8 408.2,298.8 408.2,289.8 422.2,289.8" fill="#c0392b" stroke="#fff" stroke-width="1.5"/>
  <text x="423.2" y="288.3" font-family="sans-serif" font-size="10" fill="#333">H-586</text>
  <polygon points="514.6,395.3 511.5,381.6 520.2,379.6 523.4,393.3" fill="#c0392b" stroke="#fff" stroke-width="1.5"/>
  <text x="525.4" y="381.4" font-family="sans-serif" font-size="10" fill="#333">H-559</text>
  <!-- ... otras unidades ... -->
</svg>
```

> El bloque completo (sin abreviar) está en `camiones/Línea_10_Caturegli.svg`
> y en la variable `svg` que produce `rutaASvg()` antes de pasarla a `sharp`.

### 6.1 Cómo se ve en el flujo real del bot

```
!ruta 10 caturegli
   │
   v
buscarRutaExacta() ─► nombre exacto "Línea 10 Caturegli"
   │
   v
client.consultarRuta() ─► { ruta, paradas: [241], camiones: [5] }   (DTOs)
   │
   v
rutaASvg(ruta, paradas, camiones, {1200, 900}) ─► string SVG
   │
   v
sharp(SVG).png() ─► camiones/Línea_10_Caturegli_<timestamp>.png
   │
   v
msg.reply(media)  (el PNG se manda por WhatsApp y se borra al terminar)
```

---

## 7. Cómo generar el mapa a mano

```bash
# Desde whatsapp-une-bot (requiere que une-api-client tenga dist/ construido)
node scripts/probar-mapa.js "10 caturegli"
# -> Resuelve por nombre y guarda:
#    camiones/Línea_10_Caturegli.svg  (SVG legible, con comentarios)
#    camiones/Línea_10_Caturegli.png  (render 1200x900)
```

Requiere red: consulta la API real de UNE (auth anónima de Firebase; usa la API
key pública incluida en `une-api-client` si no está `UNE_FIREBASE_API_KEY`).

---

## 8. Notas para un futuro rediseño

- El lienzo se autocentra en el recorrido (sin calles de fondo); si se quiere
  contexto geográfico hay que traer una base (OSM/tiles) y proyectarla igual.
- Se dibujan **todas** las paradas, incluso las que no tiene la ruta en
  servicio (el payload de `/stops` trae las compartidas; el consumidor podría
  filtrar por `rutas`).
- El bus es un rectángulo rotado + etiqueta; no hay popup ni diferenciación de
  sentido a simple vista.
