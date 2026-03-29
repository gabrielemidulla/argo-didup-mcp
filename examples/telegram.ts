/**
 * Bot Telegram in polling: LangChain ReAct + tool MCP HTTP locale (Argo).
 * Avvia prima il server MCP: `bun index.ts serve`
 * Poi: `bun index.ts telegram`
 */
import { Bot, GrammyError, type Context } from "grammy";
import { run, sequentialize } from "@grammyjs/runner";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { HumanMessage, type BaseMessage } from "@langchain/core/messages";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

// --- Logging (stdout/stderr): niente token, chiavi API o query string degli URL firmati
const LOG_NS = "[telegram-bot]";

function logTs(): string {
  return new Date().toISOString();
}

function log(...args: unknown[]) {
  console.log(logTs(), LOG_NS, ...args);
}

function logWarn(...args: unknown[]) {
  console.warn(logTs(), LOG_NS, ...args);
}

function logError(...args: unknown[]) {
  console.error(logTs(), LOG_NS, ...args);
}

function previewText(s: string, max = 240): string {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}… (${t.length} caratteri)`;
}

/** Per log: solo origine + path, senza query (firme CloudFront). */
function redactSignedUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return "<url-non-valido>";
  }
}

function safeJsonPreview(value: unknown, max = 600): string {
  try {
    const s = JSON.stringify(value);
    return s.length <= max ? s : `${s.slice(0, max)}… (${s.length} byte JSON)`;
  } catch {
    return String(value);
  }
}

/** Fuso orario mostrato all'agent per contestualizzare i messaggi (scuola italiana). */
const USER_MESSAGE_TIMEZONE = "Europe/Rome";

/**
 * Antepone giorno (nome in inglese), data e ora al testo inviato all'agent.
 * `when` di solito da `ctx.message.date` (Unix Telegram).
 */
function wrapUserMessageWithDateTime(text: string, when: Date): string {
  const weekdayEn = new Intl.DateTimeFormat("en-US", {
    timeZone: USER_MESSAGE_TIMEZONE,
    weekday: "long",
  }).format(when);
  const dateTimeIt = new Intl.DateTimeFormat("it-IT", {
    timeZone: USER_MESSAGE_TIMEZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(when);
  return `[Messaggio dell'utente ricevuto ${weekdayEn}, ${dateTimeIt} (${USER_MESSAGE_TIMEZONE})]\n\n${text}`;
}

const token = Bun.env.TELEGRAM_BOT_TOKEN;
const allowedChatIdRaw = Bun.env.TELEGRAM_CHAT_ID;
const googleApiKey = Bun.env.GOOGLE_API_KEY;
const authToken = Bun.env.AUTH_TOKEN;
const port = Bun.env.PORT ?? "3000";
const mcpUrl = Bun.env.MCP_URL ?? `http://localhost:${port}/mcp`;

if (!token) {
  throw new Error("Imposta TELEGRAM_BOT_TOKEN nel file .env");
}
if (!allowedChatIdRaw) {
  throw new Error(
    "Imposta TELEGRAM_CHAT_ID nel file .env (solo quel chat riceve risposte)",
  );
}
if (!googleApiKey) {
  throw new Error("Imposta GOOGLE_API_KEY nel file .env");
}
if (!authToken) {
  throw new Error("Imposta AUTH_TOKEN (stesso token del server MCP HTTP)");
}

const allowedChatId = Number(allowedChatIdRaw);
if (!Number.isFinite(allowedChatId)) {
  throw new Error(
    "TELEGRAM_CHAT_ID deve essere un numero (es. il tuo user id Telegram)",
  );
}

log("bootstrap", {
  mcpUrl,
  port,
  allowedChatId,
  telegramTokenPresent: Boolean(token && token.length > 0),
  googleApiKeyPresent: Boolean(googleApiKey && googleApiKey.length > 0),
  authTokenPresent: Boolean(authToken && authToken.length > 0),
});

