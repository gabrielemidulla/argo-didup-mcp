import type { Page } from "puppeteer";
import type { BachecaEntry } from "../types.ts";
import { PORTAL_INDEX_JSF } from "../browser.ts";

const SEL = {
  bachecaButton: "#bacheca-famglia",
  treeScuola: '[id="sheet-bacheca:tree:scuola"]',
} as const;

const MONTH_MAP: Record<string, string> = {
  Gen: "01", Feb: "02", Mar: "03", Apr: "04",
  Mag: "05", Giu: "06", Lug: "07", Ago: "08",
  Set: "09", Ott: "10", Nov: "11", Dic: "12",
};

export interface BachecaOptions {
  /** Quante circolari restituire (default 5). */
  limit?: number;
  /** Filtra per mese, formato "MM/YYYY" (es. "02/2026"). */
  mese?: string;
}

type RawEntry = {
  domIndex: number;
  date: string;
  subject: string;
  message: string;
  fileNames: string[];
};

/**
 * Apre la bacheca, scrapa le circolari, filtra per mese se specificato,
 * e per ogni allegato ottiene l'URL firmato CloudFront.
 */
export async function bacheca(
  page: Page,
  opts: BachecaOptions = {},
): Promise<BachecaEntry[]> {
  const limit = opts.limit ?? 5;
  const meseFilter = opts.mese?.trim() || null;

  await page.waitForSelector(SEL.bachecaButton, { timeout: 15_000 });
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.click();
  }, SEL.bachecaButton);

  await page.waitForSelector(SEL.treeScuola, { visible: true, timeout: 30_000 });
  await page.click(SEL.treeScuola);

  await page.waitForSelector("fieldset", { visible: true, timeout: 60_000 });
  await new Promise((r) => setTimeout(r, 1500));

  const allEntries: RawEntry[] = await page.evaluate(
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
          out.push({ domIndex: out.length + 1, date: dateStr, subject, message, fileNames });
        }
      }

      return out;
    },
    MONTH_MAP,
  );

  let filtered = allEntries;
  if (meseFilter) {
    const [mm, yyyy] = meseFilter.split("/");
    if (mm && yyyy) {
      const suffix = `/${mm}/${yyyy}`;
      filtered = allEntries.filter((e) => e.date.endsWith(suffix));
    }
  }

  const selected = filtered.slice(0, limit);

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
    console.error(`[bacheca] empty URL for riga|${circIdx}_${fileIdx}, response: ${result.responsePreview}`);
  }
  return result.url;
}
