# argo-didup

<br>
<div align="center">
  <img src="https://www.argosoft.it/area-programmi/didup/diduplogo.png" alt="Didup" width="160" />
</div>
<br>

Server MCP per il portale Argo (famiglia) e bot Telegram che lo usa via HTTP.

## Prerequisiti

```bash
bun install
cp .env.example .env
```

Compila `.env` in root: gli script usano `--env-file=../../.env` dai package. Dettaglio variabili: [.env.example](.env.example).

## Comandi (dalla root)

```bash
bun run serve     # MCP HTTP (default porta in .env)
bun run mcp       # MCP stdio
bun run telegram  # bot (serve MCP in ascolto o MCP_URL esterno)
bun run check     # TypeScript
```

CLI Argo (stesse credenziali del MCP):

```bash
bun --env-file=.env ./packages/argo-mcp/index.ts voti-giornalieri
```

Se sul server HTTP viene impostato `AUTH_TOKEN`, il client deve inviare `Authorization: Bearer …`.

## Docker

[docker-compose.yml](docker-compose.yml): servizi `mysql`, `mcp`, `telegram`. Esempi: `docker compose up mysql -d`, `docker compose up mcp telegram -d`.

Build singole immagini dal root del repo:

```bash
docker build -f packages/argo-mcp/Dockerfile -t argo-mcp .
docker build -f packages/telegram-bot/Dockerfile -t telegram-bot .
```
