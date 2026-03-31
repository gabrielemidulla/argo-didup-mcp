import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { HumanMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { aiContentToString } from "../agent/ai-content.ts";
import logger from "../logging.ts";

const PDF_FETCH_TIMEOUT_MS = 90_000;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
const PDF_MAX_FILES = 10;
const PDF_MAX_TOTAL_BYTES = 40 * 1024 * 1024;

function assertArgoSignedPdfUrl(urlString: string): void {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error("URL non valido");
  }
  if (u.protocol !== "https:") {
    throw new Error("Solo URL https");
  }
  const h = u.hostname.toLowerCase();
  if (h !== "portaleargo.it" && !h.endsWith(".portaleargo.it")) {
    throw new Error(
      "URL non consentito: usa solo link PDF restituiti da bacheca (dominio portaleargo.it)",
    );
  }
}

function looksLikePdf(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf.slice(0, 5));
  if (head.length < 4) return false;
  return (
    head[0] === 0x25 &&
    head[1] === 0x50 &&
    head[2] === 0x44 &&
    head[3] === 0x46
  );
}

async function downloadArgoPdf(url: string): Promise<
  | { ok: true; b64: string; bytes: number }
  | { ok: false; error: string }
> {
  try {
    assertArgoSignedPdfUrl(url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  const res = await fetch(url, {
    signal: AbortSignal.timeout(PDF_FETCH_TIMEOUT_MS),
    redirect: "follow",
  });
  if (!res.ok) {
    return { ok: false, error: `HTTP ${res.status}` };
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength > PDF_MAX_BYTES) {
    return {
      ok: false,
      error: `PDF troppo grande (${buf.byteLength} byte, max ${PDF_MAX_BYTES})`,
    };
  }
  if (!looksLikePdf(buf)) {
    return { ok: false, error: "La risposta non sembra un PDF" };
  }
  return {
    ok: true,
    b64: Buffer.from(buf).toString("base64"),
    bytes: buf.byteLength,
  };
}

export function createLeggiCircolarePdfTool(
  visionLlm: ChatGoogleGenerativeAI,
): DynamicStructuredTool {
  const schema = z.object({
    urls: z
      .array(z.string().url())
      .min(1)
      .max(PDF_MAX_FILES)
      .describe(
        `Elenco di uno o più URL firmati dei PDF dalla risposta bacheca (campo files[].url). Copiali esattamente. Un solo file: array con un elemento, es. ["https://..."]. Massimo ${PDF_MAX_FILES} file.`,
      ),
    domanda: z
      .string()
      .describe(
        "Cosa vuoi sapere dai documenti (es. riassunto, confronto tra allegati, date importanti). In italiano.",
      ),
  });

  return new DynamicStructuredTool({
    name: "leggi_circolare_pdf",
    description:
      "Legge uno o più PDF di circolare Argo: scarica gli URL firmati dalla bacheca e li analizza insieme con Gemini (un'unica domanda su tutti gli allegati). Usa DOPO bacheca: passa tutti i files[].url rilevanti in `urls` (array). Gli URL scadono in fretta: chiamalo subito dopo bacheca.",
    schema,
    func: async ({ urls, domanda }) => {
      const tTool = performance.now();
      logger.log("tool:leggi_circolare_pdf:start", {
        fileCount: urls.length,
        urlsRedacted: urls.map((u: string) => logger.redactSignedUrl(u)),
        domanda: logger.previewText(domanda, 400),
      });

      const pdfParts: { type: "application/pdf"; data: string }[] = [];
      const failLines: string[] = [];
      let totalBytes = 0;

      for (let i = 0; i < urls.length; i++) {
        const u = urls[i]!;
        logger.log("tool:leggi_circolare_pdf:fetch-try", {
          index: i + 1,
          urlRedacted: logger.redactSignedUrl(u),
        });
        const r = await downloadArgoPdf(u);
        if (!r.ok) {
          failLines.push(`Allegato ${i + 1}: ${r.error}`);
          logger.warn("tool:leggi_circolare_pdf:fetch-failed", {
            index: i + 1,
            error: r.error,
          });
          continue;
        }
        if (totalBytes + r.bytes > PDF_MAX_TOTAL_BYTES) {
          failLines.push(
            `Allegato ${i + 1}: superato limite totale ${PDF_MAX_TOTAL_BYTES} byte (somma PDF)`,
          );
          logger.warn("tool:leggi_circolare_pdf:total-cap", {
            totalBytes,
            skipBytes: r.bytes,
          });
          break;
        }
        totalBytes += r.bytes;
        pdfParts.push({ type: "application/pdf", data: r.b64 });
        logger.log("tool:leggi_circolare_pdf:body", {
          index: i + 1,
          bytes: r.bytes,
          totalSoFar: totalBytes,
        });
      }

      if (pdfParts.length === 0) {
        return JSON.stringify({
          error: `Nessun PDF scaricato. ${failLines.join(" ")} Suggerimento: gli URL potrebbero essere scaduti; richiama bacheca e riprova.`,
        });
      }

      const n = pdfParts.length;
      const intro =
        failLines.length > 0
          ? `Nota: ${failLines.join("; ")}. Seguono ${n} PDF (solo scaricamenti riusciti, numerati da 1 a ${n} nello stesso ordine degli URL validi).\n\n`
          : n > 1
            ? `Seguono ${n} PDF numerati da 1 a ${n}, nello stesso ordine della richiesta.\n\n`
            : "";

      const docPhrase =
        n === 1 ? "il PDF allegato" : `i ${n} PDF allegati (documenti 1…${n})`;

      logger.log("tool:leggi_circolare_pdf:gemini-invoke", {
        pdfCount: n,
        totalBytes,
      });
      const msg = new HumanMessage({
        content: [
          ...pdfParts,
          {
            type: "text",
            text: `${intro}Sei un assistente per famiglie su circolari scolastiche. Leggi ${docPhrase} e rispondi in italiano, in modo chiaro e fedele ai testi. Se sono più documenti, integra o confronta le informazioni quando serve. Richiesta: ${domanda}`,
          },
        ],
      });
      const tLlm = performance.now();
      const out = await visionLlm.invoke([msg]);
      logger.log("tool:leggi_circolare_pdf:gemini-done", {
        llmMs: Math.round(performance.now() - tLlm),
      });
      const text = aiContentToString(out.content).trim();
      if (!text) {
        logger.warn("tool:leggi_circolare_pdf:empty-llm-output");
        return JSON.stringify({ error: "Gemini non ha restituito testo." });
      }
      const finalOut =
        text.length > 24_000 ? `${text.slice(0, 24_000)}\n…(troncato)` : text;
      logger.log("tool:leggi_circolare_pdf:done", {
        totalMs: Math.round(performance.now() - tTool),
        replyChars: finalOut.length,
        truncated: finalOut !== text,
        pdfCount: n,
      });
      return finalOut;
    },
  });
}