const mcpClient = new MultiServerMCPClient({
  argo: {
    transport: "http",
    url: mcpUrl,
    headers: { Authorization: `Bearer ${authToken}` },
  },
});

/** Messaggi brevi mentre gira un tool MCP (HTML sicuro). */
const TOOL_PROGRESS_HTML: Record<string, string> = {
  "voti-giornalieri": "Sto recuperando i <b>voti</b> dal portale…",
  bacheca: "Sto consultando la <b>bacheca</b> (circolari)…",
  "compiti-assegnati": "Sto caricando i <b>compiti assegnati</b>…",
  "attivita-svolte": "Sto caricando le <b>attività svolte</b> in classe…",
  "orario-famiglia": "Sto caricando l'<b>orario</b> della classe…",
  "consiglio-classe":
    "Sto caricando l'elenco degli <b>eletti al consiglio di classe</b>…",
  "consiglio-istituto":
    "Sto caricando l'elenco degli <b>eletti al consiglio d'istituto</b>…",
  "docenti-classe": "Sto caricando l'elenco dei <b>docenti</b> della classe…",
  promemoria: "Sto caricando i <b>promemoria</b> della classe…",
  note: "Sto caricando le <b>note</b> (disciplinari / generiche)…",
  assenze: "Sto caricando le <b>assenze</b>, uscite e ritardi…",
  "curriculum-alunno": "Sto caricando il <b>curriculum</b> dell'alunno…",
  "dati-anagrafici": "Sto caricando i <b>dati anagrafici</b>…",
  "voti-scrutini": "Sto caricando i <b>voti di scrutinio</b>…",
  leggi_circolare_pdf:
    "Scarico i <b>PDF</b> delle circolari e li analizzo con Gemini…",
};

const PDF_FETCH_TIMEOUT_MS = 90_000;
const PDF_MAX_BYTES = 20 * 1024 * 1024;
const PDF_MAX_FILES = 10;
/** Limite somma dimensioni di tutti i PDF inviati a Gemini in una chiamata. */
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

function aiContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && "text" in b) {
          return String((b as { text: string }).text);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return String(content ?? "");
}

