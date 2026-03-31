import { DynamicStructuredTool } from "@langchain/core/tools";
import { toJsonSchema } from "@langchain/core/utils/json_schema";
import { isInteropZodSchema } from "@langchain/core/utils/types";

/**
 * L'API Gemini (function declarations) non accetta alcune parole chiave JSON Schema,
 * ad es. `exclusiveMinimum` / `exclusiveMaximum` usate da Zod 4 per `.positive()` / `.gt()`.
 */
function stripUnsupportedKeywords(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map(stripUnsupportedKeywords);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === "exclusiveMinimum" || k === "exclusiveMaximum") continue;
    out[k] = stripUnsupportedKeywords(v);
  }
  return out;
}

/**
 * Schema pronto per Gemini: Zod → JSON Schema, clone profondo (niente getter),
 * strip di keyword non supportate. Usare anche sullo schema dopo il wrap dei tool.
 */
function finalizeSchema(schema: unknown): Record<string, unknown> {
  let json: unknown = isInteropZodSchema(schema) ? toJsonSchema(schema) : schema;
  if (typeof json !== "object" || json === null) {
    return { type: "object", properties: {} };
  }
  const cloned = structuredClone(json) as Record<string, unknown>;
  return stripUnsupportedKeywords(cloned) as Record<string, unknown>;
}

/** Converte Zod → JSON Schema o clona lo schema MCP, poi rimuove i campi non supportati da Gemini. */
function sanitizeTool(tool: DynamicStructuredTool): DynamicStructuredTool {
  const schema = finalizeSchema(tool.schema);
  return new DynamicStructuredTool({
    name: tool.name,
    description: tool.description,
    schema,
    // MCP: `content_and_artifact` richiede che _call restituisca una tupla; qui delegiamo a
    // `invoke()` che restituisce già output formattato (stringa / ToolMessage), non la tupla.
    responseFormat: "content",
    metadata: tool.metadata,
    defaultConfig: tool.defaultConfig,
    returnDirect: tool.returnDirect,
    func: (args, runManager, config) => tool.invoke(args, config),
  });
}

export default {
  stripUnsupportedKeywords,
  finalizeSchema,
  sanitizeTool,
};
