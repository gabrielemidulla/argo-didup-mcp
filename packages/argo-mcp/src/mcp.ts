import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrapArgoSession } from "./argo-bootstrap.ts";
import { registerArgoPortalTools } from "./mcp-tools/portal-tools.ts";
import { registerRestartBrowserTool } from "./mcp-tools/restart-browser.ts";

export function createMcpServer() {
  const server = new McpServer({
    name: "argo-didup",
    version: "1.0.0",
  });
  registerRestartBrowserTool(server);
  registerArgoPortalTools(server);
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
