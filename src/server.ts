import { randomUUID } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { bootstrapArgoSession } from "./argo-bootstrap.ts";
import { createMcpServer } from "./mcp.ts";
import { shutdownSession } from "./session.ts";

const transports: Record<string, WebStandardStreamableHTTPServerTransport> = {};

function jsonRpcError(status: number, code: number, message: string) {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "Content-Type": "application/json" },
    },
  );
}

function unauthorized() {
  return new Response(JSON.stringify({ error: "Unauthorized" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": 'Bearer error="invalid_token"',
    },
  });
}

function authorize(req: Request): boolean {
  const expected = Bun.env["AUTH_TOKEN"]?.trim();
  if (!expected) return true;
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return false;
  return h.slice(7).trim() === expected;
}

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, last-event-id",
    "Access-Control-Expose-Headers": "mcp-session-id",
  };
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders()) as [string, string][]) {
    headers.set(k, v);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

async function handleMcp(req: Request): Promise<Response> {
  if (!authorize(req)) return unauthorized();

  const sessionHeader = req.headers.get("mcp-session-id");

  if (req.method === "POST") {
    let parsedBody: unknown;
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      try {
        parsedBody = await req.json();
      } catch {
        return jsonRpcError(400, -32700, "Parse error");
      }
    }

    try {
      const existing =
        sessionHeader !== null ? transports[sessionHeader] : undefined;
      if (sessionHeader && existing) {
        return await existing.handleRequest(req, { parsedBody });
      }

      if (
        !sessionHeader &&
        parsedBody !== undefined &&
        isInitializeRequest(parsedBody)
      ) {
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports[id] = transport;
            console.error(`MCP session initialized: ${id}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
            console.error(`MCP transport closed: ${sid}`);
          }
        };

        const server = createMcpServer();
        await server.connect(transport);
        return await transport.handleRequest(req, { parsedBody });
      }

      return jsonRpcError(
        400,
        -32000,
        "Bad Request: No valid session ID provided",
      );
    } catch (e) {
      console.error("MCP POST error:", e);
      return jsonRpcError(500, -32603, "Internal server error");
    }
  }

  if (req.method === "GET" || req.method === "DELETE") {
    const tr = sessionHeader !== null ? transports[sessionHeader] : undefined;
    if (!sessionHeader || !tr) {
      return new Response("Invalid or missing session ID", { status: 400 });
    }
    return await tr.handleRequest(req);
  }

  return new Response("Method Not Allowed", { status: 405 });
}

function isWideBind(hostname: string): boolean {
  const h = hostname.trim();
  return h === "0.0.0.0" || h === "*" || h === "::";
}

export async function startHttpServer() {
  const port = Number(Bun.env["PORT"] ?? "3000");
  const tokenConfigured = Boolean(Bun.env["AUTH_TOKEN"]?.trim());
  const explicitHost = Bun.env["MCP_HOST"]?.trim();
  const hostname =
    explicitHost ?? (tokenConfigured ? "0.0.0.0" : "127.0.0.1");

  if (!tokenConfigured && isWideBind(hostname)) {
    console.error(
      "ATTENZIONE: MCP senza AUTH_TOKEN in ascolto su tutte le interfacce; chiunque raggiunga la porta può usarlo. Per uso solo su questo computer lascia MCP_HOST non impostato (default 127.0.0.1).",
    );
  } else if (!tokenConfigured) {
    console.error(
      "MCP in modalità locale: nessun Bearer richiesto, ascolto solo su " +
        hostname +
        " (non raggiungibile da altri PC sulla LAN salvo tunnel/proxy).",
    );
  }

  try {
    await bootstrapArgoSession();
  } catch (e) {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  // Bun default ~10s chiude connessioni idle → la SSE MCP cade e Cursor riconnette in loop.
  const rawIdle = Bun.env["MCP_IDLE_TIMEOUT"];
  const idleTimeout =
    rawIdle === undefined || rawIdle === ""
      ? 0
      : Number.parseInt(rawIdle, 10);
  const idle =
    Number.isFinite(idleTimeout) && idleTimeout >= 0 ? idleTimeout : 0;

  Bun.serve({
    port,
    hostname,
    idleTimeout: idle,
    async fetch(req) {
      const url = new URL(req.url);
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders() });
      }
      if (url.pathname !== "/mcp") {
        return new Response("Not Found", { status: 404 });
      }
      return withCors(await handleMcp(req));
    },
  });

  console.error(
    `argo-didup MCP Streamable HTTP su http://${hostname}:${port}/mcp`,
  );

  const shutdown = async () => {
    console.error("Shutdown in corso...");
    for (const id of Object.keys(transports)) {
      try {
        const tr = transports[id];
        if (tr) {
          await tr.close();
          delete transports[id];
        }
      } catch {}
    }
    await shutdownSession();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
