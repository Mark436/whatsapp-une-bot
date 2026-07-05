FROM mcr.microsoft.com/playwright:v1.54.2-noble AS base

WORKDIR /workspace
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.10.0 --activate && \
    apt-get update && apt-get install -y \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies

COPY package.json pnpm-lock.yaml* ./

RUN pnpm install --dangerously-allow-all-builds

FROM base AS runtime

COPY --from=dependencies /workspace/node_modules ./node_modules
COPY --from=dependencies /workspace/package.json ./
COPY --from=dependencies /workspace/pnpm-lock.yaml* ./
COPY --from=dependencies /root/.cache/puppeteer /root/.cache/puppeteer

COPY . .

ENV NODE_ENV=development

CMD ["pnpm", "start"]