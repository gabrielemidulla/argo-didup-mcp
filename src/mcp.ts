import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createBrowser, login } from "./browser.ts";
import { votiGiornalieri } from "./commands/voti-giornalieri.ts";
import type { ArgoCredentials } from "./types.ts";

function getCredentials(): ArgoCredentials {
  const codiceScuola = Bun.env["CODICE_SCUOLA"];
  const username = Bun.env["USERNAME"];
  const password = Bun.env["PASSWORD"];

  if (!codiceScuola || !username || !password) {
    throw new Error(
      "Variabili d'ambiente mancanti: CODICE_SCUOLA, USERNAME, PASSWORD",
    );
  }

  return { codiceScuola, username, password };
}

export async function startMcpServer() {
  const server = new McpServer({
    name: "argo-didup",
    version: "1.0.0",
  });

  server.tool(
    "voti-giornalieri",
    "Recupera i voti giornalieri dal registro elettronico Argo (ScuolaNext). Ritorna un array di materie, ciascuna con i relativi voti (data, tipo scritto/orale/pratico, voto numerico, note).",
    async () => {
      const credentials = getCredentials();
      const browser = await createBrowser();
      try {
        const page = await login(browser, credentials);
        const grades = await votiGiornalieri(page);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(grades, null, 2) }],
        };
      } finally {
        await browser.close();
      }
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("argo-didup MCP server running on stdio");
}
