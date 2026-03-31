import { DynamicStructuredTool } from "@langchain/core/tools";
import geminiToolSchema from "../gemini-tool-schema.ts";
import logger from "../logging.ts";
import {
  toolProgressNotify,
  toolProgressSentThisTurn,
} from "../agent/tool-progress.ts";

export function wrapToolsWithTelegramProgress(
  baseTools: DynamicStructuredTool[],
): DynamicStructuredTool[] {
  return baseTools.map((original) => {
    return new DynamicStructuredTool({
      name: original.name,
      description: original.description,
      schema: geminiToolSchema.finalizeSchema(original.schema),
      func: async (input) => {
        const t0 = performance.now();
        const alreadyNotified = toolProgressSentThisTurn.current.has(
          original.name,
        );
        if (!alreadyNotified) {
          toolProgressSentThisTurn.current.add(original.name);
          logger.log("tool:notify:telegram", { name: original.name });
          await toolProgressNotify.current?.(original.name);
        } else {
          logger.log("tool:notify:skip-duplicate", { name: original.name });
        }
        const inputForLog =
          original.name === "leggi_circolare_pdf" &&
          input &&
          typeof input === "object"
            ? {
                ...(input as Record<string, unknown>),
                ...(Array.isArray((input as { urls?: unknown }).urls)
                  ? {
                      urls: (input as { urls: string[] }).urls.map((u) =>
                        logger.redactSignedUrl(String(u)),
                      ),
                    }
                  : {}),
              }
            : input;
        logger.log("tool:invoke:start", {
          name: original.name,
          input: logger.safeJsonPreview(inputForLog),
        });
        try {
          const out = await original.invoke(input);
          logger.log("tool:invoke:ok", {
            name: original.name,
            ms: Math.round(performance.now() - t0),
            outputPreview: logger.previewText(String(out), 400),
          });
          return out;
        } catch (e) {
          logger.error("tool:invoke:error", {
            name: original.name,
            ms: Math.round(performance.now() - t0),
            error: e instanceof Error ? e.message : String(e),
          });
          throw e;
        }
      },
    });
  });
}

export const sanitizeDynamicToolForGemini = geminiToolSchema.sanitizeTool;
