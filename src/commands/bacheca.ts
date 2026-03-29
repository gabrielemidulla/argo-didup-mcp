import type { Page } from "puppeteer";
import type { BachecaEntry } from "../types.ts";
import { PORTAL_INDEX_JSF } from "../browser.ts";

const SEL = {
  bachecaButton: "#bacheca-famglia",
  treeScuola: '[id="sheet-bacheca:tree:scuola"]',
} as const;

const MONTH_MAP: Record<string, string> = {
  Gen: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  Mag: "05",
  Giu: "06",
  Lug: "07",
  Ago: "08",
  Set: "09",
  Ott: "10",
  Nov: "11",
  Dic: "12",
};

export interface BachecaOptions {
  /** Quante circolari restituire (default 5 senza ricerca, 10 con `cerca`). */
  limit?: number;
  /** Filtra per mese, formato "MM/YYYY" (es. "02/2026"). */
  mese?: string;
  /**
   * Ricerca tipo motore di ricerca: parole separate da spazio (tutte devono comparire,
   * ordine libero). Confronto case-insensitive (locale italiano) sul testo visibile della
   * circolare (intero fieldset). Non servono caratteri jolly tipo SQL LIKE.
   * Se omesso, si prendono le prime circolari in ordine di bacheca.
   */
  cerca?: string;
}

type RawEntry = {
  domIndex: number;
  date: string;
  subject: string;
  message: string;
  fileNames: string[];
  /** Titolo spesso nel <legend> del fieldset, non nella riga "Oggetto". */
  legend: string;
  /** Testo visibile dell'intero fieldset (ricerca su tutto il blocco HTML della circolare). */
  fullText: string;
};

const SEARCH_LOCALE = "it-IT";

