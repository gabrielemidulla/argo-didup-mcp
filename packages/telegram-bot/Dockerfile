# Build from repository root: docker build -f packages/telegram-bot/Dockerfile .
FROM oven/bun:debian

WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/argo-mcp/package.json ./packages/argo-mcp/
COPY packages/telegram-bot/package.json ./packages/telegram-bot/
RUN bun install --frozen-lockfile

COPY packages/telegram-bot ./packages/telegram-bot

# Bun mette le dipendenze del workspace in packages/telegram-bot/node_modules (non in /app/node_modules).
RUN bun install --frozen-lockfile

WORKDIR /app
CMD ["bun", "./packages/telegram-bot/src/main.ts"]
