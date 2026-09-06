# Diagnóstico Docker / DevContainer (`whatsapp-une-bot`)

> Estado: **roto desde el refactor `4f9e7b3`** ("feat: refactor route scraping to use
> UNE API and generate SVG maps"). No se ha aplicado ningún arreglo todavía — solo
> se documenta la causa para decidir el camino.

---

## Síntoma

`docker compose build` (o `.devcontainer`) falla en el stage `dependencies` del
`Dockerfile`, en `pnpm install`.

## Causa raíz

Desde el refactor, `package.json` depende de `une-api-client` por ruta relativa:

```jsonc
// whatsapp-une-bot/package.json
"dependencies": {
  "une-api-client": "file:../une-api-client"
}
```

El lock (`pnpm-lock.yaml`) la fija como dependencia de directorio
(`resolution: {directory: ../une-api-client, type: directory}`).

El problema es que **Docker no ve `../une-api-client`**:

1. **Build**: el contexto de build es solo la carpeta del bot (`build.context` no
   definido → directorio del compose). Trepando a `/une-api-client` relativo al
   `WORKDIR /workspace` (via `../une-api-client`), el directorio **no existe** en
   el contexto ni en la imagen → `pnpm install` falla en `dependencies`.

2. **Runtime con volumes** (compose): aunque el build pasara, pnpm crea un
   symlink en `/workspace/node_modules/une-api-client → /une-api-client`, y ese
   path no se monta en ningún volumen (solo se monta el bot en
   `.:/workspace`). Falta un volume `../une-api-client:/une-api-client`.

3. **DevContainer**: `postCreateCommand` (`pnpm install --unsafe-perm`) re-instala
   dentro del contenedor y resuelve el mismo `file:../une-api-client` →
   `/une-api-client` inexistente.

## Factores secundarios

- **Engines de Node**: las imágenes de Playwright (`mcr.microsoft.com/playwright`,
  v1.54.2-noble) embarcan Node 22, y `une-api-client` exige `>=24.16.0`. Con
  pnpm esto es un **warning** (no fatal) salvo `engine-strict=true`. El código
  en sí (fetch global, `node:tls`, `process.loadEnvFile`) funciona en Node 22.

- Antes del refactor, el bot dependía de `playwright` (no de `une-api-client`),
  por eso el Docker sí compilaba ("plug and play docker compose ready to work").

## Opciones de arreglo (sin decidir)

| Opción                                   | Cambio                                                                                                                                                         | Pros                                              | Contras                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **A. `additional_contexts` de BuildKit** | compose: `build.additional_contexts: { une_api: ../une-api-client }`; Dockerfile: `COPY --from=une_api / /une-api-client` en stages `dependencies` y `runtime` | Mantiene el `file:` y una sola fuente de código   | Requiere BuildKit; hay que recordar re-build al cambiar el cliente                    |
| **B. Vender el paquete dentro del bot**  | copiar `une-api-client` a `vendor/une-api-client` y dep `file:./vendor/une-api-client`                                                                         | Self-contained; compose sin tocar                 | Duplica código; sincronización manual                                                 |
| **C. Publicar a npm y usar versión**     | dep `une-api-client: "^0.1.0"` (o la que sea)                                                                                                                  | Definitivo; Docker trivial; se elimina el `file:` | Requiere publicar primero (la preparación está en `une-api-client`)                   |
| **D. Fix de dev (contenedor)**           | compose: quitar el volume anónimo `/workspace/node_modules` y montar `../une-api-client:/une-api-client`                                                       | Boot rápido en dev                                | Sigue fallando el build del imagen; hay que matar el stage `dependencies` o tolerarlo |
| **E. Fix de dev (versión 2)**            | cambiar engine del cliente o usar una imagen Node 24 para el bot                                                                                               | Elimina el warning                                | No resuelve el `file:` relativo                                                       |

Recomendación tentativa: **A** (mantiene fuente única y el flujo `file:`) o **C**
(la más limpia a mediano plazo, ya que `une-api-client` está en vías de
publicarse). Decidir cuando se publique el paquete.
