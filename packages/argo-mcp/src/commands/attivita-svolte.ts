import type { Page } from "puppeteer";
import type { AttivitaSvolta } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { SEARCH_LOCALE } from "./_shared/locale.ts";
import { parseDdMmYyyy } from "./_shared/parse-dd-mm-yyyy.ts";
import { tokensMatch } from "./_shared/tokens-match.ts";

const SEL = {
  menuArgomenti: '[id="menu-serviziclasse:argomenti-famiglia"]',
} as const;

/** Legend dei compiti è solo una data: escludiamo quei fieldset se il DOM mescola contesti. */
const LEGEND_SOLO_DATA_COMPITI = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

export interface AttivitaSvolteOptions {
  /** Parole (AND) nel nome materia (legend del fieldset), case-insensitive. */
  materia?: string;
  /** Parole (AND) nella descrizione (seconda colonna), case-insensitive. */
  contenuto?: string;
  /** Inclusiva DD/MM/YYYY: filtra per data riga ≥ data_da (solo righe con data parsabile). */
  data_da?: string;
  /** Inclusiva DD/MM/YYYY: filtra per data riga ≤ data_a. */
  data_a?: string;
}

function logAttivita(msg: string) {
  console.error(`[attivita-svolte] ${msg}`);
}

/**
 * Stesso flusso di compiti-assegnati: menu nel DOM → evaluate click → network idle → fieldset → scrape.
 * Struttura: legend = materia; righe: col1 = data (o vuoto), col2 = descrizione attività.
 */
export async function attivitaSvolte(
  page: Page,
  opts: AttivitaSvolteOptions = {},
): Promise<AttivitaSvolta[]> {
  const minOpt = opts.data_da?.trim()
    ? parseDdMmYyyy(opts.data_da.trim())
    : null;
  const maxOpt = opts.data_a?.trim()
    ? parseDdMmYyyy(opts.data_a.trim())
    : null;
  if (minOpt && !minOpt.ok) {
    throw new Error(`data_da non valida (usa DD/MM/YYYY): ${opts.data_da}`);
  }
  if (maxOpt && !maxOpt.ok) {
    throw new Error(`data_a non valida (usa DD/MM/YYYY): ${opts.data_a}`);
  }

  const hasDateFilter = Boolean(minOpt?.ok || maxOpt?.ok);

  logAttivita("wait menu (attached, no visible check)");
  await page.waitForSelector(SEL.menuArgomenti, { timeout: 60_000 });

  logAttivita("click menu via evaluate + scrollIntoView");
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    el?.click();
  }, SEL.menuArgomenti);

  logAttivita("wait network idle (SPA)");
  await page
    .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
    .catch(() => {
      logAttivita("network idle timeout (ok)");
    });

  logAttivita("wait fieldset attached (no visible; max 30s)");
  try {
    await page.waitForSelector("fieldset.fieldset-anagrafe", {
      timeout: 30_000,
    });
  } catch {
    logAttivita("fieldset wait timeout — proseguo con scrape");
  }

  await new Promise((r) => setTimeout(r, 1200));
  logAttivita("scrape");

  const raw = await page.evaluate((compitiLegendReSource: string) => {
    const compitiLegendRe = new RegExp(compitiLegendReSource);
    type Row = { materia: string; data: string; descrizione: string };
    const out: Row[] = [];
    document.querySelectorAll("fieldset.fieldset-anagrafe").forEach((fs) => {
      const materiaLegend =
        fs.querySelector("legend")?.textContent?.trim().replace(/\s+/g, " ") ??
        "";
      if (compitiLegendRe.test(materiaLegend)) return;

      fs.querySelectorAll("table tr").forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length >= 2) {
          const data = (tds[0]?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const descrizione = (tds[1]?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          if (data || descrizione || materiaLegend) {
            out.push({
              materia: materiaLegend,
              data,
              descrizione,
            });
          }
        }
      });
    });
    return out;
  }, LEGEND_SOLO_DATA_COMPITI.source);

  let list: AttivitaSvolta[] = raw.map((r) => ({
    materia: r.materia,
    data: r.data,
    descrizione: r.descrizione,
  }));

  if (hasDateFilter) {
    list = list.filter((e) => {
      const p = parseDdMmYyyy(e.data);
      if (!p.ok) return false;
      if (minOpt?.ok && p.t < minOpt.t) return false;
      if (maxOpt?.ok && p.t > maxOpt.t) return false;
      return true;
    });
  }

  if (opts.materia?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.materia.toLocaleLowerCase(SEARCH_LOCALE),
        opts.materia,
      ),
    );
  }
  if (opts.contenuto?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.descrizione.toLocaleLowerCase(SEARCH_LOCALE),
        opts.contenuto,
      ),
    );
  }

  logAttivita(`done (${list.length} righe)`);
  await closeModalIfPresent(page);

  return list;
}
