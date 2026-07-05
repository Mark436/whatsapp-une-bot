class InputError extends Error {
  constructor(message, { visible = false, rutas = '' } = {}) {
    super(message);
    this.name = 'InputError';
    this.visible = visible;
    this.rutas = rutas;
  }
}

class ScraperError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = 'ScraperError';
    this.cause = cause;
  }
}

module.exports = { InputError, ScraperError };
