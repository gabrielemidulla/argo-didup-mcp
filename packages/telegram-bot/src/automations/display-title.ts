import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { aiContentToString } from "../agent/ai-content.ts";
import logger from "../logging.ts";

const AUTOMATION_TITLE_MAX_CHARS = 100;

function truncateTitleAtWordBoundary(s: string, maxLen: number): string {
  const t = s.trim();
  if (t.length <= maxLen) return t;
  const cut = t.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > Math.floor(maxLen * 0.35))
    return `${cut.slice(0, lastSpace).trimEnd()}…`;
  return `${cut.trimEnd()}…`;
}

function normalizeAutomationDisplayTitle(
  raw: string,
  fallback: string,
): string {
  let s = raw.replace(/\s+/g, " ").trim();
  const firstLine = (s.split("\n")[0] ?? "").trim();
  s = firstLine || s;
  s = s.replace(/^["'«»]+|["'«»]+$/g, "").trim();
  s = s.replace(/[<>]/g, "");
  if (s.length > AUTOMATION_TITLE_MAX_CHARS) {
    s = truncateTitleAtWordBoundary(s, AUTOMATION_TITLE_MAX_CHARS);
  }
  if (!s) return fallback;
  return s;
}

export async function synthesizeAutomationDisplayTitle(
  automationTitleLlm: ChatGoogleGenerativeAI,
  storedPrompt: string,
  fallback: string,
): Promise<string> {
  const snippet = storedPrompt.trim().slice(0, 2000);
  try {
    const res = await automationTitleLlm.invoke([
      new SystemMessage(
        "Rispondi con una sola riga in italiano: un titolo breve (massimo 10 parole) che descriva il promemoria. " +
          "Scrivi sempre parole intere: non interrompere a metà parola (es. no \"Controllo comp\"). " +
          "Niente virgolette, niente emoji nel titolo, niente due punti finali.",
      ),
      new HumanMessage(
        "Istruzioni salvate nel promemoria automatico (scuola / registro / Argo). " +
          "Sintetizza un nome da mostrare accanto a un orologio:\n\n" +
          snippet,
      ),
    ]);
    const raw = aiContentToString(res.content).trim();
    return normalizeAutomationDisplayTitle(raw, fallback);
  } catch (e) {
    logger.warn("automation:title-synthesis-failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return fallback;
  }
}
