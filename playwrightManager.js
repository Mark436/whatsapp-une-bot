const { chromium } = require('playwright')
const logger = require('./logger')

let browserInstance = null
let pageInstance = null

async function getBrowserPage() {
  if (!browserInstance) {
    logger.info('Inicio del navegador (Chromium - Playwright)')
    browserInstance = await chromium.launch({ headless: true })
  }

  // Si la página no existe o se cerró/crasheó, creamos una nueva al instante
  if (!pageInstance || pageInstance.isClosed()) {
    pageInstance = await browserInstance.newPage()
  }

  return pageInstance
}

async function closeBrowser() {
  if (browserInstance) {
    await browserInstance.close()
    logger.info('Cierre del navegador (Chromium - Playwright)')
    browserInstance = null
    pageInstance = null
  }
}

process.on('SIGINT', async () => {
  await closeBrowser()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  await closeBrowser()
  process.exit(0)
})

module.exports = {
  getBrowserPage,
  closeBrowser,
}
