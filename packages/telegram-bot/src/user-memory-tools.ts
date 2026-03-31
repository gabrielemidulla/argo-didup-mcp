import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import userMemoryStore, {
  USER_MEMORY_MESSAGE_END,
  USER_MEMORY_MESSAGE_START,
  USER_MEMORY_SYSTEM_TAG,
} from "./memory-store.ts";

function messageContentAsPlainText(m: BaseMessage): string {
  const c = m.content;
  if (typeof c === "string") return c;
  if (Array.isArray(c)) {
    return c
      .map((block) => {
        if (typeof block === "string") return block;
        if (
          block &&
          typeof block === "object" &&
          "type" in block &&
          block.type === "text" &&
          "text" in block
        ) {
          return String((block as { text: string }).text);
        }
        return "";
      })
      .join("\n");
  }
  return String(c);
}

function stripMemoryInjectionFromPlainText(content: string): string {
  const start = content.indexOf(USER_MEMORY_MESSAGE_START);
  if (start === -1) return content;
  const end = content.indexOf(USER_MEMORY_MESSAGE_END, start);
  if (end === -1) return content;
  const after = content.slice(end + USER_MEMORY_MESSAGE_END.length);
  return (content.slice(0, start) + after).replace(/^\s*\n+/, "");
}

/**
 * Inietta MEMORY.md nell’ultimo messaggio umano del turno (LangGraph aggiunge già una SystemMessage
 * col prompt; Gemini non ammette una seconda SystemMessage in coda al thread).
 */
function injectIntoLatestHuman(
  messages: BaseMessage[],
  memoryMarkdown: string,
): BaseMessage[] {
  const t = memoryMarkdown.trim();
  if (!t) return messages;

  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg !== undefined && msg.getType() === "human") {
      idx = i;
      break;
    }
  }
  const block = userMemoryStore.buildInjectionBlock(t);
  if (idx === -1) {
    return [...messages, new HumanMessage(block.trimEnd())];
  }
  const at = messages[idx];
  if (at === undefined) return [...messages, new HumanMessage(block.trimEnd())];
  const prev = messageContentAsPlainText(at);
  const next = [...messages];
  next[idx] = new HumanMessage(`${block}${prev}`);
  return next;
}

/** Rimuove dalla history il blocco memoria (e eventuali vecchie system iniettate). */
function stripFromHistory(messages: BaseMessage[]): BaseMessage[] {
  return messages
    .map((m) => {
      if (m.getType() === "system") {
        const text = messageContentAsPlainText(m);
        if (text.includes(USER_MEMORY_SYSTEM_TAG)) return null;
        return m;
      }
      if (m.getType() === "human") {
        const text = messageContentAsPlainText(m);
        const stripped = stripMemoryInjectionFromPlainText(text);
        if (stripped === text) return m;
        return new HumanMessage(stripped);
      }
      return m;
    })
    .filter((m): m is BaseMessage => m != null);
}

function createTools(): DynamicStructuredTool[] {
  const readTool = new DynamicStructuredTool({
    name: "user_memory_read",
    description:
      "Legge il file MEMORY.md locale (preferenze e note persistenti dell’utente). Usa prima di modificarlo o per confermare cosa c’è scritto.",
    schema: z.object({}),
    func: async () => {
      const s = await userMemoryStore.read();
      if (!s.trim()) {
        return JSON.stringify({
          ok: true,
          empty: true,
          message: "Memoria vuota (file assente o senza contenuto).",
        });
      }
      return JSON.stringify({
        ok: true,
        empty: false,
        content: s,
      });
    },
  });

  const updateTool = new DynamicStructuredTool({
    name: "user_memory_update",
    description:
      "Aggiorna MEMORY.md: preferenze stabili (es. non mostrare nomi docenti in orario, tono delle risposte). Usa quando l’utente chiede di ricordare qualcosa in modo permanente. clear svuota tutto; replace sostituisce l’intero file; append aggiunge in coda (separato da righe vuote).",
    schema: z.object({
      mode: z
        .enum(["replace", "append", "clear"])
        .describe("replace = sovrascrive tutto; append = aggiunge in coda; clear = elimina il file"),
      content: z
        .string()
        .optional()
        .describe(
          "Testo Markdown (obbligatorio per replace/append; ignorato per clear)",
        ),
    }),
    func: async ({ mode, content }) => {
      try {
        if (mode === "clear") {
          await userMemoryStore.clear();
          return JSON.stringify({
            ok: true,
            message: "Memoria persistente cancellata.",
          });
        }
        const raw = content ?? "";
        if (mode === "replace") {
          await userMemoryStore.writeReplace(raw);
          return JSON.stringify({
            ok: true,
            message: "MEMORY.md aggiornato (sostituzione completa).",
          });
        }
        await userMemoryStore.append(raw);
        return JSON.stringify({
          ok: true,
          message: "Testo aggiunto in coda a MEMORY.md.",
        });
      } catch (e) {
        return JSON.stringify({
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  });

  return [readTool, updateTool];
}

export default {
  injectIntoLatestHuman,
  stripFromHistory,
  createTools,
};
