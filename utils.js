import fs from 'fs'
import path from 'path'
import logger from './logger.js'

/**
 * Cola FIFO para asegurar que las tareas se ejecuten una por una.
 */
export class FIFOQueue {
  constructor() {
    this.queue = Promise.resolve()
  }

  add(task) {
    return new Promise((resolve, reject) => {
      this.queue = this.queue.then(async () => {
        try {
          const result = await task()
          resolve(result)
        } catch (error) {
          reject(error)
        }
      })
    })
  }
}

/**
 * Elimina archivos temporales de un directorio específico
 */
export function limpiarDirectorio(dir, extension = '.jpg') {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    return
  }

  const files = fs.readdirSync(dir)
  let eliminados = 0

  for (const file of files) {
    if (file.endsWith(extension)) {
      const filePath = path.join(dir, file)
      try {
        fs.unlinkSync(filePath)
        eliminados++
      } catch (error) {
        logger.warn(`No se pudo eliminar archivo temporal: ${filePath} - ${error.message}`)
      }
    }
  }

  if (eliminados > 0) {
    logger.info(`Eliminación de archivos temporales: ${eliminados} archivos eliminados en ${dir}`)
  }
}

/**
 * Elimina un solo archivo de forma segura
 */
export function eliminarArchivo(filePath) {
  if (!filePath) return

  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.warn(`No se pudo eliminar archivo: ${filePath} - ${err.message}`)
    } else if (!err) {
      logger.info(`Archivo temporal eliminado: ${filePath}`)
    }
  })
}
