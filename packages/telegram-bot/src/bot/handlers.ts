import { Bot, type Context } from "grammy";
import { sequentialize } from "@grammyjs/runner";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import {
  inlineActionStore,
  parseInlineCallbackData,
} from "../telegram-inline-buttons.ts";
import {
  toolProgressNotify,
  toolProgressSentThisTurn,
} from "../agent/tool-progress.ts";
import { wrapUserMessageWithDateTime } from "../agent/message-context.ts";
import logger from "../logging.ts";
import { replyWithHtml } from "../telegram/chunks.ts";
import { createToolProgressNotifier } from "./tool-progress-sender.ts";

export type TelegramHandlerDeps = {
  bot: Bot;
  allowedChatId: number;
  allowedInlineToolNames: Set<string>;
  tools: DynamicStructuredTool[];
  history: Map<number, BaseMessage[]>;
  invokeAgentWithUserMemory: (
    messages: BaseMessage[],
  ) => Promise<{ messages: unknown[] }>;
  lastAiText: (messages: BaseMessage[]) => string;
};

export function registerTelegramHandlers(deps: TelegramHandlerDeps): void {
  const {
    bot,
    allowedChatId,
    allowedInlineToolNames,
    tools,
    history,
    invokeAgentWithUserMemory,
    lastAiText,
  } = deps;

  bot.catch((err) => {
    logger.error("grammy:catch", err);
  });

  // Con `bot.start()`, getUpdates è in pausa finché finisce ogni handler: con
  // LangChain+MCP un messaggio può durare minuti e i successivi sembrano “persi”.
  // Il runner interroga Telegram in parallelo; sequentialize ordina per chat.
  bot.use(
    sequentialize((ctx: Context) =>
      ctx.chat !== undefined ? String(ctx.chat.id) : `u:${ctx.update.update_id}`,
    ),
  );

  bot.callbackQuery(/^ib1:[a-f0-9]{12}$/, async (ctx) => {
    const chatId = ctx.chat?.id;
    if (chatId === undefined || chatId !== allowedChatId) {
      await ctx.answerCallbackQuery({ text: "Non autorizzato." }).catch(() => {});
      return;
    }

    const rawId = parseInlineCallbackData(ctx.callbackQuery.data);
    if (!rawId) {
      await ctx.answerCallbackQuery().catch(() => {});
      return;
    }

    const payload = inlineActionStore.consume(rawId);
    if (!payload) {
      await ctx
        .answerCallbackQuery({
          text: "Pulsante scaduto o già usato. Chiedi di nuovo o aggiorna l’elenco.",
          show_alert: true,
        })
        .catch(() => {});
      return;
    }

    await ctx.answerCallbackQuery().catch(() => {});

    const notifyProgress = createToolProgressNotifier(ctx.api, chatId);

    try {
      await ctx.api.sendChatAction(chatId, "typing");

      if (payload.kind === "tool") {
        if (!allowedInlineToolNames.has(payload.tool)) {
          await ctx.reply("Questo strumento non è disponibile dai pulsanti inline.");
          return;
        }
        const tool = tools.find((t) => t.name === payload.tool);
        if (!tool) {
          await ctx.reply("Strumento non trovato.");
          return;
        }

        toolProgressSentThisTurn.current = new Set();
        toolProgressNotify.current = notifyProgress;
        let rawOut: unknown;
        try {
          rawOut = await tool.invoke(payload.input);
        } catch (e) {
          toolProgressNotify.current = undefined;
          throw e;
        }

        toolProgressSentThisTurn.current = new Set();

        const toolOutputStr =
          typeof rawOut === "string"
            ? rawOut
            : JSON.stringify(rawOut, null, 2);
        const capped =
          toolOutputStr.length > 120_000
            ? `${toolOutputStr.slice(0, 120_000)}\n\n…(output troncato)`
            : toolOutputStr;

        const prior = history.get(chatId) ?? [];
        const when = new Date();
        const inlineBody =
          `[Azione da pulsante inline]\n` +
          `Lo strumento «${payload.tool}» è già stato eseguito sul portale Argo. Qui sotto c’è l’output restituito dal tool (JSON o testo).\n\n` +
          `Compito: presenta questi dati in italiano per Telegram con HTML come nelle tue risposte abituali (<b>, link <a href="URL">etichetta</a> su una riga per ogni URL, elenchi leggibili). ` +
          `Non mostrare il JSON o il dump grezzo all’utente salvo richiesta esplicita dei dati raw.\n` +
          `Non richiamare lo stesso strumento con gli stessi parametri se l’output qui sotto è già sufficiente; puoi usare altri strumenti solo se servono davvero (es. leggi_circolare_pdf con URL appena ottenuti dalla bacheca).\n\n` +
          `--- OUTPUT STRUMENTO ---\n${capped}`;
        const wrapped = wrapUserMessageWithDateTime(inlineBody, when);
        const messages = [...prior, new HumanMessage(wrapped)];

        let result: Awaited<ReturnType<typeof invokeAgentWithUserMemory>>;
        try {
          result = await invokeAgentWithUserMemory(messages);
        } finally {
          toolProgressNotify.current = undefined;
        }
        const outMessages = result.messages as BaseMessage[];
        const reply = lastAiText(outMessages);
        await replyWithHtml(ctx, reply);
        history.set(chatId, outMessages);
      } else {
        toolProgressSentThisTurn.current = new Set();
        toolProgressNotify.current = notifyProgress;
        const prior = history.get(chatId) ?? [];
        const when = new Date();
        const wrapped = wrapUserMessageWithDateTime(
          `[Azione da pulsante inline] ${payload.message}`,
          when,
        );
        const messages = [...prior, new HumanMessage(wrapped)];
        let result: Awaited<ReturnType<typeof invokeAgentWithUserMemory>>;
        try {
          result = await invokeAgentWithUserMemory(messages);
        } finally {
          toolProgressNotify.current = undefined;
        }
        const outMessages = result.messages as BaseMessage[];
        const reply = lastAiText(outMessages);
        await replyWithHtml(ctx, reply);
        history.set(chatId, outMessages);
      }
    } catch (e) {
      logger.error("callback_query:inline-action", {
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      await ctx
        .reply(`Errore: ${e instanceof Error ? e.message : String(e)}`)
        .catch(() => {});
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.chat.id !== allowedChatId) {
      logger.log("message:ignored-chat", {
        chatId: ctx.chat.id,
        allowed: allowedChatId,
      });
      return;
    }

    try {
      logger.log("message:in", {
        chatId: ctx.chat.id,
        updateId: ctx.update.update_id,
        text: logger.previewText(ctx.message.text, 500),
      });
      await ctx.replyWithChatAction("typing");
      toolProgressSentThisTurn.current = new Set();

      const prior = history.get(ctx.chat.id) ?? [];
      const when = new Date(
        (ctx.message.date !== undefined ? ctx.message.date : Date.now() / 1000) *
          1000,
      );
      const userTextForAgent = wrapUserMessageWithDateTime(
        ctx.message.text,
        when,
      );
      const messages = [...prior, new HumanMessage(userTextForAgent)];
      logger.log("agent:history", {
        priorTurns: prior.length,
        messagesTotal: messages.length,
      });

      toolProgressNotify.current = createToolProgressNotifier(
        ctx.api,
        ctx.chat.id,
      );

      let result: Awaited<ReturnType<typeof invokeAgentWithUserMemory>>;
      const tAgent = performance.now();
      try {
        logger.log("agent:invoke:start");
        result = await invokeAgentWithUserMemory(messages);
        logger.log("agent:invoke:done", {
          ms: Math.round(performance.now() - tAgent),
          resultMessages: (result.messages as BaseMessage[]).length,
        });
      } finally {
        toolProgressNotify.current = undefined;
      }

      const outMessages = result.messages as BaseMessage[];
      const reply = lastAiText(outMessages);
      logger.log("agent:reply:extracted", {
        replyChars: reply.length,
        preview: logger.previewText(reply, 320),
      });
      await replyWithHtml(ctx, reply);
      history.set(ctx.chat.id, outMessages);
      logger.log("message:done", {
        chatId: ctx.chat.id,
        historyStoredMessages: outMessages.length,
      });
    } catch (e) {
      logger.error("message:error", {
        chatId: ctx.chat?.id,
        error: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      });
      await ctx
        .reply(`Errore: ${e instanceof Error ? e.message : String(e)}`)
        .catch((replyErr) =>
          logger.error("message:error-reply-failed", replyErr),
        );
    }
  });
}
