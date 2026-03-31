import type { Page } from "puppeteer";
import type {
  AssenzaGiornalieraRow,
  AssenzeResult,
  AssenzeTotali,
} from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { SEARCH_LOCALE } from "./_shared/locale.ts";
import { parseDdMmYyyy } from "./_shared/parse-dd-mm-yyyy.ts";
import { tokensMatch } from "./_shared/tokens-match.ts";

const SEL = {
  menu: '[id="menu-servizialunno:assenze-famiglia"]',
  listGrid: '[id="sheet-assenzeGiornaliere:_idJsp0"]',
} as const;

export interface AssenzeOptions {
  /** Parole (AND) sui tipi presenti: "assenza", "uscita", "ritardo" (la riga deve avere tutti i tipi indicati). */
  tipo?: string;
  data_da?: string;
  data_a?: string;
}

function rowTipoHaystack(row: AssenzaGiornalieraRow): string {
  const parts: string[] = [];
  if (row.assenza) parts.push("assenza");
  if (row.uscita) parts.push("uscita");
  if (row.ritardo) parts.push("ritardo");
  return parts.join(" ");
}

function log(msg: string) {
  console.error(`[assenze] ${msg}`);
}

type RawRow = {
  data: string;
  dataIso: string | null;
  assenza: boolean;
  uscita: boolean;
  ritardo: boolean;
};

/**
 * Assenze giornaliere (famiglia): tre colonne Assenze / Uscite / Ritardi; la data è visibile solo sul tipo registrato.
 */
export async function assenze(
  page: Page,
  opts: AssenzeOptions = {},
): Promise<AssenzeResult> {
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

  log("wait menu (attached)");
  await page.waitForSelector(SEL.menu, { timeout: 60_000 });

  log("click menu");
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    el?.click();
  }, SEL.menu);

  log("wait network idle");
  await page
    .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
    .catch(() => {
      log("network idle timeout (ok)");
    });

  log("wait list grid");
  try {
    await page.waitForSelector(SEL.listGrid, { timeout: 30_000 });
  } catch {
    log("list grid wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 800));
  log("scrape");

  const raw = await page.evaluate((listSel: string) => {
    function norm(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    function scrapeTotali(): AssenzeTotali {
      const out: AssenzeTotali = {
        totaleAssenze: null,
        totaleUscite: null,
        totaleRitardi: null,
      };
      const tables = Array.from(
        document.querySelectorAll('table[id^="sheet-assenzeGiornaliere:"]'),
      );
      for (const table of tables) {
        for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
          const tds = tr.querySelectorAll("td");
          if (tds.length < 2) continue;
          const lab = norm(tds[0]!.textContent ?? "");
          const n = parseInt(norm(tds[1]!.textContent ?? ""), 10);
          if (!Number.isFinite(n)) continue;
          if (lab.includes("Totale Assenze")) out.totaleAssenze = n;
          else if (lab.includes("Totale Uscite")) out.totaleUscite = n;
          else if (lab.includes("Totale Ritardi")) out.totaleRitardi = n;
        }
      }
      return out;
    }

    function isoToDataIt(iso: string): string {
      const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return "";
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      return `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
    }

    /** True se in cella c’è data DD/MM/YYYY visibile (non display:none). */
    function cellActive(td: Element): { active: boolean; data: string } {
      const spans = td.querySelectorAll("span:not(.value)");
      for (const sp of Array.from(spans)) {
        const hel = sp as HTMLElement;
        if (window.getComputedStyle(hel).display === "none") continue;
        const t = norm(sp.textContent ?? "");
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) {
          return { active: true, data: t };
        }
      }
      return { active: false, data: "" };
    }

    function cellIso(td: Element): string | null {
      const v = norm(td.querySelector("span.value")?.textContent ?? "");
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
    }

    const root = document.querySelector(listSel);
    if (!root) {
      return {
        rows: [] as RawRow[],
        err: "griglia non trovata",
        totali: scrapeTotali(),
      };
    }

    const tbody = root.querySelector(".btl-grid-dataViewContainer tbody");
    const trs = Array.from(tbody?.querySelectorAll("tr[rowid]") ?? []);

    const rows: RawRow[] = [];
    for (const tr of trs) {
      const cells = tr.querySelectorAll("td.btl-grid-cell");
      if (cells.length < 3) continue;

      const a0 = cellActive(cells[0]!);
      const a1 = cellActive(cells[1]!);
      const a2 = cellActive(cells[2]!);

      const iso0 = cellIso(cells[0]!);
      const iso1 = cellIso(cells[1]!);
      const iso2 = cellIso(cells[2]!);
      const dataIso = iso0 ?? iso1 ?? iso2;

      let data =
        (a0.active ? a0.data : "") ||
        (a1.active ? a1.data : "") ||
        (a2.active ? a2.data : "");
      if (!data && dataIso) data = isoToDataIt(dataIso);

      if (!a0.active && !a1.active && !a2.active) continue;

      rows.push({
        data,
        dataIso,
        assenza: a0.active,
        uscita: a1.active,
        ritardo: a2.active,
      });
    }

    return { rows, err: null as string | null, totali: scrapeTotali() };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: AssenzaGiornalieraRow[] = raw.rows.map((r) => ({
    data: r.data,
    dataIso: r.dataIso,
    assenza: r.assenza,
    uscita: r.uscita,
    ritardo: r.ritardo,
  }));

  if (opts.tipo?.trim()) {
    list = list.filter((e) =>
      tokensMatch(rowTipoHaystack(e).toLocaleLowerCase(SEARCH_LOCALE), opts.tipo),
    );
  }

  if (minOpt?.ok || maxOpt?.ok) {
    list = list.filter((e) => {
      const p = parseDdMmYyyy(e.data);
      if (!p.ok) return false;
      if (minOpt?.ok && p.t < minOpt.t) return false;
      if (maxOpt?.ok && p.t > maxOpt.t) return false;
      return true;
    });
  }

  log(`done (${list.length} righe)`);
  await closeModalIfPresent(page);

  return { totali: raw.totali, righe: list };
}
