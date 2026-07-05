/**
 * Genera el string de fecha y hora local (Hermosillo, MST)
 */
function getTimestamp() {
  const now = new Date()

  const date = now.toLocaleDateString('en-CA', {
    timeZone: 'America/Hermosillo',
  })
  const time = now.toLocaleTimeString('en-GB', {
    timeZone: 'America/Hermosillo',
  })

  return `[${date} ${time}]`
}

export const logger = {
  info: (message) => {
    console.log(`${getTimestamp()} [INFO] ${message}`)
  },
  warn: (message) => {
    console.warn(`${getTimestamp()} [WARN] ${message}`)
  },
  error: (message, stack = '') => {
    console.error(`${getTimestamp()} [ERROR] ${message}`)
    if (stack) {
      console.error(stack)
    }
  },
}
