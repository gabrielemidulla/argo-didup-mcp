export type McpTextToolResult = {
  content: [{ type: "text"; text: string }];
  isError?: true;
};

function jsonResult(payload: unknown, pretty = false): McpTextToolResult {
  const text = pretty
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
  return { content: [{ type: "text", text }] };
}

function errorResult(message: string): McpTextToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

const SESSION_NOT_READY =
  "Sessione browser non inizializzata: riavvia il server MCP.";

function sessionNotReady(): McpTextToolResult {
  return errorResult(SESSION_NOT_READY);
}

function errorMessageFromUnknown(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default {
  jsonResult,
  errorResult,
  sessionNotReady,
  errorMessageFromUnknown,
};
