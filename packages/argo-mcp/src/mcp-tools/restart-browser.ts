import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { restartArgoBrowserSession } from "../argo-bootstrap.ts";
import mcpToolResult, {
  type McpTextToolResult,
} from "../tool-response.ts";

export function registerRestartBrowserTool(server: McpServer): void {
  server.registerTool(
    "restart-browser",
    {
      description:
        "Riavvia Chromium usato per Argo: chiude browser e pagina, rilancia e rifà il login con le credenziali in env. Chiamalo se altri tool falliscono con errori Puppeteer anomali (es. «Attempted to detach frame», «Target closed», «Session closed», frame o pagina non più valida). Dopo il riavvio ripeti la richiesta originale.",
    },
    async (): Promise<McpTextToolResult> => {
      try {
        await restartArgoBrowserSession();
        return mcpToolResult.jsonResult({
          ok: true,
          message:
            "Browser riavviato e sessione Argo ripristinata con un nuovo login.",
        });
      } catch (e) {
        return {
          ...mcpToolResult.jsonResult({
            ok: false,
            error: mcpToolResult.errorMessageFromUnknown(e),
          }),
          isError: true,
        };
      }
    },
  );
}
