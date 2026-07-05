FROM mcr.microsoft.com/playwright:v1.54.2-noble

WORKDIR /workspace

ENV NODE_ENV=development

RUN apt-get update && apt-get install -y \
    git \
    curl \
    nano \
    vim \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./

CMD ["npm", "install"]

CMD ["bash"]