/** Token della query (parole); tutte devono essere sottostringhe dell'haystack. */
export function cercaTokens(query: string): string[] {
  return query
    .trim()
    .toLocaleLowerCase(SEARCH_LOCALE)
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

export function haystackMatchesCerca(
  haystackLower: string,
  query: string,
): boolean {
  const tokens = cercaTokens(query);
  if (tokens.length === 0) return true;
  return tokens.every((t) => haystackLower.includes(t));
}

function rawHaystack(e: RawEntry): string {
  const ft = e.fullText.trim();
  if (ft.length > 0) return ft;
  return [e.legend, e.subject, e.message, ...e.fileNames]
    .filter((s) => s.trim().length > 0)
    .join("\n");
}

function haystackForSearch(e: RawEntry): string {
  return rawHaystack(e).toLocaleLowerCase(SEARCH_LOCALE);
}

/**
 * Apre la bacheca nel portale e restituisce tutte le circolari grezze dalla pagina.
 */
async function openBachecaAndScrape(page: Page): Promise<RawEntry[]> {
  await page.waitForSelector(SEL.bachecaButton, { timeout: 15_000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.click();
  }, SEL.bachecaButton);

  await page.waitForSelector(SEL.treeScuola, { visible: true, timeout: 30_000 });
  await page.click(SEL.treeScuola);

  await page.waitForSelector("fieldset", { visible: true, timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  return page.evaluate(
    (monthMap) => {
      const fieldsets = document.querySelectorAll("fieldset");

      const out: RawEntry[] = [];

      for (let fi = 0; fi < fieldsets.length; fi++) {
        const fs = fieldsets[fi]!;
        const dateCells = fs.querySelectorAll("td[rowspan] table td");
        let dateStr = "";
        if (dateCells.length >= 2) {
          const raw = dateCells[0]?.textContent?.trim() ?? "";
          const day = dateCells[1]?.textContent?.trim() ?? "";
          const parts = raw.split("/");
          const mName = (parts[0] ?? "").trim();
          const ySuffix = (parts[1] ?? "").trim();
          const mm = monthMap[mName] ?? "??";
          const yyyy = ySuffix ? `20${ySuffix}` : "????";
          dateStr = `${day.padStart(2, "0")}/${mm}/${yyyy}`;
        }

        let subject = "";
        let message = "";
        const fileNames: string[] = [];
        const legend = fs.querySelector("legend")?.textContent?.trim() ?? "";

        const outerTable = fs.querySelector("td:not([rowspan]) > table");
        if (!outerTable) continue;

        const rows = Array.from(outerTable.querySelectorAll("tr"));
        for (const tr of rows) {
          const tds = tr.querySelectorAll("td");
          if (tds.length < 2) continue;
          const label = tds[0]!.textContent?.trim() ?? "";
          const valueTd = tds[1]!;
          const value = valueTd.textContent?.trim() ?? "";

          if (label.includes("Oggetto")) {
            subject = value;
          } else if (label.includes("Messaggio")) {
            message = value;
          } else if (label.startsWith("File")) {
            const link = valueTd.querySelector("a.internalLink");
            const name = link?.textContent?.trim() ?? value;
            if (name) fileNames.push(name);
          }
        }

        if (subject || message || fileNames.length > 0) {
          const fullText = (fs as HTMLElement).innerText
            ?.replace(/\r\n/g, "\n")
            .trim() ?? "";

          out.push({
            domIndex: out.length + 1,
            date: dateStr,
            subject,
            message,
            fileNames,
            legend,
            fullText,
          });
        }
      }

      return out;
    },
    MONTH_MAP,
  );
}

async function entriesToBachecaWithUrls(
  page: Page,
  selected: RawEntry[],
): Promise<BachecaEntry[]> {
  const result: BachecaEntry[] = [];

  for (const raw of selected) {
    const files: BachecaEntry["files"] = [];

    for (let f = 0; f < raw.fileNames.length; f++) {
      const name = raw.fileNames[f]!;
      const url = await fetchSignedPdfUrl(page, raw.domIndex, f + 1);
      files.push({ name, url });
      await new Promise((r) => setTimeout(r, 150));
    }

    result.push({
      date: raw.date,
      subject: raw.subject,
      message: raw.message,
      files,
    });
  }

  return result;
}

/**
 * Apre la bacheca, scrapa le circolari, opzionalmente filtra per mese e/o testo `cerca`,
 * e per ogni allegato ottiene l'URL firmato CloudFront. Con `cerca` la ricerca vale su
 * tutte le circolari lette dal DOM; `limit` limita solo quante circolari si elaborano (PDF).
 */
export async function bacheca(
  page: Page,
  opts: BachecaOptions = {},
): Promise<BachecaEntry[]> {
  const cercaRaw = opts.cerca?.trim() ?? "";
  const hasSearch = cercaRaw.length > 0;
  const limit = opts.limit ?? (hasSearch ? 10 : 5);
  const meseFilter = opts.mese?.trim() || null;

  const allEntries = await openBachecaAndScrape(page);

  let pool: RawEntry[] = allEntries;

  if (meseFilter) {
    const [mm, yyyy] = meseFilter.split("/");
    if (mm && yyyy) {
      const suffix = `/${mm}/${yyyy}`;
      pool = pool.filter((e) => e.date.endsWith(suffix));
    }
  }

  if (hasSearch) {
    pool = pool.filter((e) =>
      haystackMatchesCerca(haystackForSearch(e), cercaRaw),
    );
  }

  const selected = pool.slice(0, limit);
  const result = await entriesToBachecaWithUrls(page, selected);

  await closeBachecaModal(page);

  return result;
}

async function closeBachecaModal(page: Page): Promise<void> {
  const closed = await page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>(
      '.btl-modal-closeButton, [class*="closeButton"]',
    );
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  if (closed) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

function buildBackbaseDelta(circIdx: number, fileIdx: number): string {
  return `[evt=panel-messaggiBacheca:pannello|event|custom|riga|${circIdx}_${fileIdx}|operazione|download]`;
}

async function fetchSignedPdfUrl(
  page: Page,
  circIdx: number,
  fileIdx: number,
): Promise<string> {
  const delta = buildBackbaseDelta(circIdx, fileIdx);
  console.error(`[bacheca] fetching URL: riga|${circIdx}_${fileIdx}`);
  const result = await page.evaluate(
    async (postUrl, deltaVal) => {
      const body = new URLSearchParams();
      body.set("BackbaseClientDelta", deltaVal);
      const res = await fetch(postUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/xml, text/xml, */*",
        },
        credentials: "include",
        body: body.toString(),
      });
      const text = await res.text();
      const m = text.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
      return { url: m?.[1] ?? "", responsePreview: text.substring(0, 300) };
    },
    PORTAL_INDEX_JSF,
    delta,
  );
  if (!result.url) {
    console.error(
      `[bacheca] empty URL for riga|${circIdx}_${fileIdx}, response: ${result.responsePreview}`,
    );
  }
  return result.url;
}
