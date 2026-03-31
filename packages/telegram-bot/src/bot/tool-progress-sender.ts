import type { Bot } from "grammy";
import {
  TOOL_PROGRESS_HTML,
  withToolProgressPrefix,
} from "../agent/tool-progress.ts";
import logger from "../logging.ts";
import { escapeHtml } from "../telegram/html.ts";

export function createToolProgressNotifier(
  api: Bot["api"],
  chatId: number,
  opts?: { via?: string },
): (toolName: string) => Promise<void> {
  const via = opts?.via;
  return async (toolName: string) => {
    const body =
      TOOL_PROGRESS_HTML[toolName] ??
      `Strumento <code>${escapeHtml(toolName)}</code> in esecuzione…`;
    try {
      await api.sendMessage(chatId, `<i>${withToolProgressPrefix(body)}</i>`, {
        parse_mode: "HTML",
      });
      logger.log("telegram:progress-sent", {
        toolName,
        parseMode: "HTML",
        ...(via ? { via } : {}),
      });
    } catch (progressErr) {
      logger.warn("telegram:progress-html-failed", {
        toolName,
        ...(via ? { via } : {}),
        error:
          progressErr instanceof Error
            ? progressErr.message
            : String(progressErr),
      });
      const plain = withToolProgressPrefix(body.replace(/<[^>]*>/g, ""));
      await api.sendMessage(chatId, plain).catch((e) => {
        logger.error("telegram:progress-plain-failed", toolName, e);
      });
    }
  };
}
