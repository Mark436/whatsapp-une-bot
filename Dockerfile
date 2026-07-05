FROM mcr.microsoft.com/playwright:v1.54.2-noble

WORKDIR /workspace

ENV NODE_ENV=development

RUN apt-get update && apt-get install -y \
    git \
    curl \
    nano \
    vim \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml ./
RUN cat pnpm-workspace.yaml
RUN pnpm install --dangerously-allow-all-builds

CMD ["pnpm", "start"]