# docker build -f packages/argo-mcp/Dockerfile .
FROM oven/bun:1-debian

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/argo-mcp/package.json ./packages/argo-mcp/
COPY packages/telegram-bot/package.json ./packages/telegram-bot/
RUN bun install --frozen-lockfile

COPY packages/argo-mcp ./packages/argo-mcp

# Dopo COPY serve un secondo install per allineare node_modules del workspace (context senza node_modules).
RUN bun install --frozen-lockfile

WORKDIR /app
EXPOSE 3000
CMD ["bun", "./packages/argo-mcp/index.ts", "serve"]
