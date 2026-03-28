# argo-didup-mcp

MCP server per il registro elettronico Argo (ScuolaNext). Supporta **stdio** (Cursor) e **Streamable HTTP** (VPS / client remoti) con `Authorization: Bearer`.

Il browser Puppeteer resta **sempre aperto** sul processo server: la sessione Argo vive in memoria fino al riavvio. Non servono cookie su disco.

## Setup

```bash
bun install
cp .env.example .env
```

- **Credenziali Argo**: `CODICE_SCUOLA`, `USERNAME`, `PASSWORD` (MCP e CLI).
- **HTTP**: `AUTH_TOKEN` e opzionalmente `PORT`.

## CLI (una tantum)

```bash
export CODICE_SCUOLA=... USERNAME=... PASSWORD=...
bun index.ts voti-giornalieri
```

## MCP stdio (Cursor)

```bash
bun index.ts mcp
```

All’**avvio** del server MCP (`mcp` o `serve`) viene eseguito il **login Argo** una volta (variabili `CODICE_SCUOLA`, `USERNAME`, `PASSWORD`); il browser resta aperto. A **ogni** chiamata a **`voti-giornalieri`** si ricarica `index.jsf` e poi si naviga alla sezione voti.

Aggiungi a `.cursor/mcp.json` (stdio locale):

```json
{
  "mcpServers": {
    "argo-didup": {
      "command": "bun",
      "args": ["index.ts", "mcp"],
      "cwd": "${workspaceFolder}"
    }
  }
}
```

## MCP Streamable HTTP (VPS)

```bash
export AUTH_TOKEN='token-lungo-e-segreto'
export PORT=3000
bun index.ts serve
```

Endpoint MCP: `http://<host>:<PORT>/mcp`. Ogni richiesta (tranne `OPTIONS`) richiede l’header:

`Authorization: Bearer <AUTH_TOKEN>`

I client compatibili (es. integrazioni MCP remote) usano l’URL del server e il token come da documentazione del client.

Il trasporto Streamable HTTP richiede anche un header `Accept` che includa `application/json` e `text/event-stream` (specifica MCP); i client ufficiali lo inviano automaticamente.

### Docker

```bash
docker build -t argo-didup-mcp .
docker run -e AUTH_TOKEN=... -e CODICE_SCUOLA=... -e USERNAME=... -e PASSWORD=... -p 3000:3000 argo-didup-mcp
```

Su container si usa Chromium di sistema (`PUPPETEER_EXECUTABLE_PATH` già impostato nel Dockerfile).

## Variabili d’ambiente

| Variabile | Uso |
|-----------|-----|
| `AUTH_TOKEN` | Obbligatorio per `serve` |
| `PORT` | Porta HTTP (default `3000`) |
| `MCP_IDLE_TIMEOUT` | Secondi prima che Bun chiuda connessioni idle; default `0` (disabilitato, necessario per Streamable HTTP / SSE) |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium custom (es. Linux server) |
| `CODICE_SCUOLA`, `USERNAME`, `PASSWORD` | Login Argo (MCP e CLI) |

