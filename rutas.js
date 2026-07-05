const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { InputError, ScraperError } = require('./errors');

const UNE_URL = 'https://unesonora.com/';


async function launchBrowser() {
  const options = { headless: true };

  return chromium.launch(options);
}

async function aceptarPrivacidad(page) {
  const btn = page.getByRole('button', { name: 'He leído y acepto el Aviso de Privacidad' });
  if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await btn.click();
  }
}

async function abrirSelectorRutas(page) {
  await page.goto(UNE_URL);
  await aceptarPrivacidad(page);
  await page.waitForSelector('.btn-selectroute', { timeout: 15000 });
  await page.click('.btn-selectroute');
  await page.waitForSelector('.mapRoutesSidebar_body-list__1sd3l', { timeout: 15000 });
}

async function extraerNombresRutas(page) {
  const botones = page.locator('.mapRoutesSidebar_body-list__1sd3l li button');
  const count = await botones.count();
  const rutas = [];

  for (let i = 0; i < count; i++) {
    const texto = (await botones.nth(i).textContent()).trim();
    rutas.push(texto);
  }

  return rutas;
}

async function obtenerRutas() {
  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await abrirSelectorRutas(page);
    const rutas = await extraerNombresRutas(page);
    return rutas.map(r => `• ${r}`).join('\n');
  } catch (error) {
    throw new ScraperError('No se pudo obtener la lista de rutas', { cause: error });
  } finally {
    await browser.close();
  }
}

function normalizarRuta(input) {
  const match = String(input).match(/\d+/);
  return match ? match[0] : input.trim();
}

async function watchRoute(ruta, outputDir = './camiones/') {
  const rutaNormalizada = normalizarRuta(ruta);
  const fileName = `${rutaNormalizada}.jpg`;
  const filePath = path.join(outputDir, fileName);

  fs.mkdirSync(outputDir, { recursive: true });

  const browser = await launchBrowser();
  const page = await browser.newPage();

  try {
    await abrirSelectorRutas(page);

    const botonRuta = page.getByRole('button', { name: `Línea ${rutaNormalizada}` });
    const existe = await botonRuta.isVisible({ timeout: 5000 }).catch(() => false);

    if (!existe) {
      const rutas = await extraerNombresRutas(page);
      throw new InputError(`Ruta "${ruta}" no encontrada`, {
        visible: true,
        rutas: rutas.map(r => `• ${r}`).join('\n'),
      });
    }

    await botonRuta.click();
    await page.waitForSelector('.busMarker', { timeout: 15000 });
    await page.screenshot({ path: filePath });

    return filePath;
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new ScraperError(`Error al capturar ruta "${ruta}"`, { cause: error });
  } finally {
    await browser.close();
  }
}

module.exports = { watchRoute, obtenerRutas };
