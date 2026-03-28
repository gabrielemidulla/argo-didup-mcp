# argo-didup-mcp

MCP server per il registro elettronico Argo (ScuolaNext).

## Setup

```bash
bun install
cp .env.example .env  # inserisci le tue credenziali
```

## CLI

```bash
bun index.ts voti-giornalieri
```

## MCP

```bash
bun index.ts mcp
```

Oppure aggiungi a `.cursor/mcp.json`:

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
