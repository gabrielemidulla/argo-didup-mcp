import type { BaseMessage } from "@langchain/core/messages";
import userMemoryStore from "../memory-store.ts";
import userMemoryTools from "../user-memory-tools.ts";

type ReactAgentLike = {
  invoke: (input: {
    messages: BaseMessage[];
  }) => Promise<{ messages: unknown[] }>;
};

export function createInvokeAgentWithUserMemory(agent: ReactAgentLike) {
  return async function invokeAgentWithUserMemory(messages: BaseMessage[]) {
    const mem = await userMemoryStore.read();
    const input = userMemoryTools.injectIntoLatestHuman(messages, mem);
    const result = await agent.invoke({ messages: input });
    const cleaned = userMemoryTools.stripFromHistory(
      result.messages as BaseMessage[],
    );
    return { ...result, messages: cleaned };
  };
}

export function lastAiText(messages: BaseMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || m.getType() !== "ai") continue;
    const c = m.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      const parts = c
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
        .filter(Boolean);
      return parts.length > 0 ? parts.join("\n") : "(nessun testo)";
    }
    return String(c);
  }
  return "(nessuna risposta dal modello)";
}
