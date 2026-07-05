const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "rutas.json");

function initCache() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getRutas() {
  initCache();
  if (fs.existsSync(CACHE_FILE)) {
    try {
      const data = fs.readFileSync(CACHE_FILE, "utf8");
      return JSON.parse(data);
    } catch (error) {
      logger.error("Error leyendo el cache de rutas", error.stack);
      return null;
    }
  }
  return null;
}

function setRutas(rutas) {
  initCache();
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(rutas, null, 2));
    logger.info("Cache de rutas actualizado y guardado en .cache/rutas.json");
  } catch (error) {
    logger.error("Error guardando el cache de rutas", error.stack);
  }
}

function clearCache() {
  if (fs.existsSync(CACHE_FILE)) {
    try {
      fs.unlinkSync(CACHE_FILE);
      logger.info("Cache de rutas vieja eliminada.");
    } catch (error) {
      logger.error("Error eliminando cache vieja", error.stack);
    }
  }
}

module.exports = {
  getRutas,
  setRutas,
  clearCache,
};