function createLeggiCircolarePdfTool(
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
      log("tool:leggi_circolare_pdf:start", {
        fileCount: urls.length,
        urlsRedacted: urls.map(redactSignedUrl),
        domanda: previewText(domanda, 400),
      });

      const pdfParts: { type: "application/pdf"; data: string }[] = [];
      const failLines: string[] = [];
      let totalBytes = 0;

      for (let i = 0; i < urls.length; i++) {
        const u = urls[i]!;
        log("tool:leggi_circolare_pdf:fetch-try", {
          index: i + 1,
          urlRedacted: redactSignedUrl(u),
        });
        const r = await downloadArgoPdf(u);
        if (!r.ok) {
          failLines.push(`Allegato ${i + 1}: ${r.error}`);
          logWarn("tool:leggi_circolare_pdf:fetch-failed", {
            index: i + 1,
            error: r.error,
          });
          continue;
        }
        if (totalBytes + r.bytes > PDF_MAX_TOTAL_BYTES) {
          failLines.push(
            `Allegato ${i + 1}: superato limite totale ${PDF_MAX_TOTAL_BYTES} byte (somma PDF)`,
          );
          logWarn("tool:leggi_circolare_pdf:total-cap", {
            totalBytes,
            skipBytes: r.bytes,
          });
          break;
        }
        totalBytes += r.bytes;
        pdfParts.push({ type: "application/pdf", data: r.b64 });
        log("tool:leggi_circolare_pdf:body", {
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

      log("tool:leggi_circolare_pdf:gemini-invoke", {
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
      log("tool:leggi_circolare_pdf:gemini-done", {
        llmMs: Math.round(performance.now() - tLlm),
      });
      const text = aiContentToString(out.content).trim();
      if (!text) {
        logWarn("tool:leggi_circolare_pdf:empty-llm-output");
        return JSON.stringify({ error: "Gemini non ha restituito testo." });
      }
      const finalOut =
        text.length > 24_000 ? `${text.slice(0, 24_000)}\n…(troncato)` : text;
      log("tool:leggi_circolare_pdf:done", {
        totalMs: Math.round(performance.now() - tTool),
        replyChars: finalOut.length,
        truncated: finalOut !== text,
        pdfCount: n,
      });
      return finalOut;
    },
  });
}

const toolProgressNotify: { current?: (toolName: string) => Promise<void> } =
  {};

/** Un solo messaggio di stato per nome tool per ogni messaggio utente (evita spam se l'agent richiama bacheca più volte). */
const toolProgressSentThisTurn: { current: Set<string> } = {
  current: new Set(),
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function wrapToolsWithTelegramProgress(
  baseTools: DynamicStructuredTool[],
): DynamicStructuredTool[] {
  return baseTools.map((original) => {
    return new DynamicStructuredTool({
      name: original.name,
      description: original.description,
      schema: original.schema,
      func: async (input) => {
        const t0 = performance.now();
        const alreadyNotified = toolProgressSentThisTurn.current.has(
          original.name,
        );
        if (!alreadyNotified) {
          toolProgressSentThisTurn.current.add(original.name);
          log("tool:notify:telegram", { name: original.name });
          await toolProgressNotify.current?.(original.name);
        } else {
          log("tool:notify:skip-duplicate", { name: original.name });
        }
        const inputForLog =
          original.name === "leggi_circolare_pdf" &&
          input &&
          typeof input === "object"
            ? {
                ...(input as Record<string, unknown>),
                ...(Array.isArray((input as { urls?: unknown }).urls)
                  ? {
                      urls: (input as { urls: string[] }).urls.map(
                        (u) => redactSignedUrl(String(u)),
                      ),
                    }
                  : {}),
              }
            : input;
        log("tool:invoke:start", {
          name: original.name,
          input: safeJsonPreview(inputForLog),
        });
        try {
          const out = await original.invoke(input);
          log("tool:invoke:ok", {
            name: original.name,
            ms: Math.round(performance.now() - t0),
            outputPreview: previewText(String(out), 400),
          });
          return out;
        } catch (e) {
          logError("tool:invoke:error", {
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

const llm = new ChatGoogleGenerativeAI({
  model: "gemini-3-flash-preview",
  apiKey: googleApiKey,
});

const leggiCircolarePdfTool = createLeggiCircolarePdfTool(llm);
log("mcp:getTools…");
const mcpTools = (await mcpClient.getTools()) as DynamicStructuredTool[];
log("mcp:getTools:ok", {
  mcpToolCount: mcpTools.length,
  names: mcpTools.map((t) => t.name),
});
const tools = wrapToolsWithTelegramProgress([
  ...mcpTools,
  leggiCircolarePdfTool,
]);
log("agent:tools:ready", {
  totalTools: tools.length,
  names: tools.map((t) => t.name),
});

const agent = createReactAgent({
  llm,
  tools,
  prompt: `Sei un assistente per il portale Argo ScuolaNext. Strumenti MCP: voti-giornalieri, bacheca (circolari: senza parametri extra = ultime N; con cerca = ricerca testuale sul contenuto visibile delle circolari, parole separate da spazio = tutte devono comparire, senza caratteri jolly tipo SQL), compiti-assegnati (compiti: filtri materia, contenuto, data_da/data_a sulla data in legend DD/MM/YYYY), attivita-svolte (argomenti/attività in classe: legend=materia, ogni riga ha data in prima colonna e descrizione; stessi filtri, le date del filtro sono sulla data riga; per «cosa abbiamo fatto mercoledì scorso» calcola data_da/data_a dal messaggio utente usando anche la data/ora del messaggio se presente), orario-famiglia (griglia ore × giorni; slot con fascia, giorno, data colonna, materia, docenti — regole d'uso sotto), consiglio-classe (eletti: nominativo, sesso M/F, ruolo Alunno/Genitore; filtri nominativo, ruolo, sesso), consiglio-istituto (eletti: nominativo, sesso, tipo componente, componenteGiunta, nota; filtri analoghi + componente_giunta boolean), docenti-classe (docenti: nominativo, coordinatoreClasse se (*) sul nome in portale, materie[]; filtri nominativo, materia), promemoria (data, appunto, inseritaDa; filtri data_da/data_a DD/MM/YYYY Europe/Rome: se il range può includere date prima di oggi carica anche i passati col checkbox poi filtra; se solo futuro o senza date non usa il checkbox), note (note disciplinari/generiche alunno: data, nota, inseritaDa, categoria, orario; filtri categoria e data_da/data_a), assenze (oggetto con totali del portale + righe per giorno con eventi; filtri su righe), curriculum-alunno (tabella anni: anno, classe, credito, media, esito, iconaSmile; senza parametri), dati-anagrafici (anagrafica alunno: cognome, nome, nascita, sesso, CF, comuni, indirizzo, telefono; senza parametri), voti-scrutini (parametro quadrimestre: 1 = primo quadrimestre con voti per tipologia, 2 = scrutinio finale con voto unico; per 2 può comparire avvisoFamiglia se i voti non sono ancora visibili). Nel bot: anche leggi_circolare_pdf (scarica uno o più PDF dagli URL della bacheca e li analizza con Gemini in un colpo solo). Rispondi in italiano in modo chiaro e conciso.

Orario (orario-famiglia): per «domani», «oggi», «lunedì», «cosa ho mercoledì» ecc. calcola il giorno della settimana rispetto alla data e all'ora del messaggio utente (fuso Europe/Rome) e chiama lo strumento con **giorno** impostato al nome italiano del giorno (es. giorno: "lunedì", "martedì"). **Non** usare data_da/data_a per questo tipo di domande: quei filtri confrontano solo le **date DD/MM/YYYY scritte nelle intestazioni colonna** della settimana che il portale sta mostrando; se la data che hai in mente non compare lì, ottieni elenco vuoto o sbagliato. Usa data_da/data_a solo quando l'utente chiede esplicitamente un intervallo o date precise da incrociare con quelle in colonna. Combinazioni utili: giorno + materia, giorno + contenuto, fascia.

Se l'utente chiede una circolare per parola chiave (es. "natale", "sciopero"), usa bacheca con cerca impostato al testo (es. cerca: "natale") invece di scaricare solo l'elenco generico senza filtro.

Per il contenuto dei PDF (es. "di cosa parla?", confronto tra allegati): (1) bacheca (con cerca se serve) per ottenere gli URL; (2) subito leggi_circolare_pdf con urls = array di tutti i files[].url necessari (anche uno solo: ["..."]) + domanda. Gli URL scadono in circa 1 minuto.

Tono Telegram: usa molte emoji nelle risposte (titoli, elenchi, esiti positivi/negativi, promemoria) per renderle vivaci e leggibili; variare (📚 📌 ✅ ⚠️ 🎯 📊 ecc.) senza esagerare fino a rendere illeggibile.

Formattazione: il messaggio sarà inviato a Telegram con parse_mode HTML. Usa solo HTML supportato da Telegram, niente Markdown (niente asterischi *, grassetto con tag).
- Grassetto: <b>testo</b>
- Corsivo: <i>testo</i>
- Codice inline: <code>testo</code>
- Blocco: <pre>riga1\nriga2</pre>
- Link (tutto su una sola riga, mai spezzare tra URL e testo): <a href="https://esempio.it/path">testo del link</a>
- Elenchi: righe con "- " o "1. " (testo normale, senza tag lista obbligatori)
- Liste lunghe (bacheca): separa ogni circolare con una riga vuota (doppio a capo); il client invia più messaggi se supera il limite Telegram, così i tag HTML non si spezzano a metà.
- Circolari / PDF dalla bacheca: ogni volta che mostri link agli allegati, avvisa chiaramente che <b>scadono dopo circa 1 minuto</b> (URL firmati); invita ad aprirli o scaricarli subito.

Nei testi evita i caratteri < e & letterali; se servono, usa &lt; e &amp;. Chiudi sempre i tag.

Quando riporti i voti (numeri con decimali), usa questa convenzione scolastica in italiano (puoi usare <b> sul simbolo), non solo il decimale grezzo:
- Se termina in .5 → "N e mezzo" (es. 8.5 → <b>8 e mezzo</b> / otto e mezzo).
- Tra .01 e .49 sopra N → "N+" (es. 8.15 → <b>8+</b> / otto più).
- Tra .51 e .99 sotto N+1 → "(N+1)-" (es. 7.85 → <b>8-</b> / otto meno).
Stesso schema per tutti i voti (es. 6+, 7 e mezzo, 9-).`,
});

log("agent:createReactAgent:ok", { model: "gemini-3-flash-preview" });

const history = new Map<number, BaseMessage[]>();

function lastAiText(messages: BaseMessage[]): string {
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

/** Margine sotto il limite Telegram (4096) per evitare rifiuti sul bordo. */
const TELEGRAM_CHUNK_MAX = 4000;

type TelegramChunk = { text: string; parseMode?: "HTML" };

/** Da HTML a testo leggibile (fallback se parse_mode fallisce o riga troppo lunga). */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(
      /<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, inner: string) => {
        const label = inner.replace(/<[^>]+>/g, "").trim() || "link";
        return `${label}: ${href}`;
      },
    )
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Placeholder per non alterare il contenuto dei blocchi <pre> (possono contenere `<`). */
const PRE_PH = "\uFFF0";
const PRE_END = "\uFFF1";

function maskTelegramPreBlocks(html: string): { masked: string; blocks: string[] } {
  const blocks: string[] = [];
  const masked = html.replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, (block) => {
    blocks.push(block);
    return `${PRE_PH}PRE_${blocks.length - 1}${PRE_END}`;
  });
  return { masked, blocks };
}

function unmaskTelegramPreBlocks(masked: string, blocks: string[]): string {
  return masked.replace(
    new RegExp(`${PRE_PH}PRE_(\\d+)${PRE_END}`, "g"),
    (_, id: string) => blocks[Number(id)] ?? "",
  );
}

/**
 * Tag supportati (stile Telegram HTML) per bilanciamento; ignora il resto poi escapeStrayLt.
 */
const TG_BALANCE_TAG_RE =
  /<\/?(b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(\s[^>]*)?>/gi;

/**
 * Rimuove chiusure orfane, inserisce chiusure mancanti a fine stringa, chiude i tag interni
 * quando il modello chiude il contenitore fuori ordine (es. <b><i>x</b>).
 */
function rewriteBalancedTelegramHtml(html: string): string {
  const stack: string[] = [];
  const out: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(TG_BALANCE_TAG_RE.source, "gi");
  while ((m = re.exec(html)) !== null) {
    out.push(html.slice(last, m.index));
    const full = m[0];
    const name = m[1]!.toLowerCase();
    last = m.index + full.length;
    if (full.startsWith("</")) {
      const idx = stack.lastIndexOf(name);
      if (idx === -1) {
        continue;
      }
      while (stack.length > idx + 1) {
        const inner = stack.pop()!;
        out.push(`</${inner}>`);
      }
      stack.pop();
      out.push(full);
    } else {
      stack.push(name);
      out.push(full);
    }
  }
  out.push(html.slice(last));
  while (stack.length > 0) {
    out.push(`</${stack.pop()}>`);
  }
  return out.join("");
}

/** `<` che non inizia un tag Telegram noto → entità (evita "Unclosed start tag" su `<` nel testo). */
function escapeStrayLtTelegram(html: string): string {
  const tagHead =
    /^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(?:\s|>|\/)/i;
  const spanSpoiler =
    /^<span(?:\s[^>]*)?class\s*=\s*["'][^"']*tg-spoiler[^"']*["'][^>]*>/i;
  let out = "";
  let i = 0;
  while (i < html.length) {
    const c = html[i]!;
    if (c !== "<") {
      out += c;
      i++;
      continue;
    }
    const rest = html.slice(i);
    let len = 0;
    if (tagHead.test(rest)) {
      const m = rest.match(/^<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|a|tg-spoiler)(\s[^>]*)?>/i);
      len = m?.[0].length ?? 0;
    } else if (spanSpoiler.test(rest)) {
      const m = rest.match(spanSpoiler);
      len = m?.[0].length ?? 0;
    }
    if (len > 0) {
      out += rest.slice(0, len);
      i += len;
    } else {
      out += "&lt;";
      i++;
    }
  }
  return out;
}

/** HTML sicuro per parse_mode HTML: pre intatti, tag bilanciati, `<` spuri escapati. */
function sanitizeTelegramOutgoingHtml(html: string): string {
  const { masked, blocks } = maskTelegramPreBlocks(html);
  let s = rewriteBalancedTelegramHtml(masked);
  s = escapeStrayLtTelegram(s);
  return unmaskTelegramPreBlocks(s, blocks);
}

function chunkPlainLines(plain: string, maxLen = TELEGRAM_CHUNK_MAX): TelegramChunk[] {
  const t = plain.trim();
  if (t.length === 0) return [{ text: "(vuoto)" }];
  const out: TelegramChunk[] = [];
  let rest = t;
  while (rest.length > 0) {
    out.push({ text: rest.slice(0, maxLen) });
    rest = rest.slice(maxLen);
  }
  return out;
}

/**
 * Spezza l'HTML in più messaggi senza tagliare a metà tag (evita 400 + fallback che mostra <b> letterali).
 */
function chunkHtmlForTelegram(html: string, maxLen = TELEGRAM_CHUNK_MAX): TelegramChunk[] {
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

async function sendTelegramChunk(
  ctx: Context,
  chunk: TelegramChunk,
  isFirst: boolean,
): Promise<void> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) {
    throw new Error("sendTelegramChunk: chat id mancante");
  }
  const { text, parseMode } = chunk;
  const opts =
    parseMode === "HTML" ? ({ parse_mode: "HTML" } as const) : ({} as const);
  try {
    if (isFirst) await ctx.reply(text, opts);
    else await ctx.api.sendMessage(chatId, text, opts);
    log("telegram:chunk:sent", {
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
      logWarn("telegram:chunk:html-400-fallback-plain", {
        isFirst,
        length: text.length,
        grammyDescription: e.message,
      });
      const plain = htmlToPlainText(text);
      if (isFirst) await ctx.reply(plain);
      else await ctx.api.sendMessage(chatId, plain);
      return;
    }
    logError("telegram:chunk:send-failed", {
      isFirst,
      parseMode: parseMode ?? "none",
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}

async function replyWithHtml(ctx: Context, text: string): Promise<void> {
  const trimmed = text.trim();
  const safe = sanitizeTelegramOutgoingHtml(trimmed);
  const looksLikeMarkup = /<\/?[a-z]/i.test(trimmed);
  const chunks =
    safe.length > TELEGRAM_CHUNK_MAX && looksLikeMarkup
      ? chunkPlainLines(htmlToPlainText(trimmed))
      : chunkHtmlForTelegram(safe);
  log("reply:chunks", {
    totalChars: text.length,
    chunkCount: chunks.length,
    modes: chunks.map((c) => c.parseMode ?? "plain"),
    sanitized: true,
    longPlainFallback: safe.length > TELEGRAM_CHUNK_MAX && looksLikeMarkup,
  });
  for (let i = 0; i < chunks.length; i++) {
    await sendTelegramChunk(ctx, chunks[i]!, i === 0);
  }
}

const bot = new Bot(token);

bot.catch((err) => {
  logError("grammy:catch", err);
});

// Con `bot.start()`, getUpdates è in pausa finché finisce ogni handler: con
// LangChain+MCP un messaggio può durare minuti e i successivi sembrano “persi”.
// Il runner interroga Telegram in parallelo; sequentialize ordina per chat.
bot.use(
  sequentialize((ctx: Context) =>
    ctx.chat !== undefined ? String(ctx.chat.id) : `u:${ctx.update.update_id}`,
  ),
);

bot.on("message:text", async (ctx) => {
  if (ctx.chat.id !== allowedChatId) {
    log("message:ignored-chat", {
      chatId: ctx.chat.id,
      allowed: allowedChatId,
    });
    return;
  }

  try {
    log("message:in", {
      chatId: ctx.chat.id,
      updateId: ctx.update.update_id,
      text: previewText(ctx.message.text, 500),
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
    log("agent:history", {
      priorTurns: prior.length,
      messagesTotal: messages.length,
    });

    toolProgressNotify.current = async (toolName) => {
      const body =
        TOOL_PROGRESS_HTML[toolName] ??
        `Strumento <code>${escapeHtml(toolName)}</code> in esecuzione…`;
      try {
        await ctx.api.sendMessage(ctx.chat.id, `<i>${body}</i>`, {
          parse_mode: "HTML",
        });
        log("telegram:progress-sent", { toolName, parseMode: "HTML" });
      } catch (progressErr) {
        logWarn("telegram:progress-html-failed", {
          toolName,
          error:
            progressErr instanceof Error
              ? progressErr.message
              : String(progressErr),
        });
        const plain = body.replace(/<[^>]*>/g, "");
        await ctx.api.sendMessage(ctx.chat.id, plain).catch((e) => {
          logError("telegram:progress-plain-failed", toolName, e);
        });
      }
    };

    let result: Awaited<ReturnType<typeof agent.invoke>>;
    const tAgent = performance.now();
    try {
      log("agent:invoke:start");
      result = await agent.invoke({ messages });
      log("agent:invoke:done", {
        ms: Math.round(performance.now() - tAgent),
        resultMessages: (result.messages as BaseMessage[]).length,
      });
    } finally {
      toolProgressNotify.current = undefined;
    }

    const outMessages = result.messages as BaseMessage[];
    const reply = lastAiText(outMessages);
    log("agent:reply:extracted", {
      replyChars: reply.length,
      preview: previewText(reply, 320),
    });
    await replyWithHtml(ctx, reply);
    history.set(ctx.chat.id, outMessages);
    log("message:done", {
      chatId: ctx.chat.id,
      historyStoredMessages: outMessages.length,
    });
  } catch (e) {
    logError("message:error", {
      chatId: ctx.chat?.id,
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    await ctx
      .reply(`Errore: ${e instanceof Error ? e.message : String(e)}`)
      .catch((replyErr) =>
        logError("message:error-reply-failed", replyErr),
      );
  }
});

// Prima di avviare il runner: niente getUpdates finché il webhook è attivo.
const webhook = await bot.api.getWebhookInfo();
log("telegram:webhook:info", {
  url: webhook.url || "(nessuno)",
  pendingUpdateCount: webhook.pending_update_count,
});
if (webhook.url) {
  log("telegram:webhook:deleting");
}
await bot.api.deleteWebhook({ drop_pending_updates: false });
log("telegram:webhook:deleted");

let shuttingDown = false;
const runnerHandle = run(bot);

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log("shutdown:start", { signal });
  await mcpClient.close().catch((e) =>
    logError("shutdown:mcp-close", e),
  );
  log("shutdown:mcp-closed");
  await runnerHandle.stop();
  log("shutdown:runner-stopped");
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

log("runner:started", {
  allowedChatId,
  mcpUrl,
  note: "In ascolto aggiornamenti Telegram (grammY runner)",
});

const untilStopped = runnerHandle.task();
if (untilStopped) await untilStopped;
