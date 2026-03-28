import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { openPortalIndex } from "./browser.ts";
import { bootstrapArgoSession } from "./argo-bootstrap.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";
import { bacheca } from "./commands/bacheca.ts";
import { getLoggedInPage } from "./session.ts";

export function createMcpServer() {
  const server = new McpServer({
    name: "argo-didup",
    version: "1.0.0",
  });

  server.registerTool(
    "voti-giornalieri",
    {
      description:
        "Recupera i voti giornalieri da Argo (ScuolaNext). Il server è già loggato all'avvio; a ogni chiamata si ricarica index.jsf e poi si apre la sezione voti.",
    },
    async () => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      const grades = await votiGiornalieri(page);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(grades, null, 2) }],
      };
    },
  );

  server.registerTool(
    "bacheca",
    {
      description:
        "Recupera le circolari dalla bacheca di Argo (ScuolaNext). Ritorna oggetto, messaggio, data e link firmati ai file PDF allegati. Usa 'limit' per controllare quante circolari restituire e 'mese' (formato MM/YYYY) per filtrare per mese.",
      inputSchema: {
        limit: z
          .number()
          .optional()
          .describe("Numero massimo di circolari da restituire (default 5)"),
        mese: z
          .string()
          .optional()
          .describe(
            "Filtra per mese, formato MM/YYYY (es. '02/2026' per febbraio 2026)",
          ),
      },
    },
    async ({ limit, mese }) => {
      const page = getLoggedInPage();
      if (!page) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                error: "Sessione browser non inizializzata: riavvia il server MCP.",
              }),
            },
          ],
          isError: true,
        };
      }
      try {
        await openPortalIndex(page);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
      try {
        const entries = await bacheca(page, { limit, mese });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(entries, null, 2) }],
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export async function startMcpServer() {
  try {
    await bootstrapArgoSession();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argo-didup MCP server running on stdio");
}
