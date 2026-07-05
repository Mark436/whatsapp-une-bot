FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
    CACHE_DIR=/app/camiones

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    dbus \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    xdg-utils \
    && mkdir -p /run/dbus \
    && rm -rf /var/lib/apt/lists/*

COPY package.json ./

RUN npm install --ignore-scripts \
    && npx playwright install-deps chromium \
    && rm -rf /root/.npm

COPY . .

RUN mkdir -p camiones .wwebjs_auth

VOLUME ["/app/.wwebjs_auth", "/app/camiones"]

CMD ["node", "main.js"]
