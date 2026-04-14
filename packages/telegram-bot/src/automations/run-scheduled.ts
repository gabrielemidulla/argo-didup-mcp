import type { Bot } from "grammy";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { wrapAutomationPromptForAgent } from "../agent/message-context.ts";
import {
  toolProgressNotify,
  toolProgressSentThisTurn,
} from "../agent/tool-progress.ts";
import { createToolProgressNotifier } from "../bot/tool-progress-sender.ts";
import logger from "../logging.ts";
import { escapeHtml } from "../telegram/html.ts";
import { sendHtmlToChatId } from "../telegram/chunks.ts";
import { synthesizeAutomationDisplayTitle } from "./display-title.ts";
import type { AutomationRow } from "./repository.ts";

export function createRunScheduledAutomation(deps: {
  bot: Bot;
  allowedChatId: number;
  automationTitleLlm: BaseChatModel;
  invokeAgentWithUserMemory: (
    messages: BaseMessage[],
  ) => Promise<{ messages: unknown[] }>;
  lastAiText: (messages: BaseMessage[]) => string;
}) {
  return async function runScheduledAutomation(
    row: AutomationRow,
  ): Promise<void> {
    const when = new Date();
    const titleFallback = "Promemoria pianificato";
    const displayTitle = await synthesizeAutomationDisplayTitle(
      deps.automationTitleLlm,
      row.prompt,
      titleFallback,
    );
    const userText = wrapAutomationPromptForAgent(row.prompt, when);
    toolProgressSentThisTurn.current = new Set();
    toolProgressNotify.current = createToolProgressNotifier(
      deps.bot.api,
      deps.allowedChatId,
      { via: "automation" },
    );
    let result: Awaited<
      ReturnType<typeof deps.invokeAgentWithUserMemory>
    >;
    try {
      logger.log("automation:invoke:start", { id: row.id });
      result = await deps.invokeAgentWithUserMemory([
        new HumanMessage(userText),
      ]);
    } finally {
      toolProgressNotify.current = undefined;
    }
    const outMessages = result.messages as BaseMessage[];
    const reply = deps.lastAiText(outMessages);
    logger.log("automation:invoke:done", {
      id: row.id,
      replyChars: reply.length,
      preview: logger.previewText(reply, 240),
      displayTitle,
    });
    const header =
      `🕐 <i>Messaggio attivato dall'automazione</i> — <b>${escapeHtml(displayTitle)}</b>\n\n`;
    await sendHtmlToChatId(
      deps.bot.api,
      deps.allowedChatId,
      header + reply,
      "automation",
    );
  };
}
