# argo-mcp

MCP (stdio + HTTP Streamable) e CLI per Argo ScuolaNext: una sessione browser Puppeteer in memoria.

## Uso

Dalla root del repo:

```bash
bun run serve    # HTTP
bun run mcp      # stdio
```

CLI:

```bash
bun --env-file=../../.env index.ts <comando>
```

(comandi: stessi nomi degli tool MCP, es. `voti-giornalieri`)

## Variabili

Obbligatorie: `CODICE_SCUOLA`, `USERNAME`, `PASSWORD` (in `.env` root).

Opzionali: `PORT`, `AUTH_TOKEN`, `MCP_HOST`, `MCP_IDLE_TIMEOUT`, `PUPPETEER_EXECUTABLE_PATH`. Con `AUTH_TOKEN` impostato il server si aspetta Bearer; senza token, in locale resta su `127.0.0.1`.

## Docker

Dal root del monorepo:

```bash
docker build -f packages/argo-mcp/Dockerfile -t argo-mcp .
```

Compose: vedi [docker-compose.yml](../../docker-compose.yml).
