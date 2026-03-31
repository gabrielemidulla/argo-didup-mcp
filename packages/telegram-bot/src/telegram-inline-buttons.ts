import { InlineKeyboard } from "grammy";
import { LRUCache } from "lru-cache";
import { randomBytes } from "node:crypto";
import { z } from "zod";

/** Prefisso callback_data (Telegram max 64 byte UTF-8). */
export const INLINE_CALLBACK_PREFIX = "ib1:" as const;

const ID_HEX_LEN = 12;

const toolButtonSchema = z.object({
  action: z.literal("tool"),
  text: z.string().min(1).max(64),
  tool: z.string().min(1).max(80),
  input: z.record(z.string(), z.unknown()),
});

const promptButtonSchema = z.object({
  action: z.literal("prompt"),
  text: z.string().min(1).max(64),
  message: z.string().min(1).max(3500),
});

const buttonRowSchema = z.discriminatedUnion("action", [
  toolButtonSchema,
  promptButtonSchema,
]);

const buttonsFileSchema = z.array(buttonRowSchema).min(1).max(8);

export type InlineStoredPayload =
  | { v: 1; kind: "tool"; tool: string; input: Record<string, unknown> }
  | { v: 1; kind: "prompt"; message: string };

const START = "<<<TG_INLINE_BUTTONS";
const END = ">>>";

function newActionId(): string {
  return randomBytes(ID_HEX_LEN / 2).toString("hex");
}

/**
 * Memorizza payload troppo grandi per callback_data; TTL e limite dimensione mappa.
 */
export class InlineActionStore {
  private readonly cache = new LRUCache<string, InlineStoredPayload>({
    max: 400,
    ttl: 45 * 60 * 1000,
    ttlAutopurge: true,
  });

  readonly ttlMs = 45 * 60 * 1000;
  readonly maxEntries = 400;

  /** Restituisce il valore completo per callback_data (es. ib1:a1b2c3d4e5f6). */
  register(payload: InlineStoredPayload): string {
    const id = newActionId();
    this.cache.set(id, payload);
    return `${INLINE_CALLBACK_PREFIX}${id}`;
  }

  /** Una tantum: dopo la lettura l’entry viene rimossa. */
  consume(id: string): InlineStoredPayload | undefined {
    const p = this.cache.get(id);
    if (p === undefined) return undefined;
    this.cache.delete(id);
    return p;
  }
}

export const inlineActionStore = new InlineActionStore();

export function parseInlineCallbackData(data: string): string | undefined {
  if (!data.startsWith(INLINE_CALLBACK_PREFIX)) return undefined;
  const id = data.slice(INLINE_CALLBACK_PREFIX.length);
  if (!/^[a-f0-9]{12}$/.test(id)) return undefined;
  return id;
}

/**
 * Estrae il blocco pulsanti dal testo LLM e costruisce la tastiera; il blocco non viene mostrato.
 */
export function extractInlineButtonsFromLlmText(raw: string): {
  displayText: string;
  keyboard?: InlineKeyboard;
} {
  const idx = raw.lastIndexOf(START);
  if (idx === -1) return { displayText: raw };
  const endRel = raw.indexOf(END, idx + START.length);
  if (endRel === -1) return { displayText: raw };

  const jsonSlice = raw.slice(idx + START.length, endRel).trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSlice);
  } catch {
    return { displayText: raw };
  }

  const checked = buttonsFileSchema.safeParse(parsed);
  if (!checked.success) return { displayText: raw };

  const kb = new InlineKeyboard();
  for (const btn of checked.data) {
    if (btn.action === "tool") {
      const cb = inlineActionStore.register({
        v: 1,
        kind: "tool",
        tool: btn.tool,
        input: btn.input,
      });
      kb.text(btn.text, cb).row();
    } else {
      const cb = inlineActionStore.register({
        v: 1,
        kind: "prompt",
        message: btn.message,
      });
      kb.text(btn.text, cb).row();
    }
  }

  const displayText = `${raw.slice(0, idx)}${raw.slice(endRel + END.length)}`.trim();
  return { displayText, keyboard: kb };
}
