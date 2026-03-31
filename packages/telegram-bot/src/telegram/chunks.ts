import type { Bot, Context } from "grammy";
import { GrammyError, type InlineKeyboard } from "grammy";
import { extractInlineButtonsFromLlmText } from "../telegram-inline-buttons.ts";
import logger from "../logging.ts";
import {
  htmlToPlainText,
  sanitizeTelegramOutgoingHtml,
} from "./html.ts";

export const TELEGRAM_CHUNK_MAX = 4000;

export type TelegramChunk = { text: string; parseMode?: "HTML" };

/** Telegram HTML replies use parse_mode HTML; @grammyjs/stream targets plain text + entities instead. */
export function chunkHtmlForTelegram(
  html: string,
  maxLen = TELEGRAM_CHUNK_MAX,
): TelegramChunk[] {
  const trimmed = html.trim();
  if (trimmed.length === 0) return [{ text: "(vuoto)" }];
  if (trimmed.length <= maxLen) return [{ text: trimmed, parseMode: "HTML" }];

  const out: TelegramChunk[] = [];
  let buf = "";

  const flush = () => {
    if (buf) {
      out.push({ text: buf, parseMode: "HTML" });
      buf = "";
    }
  };

  const pushPlainSlices = (plain: string) => {
    let rest = plain;
    while (rest.length > 0) {
      out.push({ text: rest.slice(0, maxLen) });
      rest = rest.slice(maxLen);
    }
  };

  const paragraphs = trimmed.split(/\n\n+/);

  for (const para of paragraphs) {
    if (para.length > maxLen) {
      flush();
      const lines = para.split("\n");
      for (const line of lines) {
        if (line.length > maxLen) {
          flush();
          pushPlainSlices(htmlToPlainText(line));
          continue;
        }
        const cand = buf ? `${buf}\n${line}` : line;
        if (cand.length <= maxLen) buf = cand;
        else {
          flush();
          buf = line;
        }
      }
      continue;
    }
    const cand = buf ? `${buf}\n\n${para}` : para;
    if (cand.length <= maxLen) buf = cand;
    else {
      flush();
      buf = para;
    }
  }
  flush();
  return out;
}

export async function sendTelegramChunk(
  ctx: Context,
  chunk: TelegramChunk,
  isFirst: boolean,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    throw new Error("sendTelegramChunk: chat id mancante");
  }
  const { text, parseMode } = chunk;
  const opts = {
    ...(parseMode === "HTML" ? ({ parse_mode: "HTML" } as const) : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  try {
    if (isFirst) await ctx.reply(text, opts);
    else await ctx.api.sendMessage(chatId, text, opts);
    logger.log("telegram:chunk:sent", {
      isFirst,
      parseMode: parseMode ?? "none",
      length: text.length,
    });
  } catch (e) {
    if (
      parseMode === "HTML" &&
      e instanceof GrammyError &&
      e.error_code === 400
    ) {
      logger.warn("telegram:chunk:html-400-fallback-plain", {
        isFirst,
        length: text.length,
        grammyDescription: e.message,
      });
      const plain = htmlToPlainText(text);
      const plainOpts = replyMarkup ? { reply_markup: replyMarkup } : {};
      if (isFirst) await ctx.reply(plain, plainOpts);
      else await ctx.api.sendMessage(chatId, plain, plainOpts);
      return;
    }
    logger.error("telegram:chunk:send-failed", {
      isFirst,
      parseMode: parseMode ?? "none",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export function buildTelegramChunks(text: string): TelegramChunk[] {
  const trimmed = text.trim();
  const safe = sanitizeTelegramOutgoingHtml(trimmed);
  // Keep HTML for long bacheca replies so <a href> stays clickable; plain text would surface huge signed URLs.
  return chunkHtmlForTelegram(safe);
}

export async function replyWithHtml(
  ctx: Context,
  text: string,
): Promise<void> {
  const { displayText, keyboard } = extractInlineButtonsFromLlmText(text);
  const chunks = buildTelegramChunks(displayText);
  const trimmed = displayText.trim();
  const safe = sanitizeTelegramOutgoingHtml(trimmed);
  logger.log("reply:chunks", {
    totalChars: displayText.length,
    chunkCount: chunks.length,
    modes: chunks.map((c) => c.parseMode ?? "plain"),
    sanitized: true,
    inlineKeyboard: Boolean(keyboard),
    safeCharsOverChunkMax: safe.length > TELEGRAM_CHUNK_MAX,
  });
  const last = chunks.length - 1;
  for (let i = 0; i < chunks.length; i++) {
    await sendTelegramChunk(
      ctx,
      chunks[i]!,
      i === 0,
      i === last ? keyboard : undefined,
    );
  }
}

export async function sendTelegramChunkApi(
  api: Bot["api"],
  chatId: number,
  chunk: TelegramChunk,
  replyMarkup?: InlineKeyboard,
): Promise<void> {
  const { text, parseMode } = chunk;
  const opts = {
    ...(parseMode === "HTML" ? ({ parse_mode: "HTML" } as const) : {}),
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
  try {
    await api.sendMessage(chatId, text, opts);
    logger.log("telegram:chunk:sent", {
      isFirst: false,
      parseMode: parseMode ?? "none",
      length: text.length,
      via: "api",
    });
  } catch (e) {
    if (
      parseMode === "HTML" &&
      e instanceof GrammyError &&
      e.error_code === 400
    ) {
      logger.warn("telegram:chunk:html-400-fallback-plain", {
        via: "api",
        length: text.length,
        grammyDescription: e.message,
      });
      const plain = htmlToPlainText(text);
      await api.sendMessage(
        chatId,
        plain,
        replyMarkup ? { reply_markup: replyMarkup } : {},
      );
      return;
    }
    logger.error("telegram:chunk:send-failed", {
      via: "api",
      parseMode: parseMode ?? "none",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

export async function sendHtmlToChatId(
  api: Bot["api"],
  chatId: number,
  text: string,
  via: "automation" | "default" = "default",
): Promise<void> {
  const { displayText, keyboard } = extractInlineButtonsFromLlmText(text);
  const chunks = buildTelegramChunks(displayText);
  const trimmed = displayText.trim();
  const safe = sanitizeTelegramOutgoingHtml(trimmed);
  logger.log("reply:chunks", {
    totalChars: displayText.length,
    chunkCount: chunks.length,
    modes: chunks.map((c) => c.parseMode ?? "plain"),
    sanitized: true,
    via,
    inlineKeyboard: Boolean(keyboard),
    safeCharsOverChunkMax: safe.length > TELEGRAM_CHUNK_MAX,
  });
  const last = chunks.length - 1;
  for (let i = 0; i < chunks.length; i++) {
    await sendTelegramChunkApi(
      api,
      chatId,
      chunks[i]!,
      i === last ? keyboard : undefined,
    );
  }
}
