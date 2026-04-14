# telegram-bot

Bot Telegram: LangChain ReAct + [OpenRouter](https://openrouter.ai); chiama l’MCP Argo su HTTP (`MCP_URL`).

## Avvio

Serve il processo MCP in ascolto (`bun run serve` da root) oppure un `MCP_URL` raggiungibile.

```bash
# dalla root
bun run telegram

# oppure da questo package
bun run start
```

(`start` carica `.env` dalla root del repo.)

## Variabili

Obbligatorie: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `OPENROUTER_API_KEY`, `AI_MODEL_NAME` (slug modello OpenRouter, vedi [documentazione LangChain](https://openrouter.ai/docs/guides/community/langchain)).

Opzionali: `MCP_URL` (default `http://localhost:<PORT>/mcp` con `PORT` da env), `TELEGRAM_MEMORY_PATH` (default `MEMORY.md` in questo package, gitignored).

Automazioni (tool `automation_*`): `MYSQL_HOST`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_PORT`. Se mancano, il bot parte senza automazioni.

Migrazioni DB: `drizzle/`; `bun run db:generate` per rigenerare SQL da schema.

## Docker

Dal root del monorepo:

```bash
docker build -f packages/telegram-bot/Dockerfile -t telegram-bot .
```

Con **Docker Compose** (root repo), la memoria persistente è su volume `telegram_user_memory` come `/data/MEMORY.md` (`TELEGRAM_MEMORY_PATH`); rebuild e `docker compose up` non azzerano il file.
