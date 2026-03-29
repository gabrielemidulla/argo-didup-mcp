# argo-didup-mcp

MCP server per il registro elettronico Argo (ScuolaNext). Supporta **stdio** (Cursor) e **Streamable HTTP** (VPS / client remoti) con `Authorization: Bearer`.

Il browser Puppeteer resta **sempre aperto** sul processo server: la sessione Argo vive in memoria fino al riavvio. Non servono cookie su disco.

## Setup

```bash
bun install
cp .env.example .env
```

- **Credenziali Argo**: `CODICE_SCUOLA`, `USERNAME`, `PASSWORD` (MCP e CLI).
- **HTTP**: opzionalmente `PORT`. `AUTH_TOKEN` è **opzionale**: se assente o vuoto, `serve` ascolta solo su **127.0.0.1** e **non** richiede `Authorization`; con token impostato ascolta su **0.0.0.0** e ogni richiesta deve inviare `Bearer`. Opzionale `MCP_HOST` per forzare l’interfaccia di bind.

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

Il file `.cursor/mcp.json` in repo usa **stdio**: Cursor avvia `bun index.ts mcp` con `cwd` sulla root del workspace. **Bun carica automaticamente `.env`** da quella directory, quindi `CODICE_SCUOLA`, `USERNAME` e `PASSWORD` funzionano senza esportarle nel terminale.

### Cursor, `${env:...}` e file `.env`

In `mcp.json`, valori come `"${env:AUTH_TOKEN}"` sono risolti solo dalle **variabili d’ambiente del processo che ha avviato Cursor** (Dock, Spotlight, ecc.). **Non** viene letto il `.env` del progetto. Per HTTP remoto da Cursor devi quindi, ad esempio:

- esportare le variabili nello shell e lanciare Cursor da quel terminale (`cursor .`), oppure
- definirle nel profilo shell (`~/.zshrc`) se accetti di tenerle lì in sviluppo.

Esempio configurazione **solo HTTP** (VPS o `bun index.ts serve` locale), da unire con env esportate come sopra:

```json
{
  "mcpServers": {
    "argo-didup": {
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer ${env:AUTH_TOKEN}"
      }
    }
  }
}
```

Se il server è avviato **senza** `AUTH_TOKEN`, puoi omettere l’header `Authorization` in `mcp.json` (solo connessioni a `http://127.0.0.1:<PORT>/mcp` da quella macchina). Se invece usi token, `${env:AUTH_TOKEN}` deve essere valorizzato nel processo di Cursor.

## MCP Streamable HTTP (VPS)

**Solo questa macchina, senza token** (default `127.0.0.1`, nessun Bearer):

```bash
export PORT=3000
bun index.ts serve
```

**Rete / VPS, con autenticazione:**

```bash
export AUTH_TOKEN='token-lungo-e-segreto'
export PORT=3000
bun index.ts serve
```

Endpoint MCP: `http://<host>:<PORT>/mcp`. Con `AUTH_TOKEN` impostato, ogni richiesta (tranne `OPTIONS`) richiede l’header `Authorization: Bearer <AUTH_TOKEN>`. Senza token, l’header non serve; il server non è raggiungibile dagli altri PC della LAN salvo tunnel o se imposti esplicitamente `MCP_HOST` (es. `0.0.0.0`: **nessuna autenticazione**, solo per reti fidate o Docker).

I client compatibili (es. integrazioni MCP remote) usano l’URL del server e il token come da documentazione del client.

Il trasporto Streamable HTTP richiede anche un header `Accept` che includa `application/json` e `text/event-stream` (specifica MCP); i client ufficiali lo inviano automaticamente.

### Docker

```bash
docker build -t argo-didup-mcp .
docker run -e AUTH_TOKEN=... -e CODICE_SCUOLA=... -e USERNAME=... -e PASSWORD=... -p 3000:3000 argo-didup-mcp
```

Senza `AUTH_TOKEN` il processo ascolta su `127.0.0.1` e la mappatura `-p 3000:3000` dall’host **non** raggiunge il servizio: in container usa almeno `AUTH_TOKEN=...` oppure, solo in ambienti fidati, `MCP_HOST=0.0.0.0` (senza token = nessuna autenticazione).

Su container si usa Chromium di sistema (`PUPPETEER_EXECUTABLE_PATH` già impostato nel Dockerfile).

### Docker Compose (MCP + Telegram)

Con `.env` compilato (Argo, Telegram, Gemini; `AUTH_TOKEN` vuoto per l’esempio senza Bearer):

```bash
docker compose up --build
```

- **mcp**: `serve` su `0.0.0.0:3000` nel network compose, porta host `3000`.
- **telegram**: `MCP_URL=http://mcp:3000/mcp`, parte dopo che il healthcheck del MCP risponde (OPTIONS su `/mcp`).

## Bot Telegram (esempio)

Esempio in [`examples/telegram.ts`](examples/telegram.ts): **grammY** + **LangChain** (`createReactAgent`) + **Gemini**, con tool MCP via HTTP verso il server locale. Solo il `TELEGRAM_CHAT_ID` configurato riceve risposte. Il **runner** grammY evita che `getUpdates` resti bloccato durante chiamate lunghe al modello/MCP.

1. In un terminale: `bun index.ts serve` (l’esempio bot si aspetta MCP **senza** Bearer, tipico in locale senza `AUTH_TOKEN`).
2. In un altro: `bun index.ts telegram`.
3. Scrivi al bot dal chat consentito.

Variabili: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_API_KEY`, credenziali Argo. Opzionale: `MCP_URL` (default `http://localhost:<PORT>/mcp`). Se il server MCP usa `AUTH_TOKEN`, configura `serve` senza token in locale oppure estendi l’esempio per inviare `Authorization`.

## Variabili d’ambiente

| Variabile | Uso |
|-----------|-----|
| `AUTH_TOKEN` | Opzionale per `serve`: se vuoto, solo localhost senza Bearer; se impostato, bind su `0.0.0.0` e Bearer obbligatorio |
| `MCP_HOST` | Opzionale; sovrascrive l’host di bind (`127.0.0.1` senza token, `0.0.0.0` con token) |
| `PORT` | Porta HTTP (default `3000`) |
| `MCP_IDLE_TIMEOUT` | Secondi prima che Bun chiuda connessioni idle; default `0` (disabilitato, necessario per Streamable HTTP / SSE) |
| `PUPPETEER_EXECUTABLE_PATH` | Chromium custom (es. Linux server) |
| `CODICE_SCUOLA`, `USERNAME`, `PASSWORD` | Login Argo (MCP e CLI) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Bot di esempio (`bun index.ts telegram`) |
| `GOOGLE_API_KEY` | Gemini per il bot di esempio |
| `MCP_URL` | Opzionale; URL MCP HTTP per il bot (default da `PORT`) |

