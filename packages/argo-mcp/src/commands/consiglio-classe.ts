import type { Page } from "puppeteer";
import type { ConsiglioClasseEletto } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { SEARCH_LOCALE } from "./_shared/locale.ts";
import { tokensMatch } from "./_shared/tokens-match.ts";

const SEL = {
  menu: '[id="menu-serviziclasse:consiglio-classe-famiglia"]',
  listGrid: '[id="sheet-elettiConsClasse:listaElettiConsClasse"]',
} as const;

export interface ConsiglioClasseOptions {
  /** Parole (AND) sul nominativo (case-insensitive). */
  nominativo?: string;
  /** Parole (AND) sul ruolo, es. "alunno", "genitore". */
  ruolo?: string;
  /** Filtro sesso: M/F o maschio/femmina (case-insensitive). */
  sesso?: string;
}

function sessoMatches(rowSesso: string, query: string | undefined): boolean {
  if (!query?.trim()) return true;
  const q = query.trim().toLocaleLowerCase(SEARCH_LOCALE);
  const rs = rowSesso.trim().toUpperCase();
  if (q === "m" || q === "maschio" || q === "maschi") return rs === "M";
  if (q === "f" || q === "femmina" || q === "femmine") return rs === "F";
  return rs.toLowerCase().includes(q);
}

function log(msg: string) {
  console.error(`[consiglio-classe] ${msg}`);
}

type RawRow = { nominativo: string; sesso: string; ruolo: string };

/**
 * Modale consiglio di classe (famiglia): lista eletti `listaElettiConsClasse`.
 */
export async function consiglioClasse(
  page: Page,
  opts: ConsiglioClasseOptions = {},
): Promise<ConsiglioClasseEletto[]> {
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

    const root = document.querySelector(listSel);
    if (!root) {
      return { rows: [] as RawRow[], err: "lista non trovata" };
    }

    const tbody = root.querySelector(".btl-grid-dataViewContainer tbody");
    const trs = Array.from(tbody?.querySelectorAll("tr[rowid]") ?? []);

    const rows: RawRow[] = [];
    for (const tr of trs) {
      const cells = tr.querySelectorAll("td.btl-grid-cell");
      if (cells.length < 4) continue;

      const nominativo = norm(cells[1]?.textContent ?? "");
      const sesso = norm(cells[2]?.textContent ?? "");
      const ruoloRaw = norm(cells[3]?.textContent ?? "");
      const pm = ruoloRaw.match(/^\((.*)\)$/);
      const ruolo = pm ? norm(pm[1]!) : ruoloRaw;

      if (!nominativo) continue;
      rows.push({ nominativo, sesso, ruolo });
    }

    return { rows, err: null as string | null };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: ConsiglioClasseEletto[] = raw.rows.map((r) => ({
    nominativo: r.nominativo,
    sesso: r.sesso,
    ruolo: r.ruolo,
  }));

  if (opts.nominativo?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.nominativo.toLocaleLowerCase(SEARCH_LOCALE),
        opts.nominativo,
      ),
    );
  }
  if (opts.ruolo?.trim()) {
    list = list.filter((e) =>
      tokensMatch(e.ruolo.toLocaleLowerCase(SEARCH_LOCALE), opts.ruolo),
    );
  }
  if (opts.sesso?.trim()) {
    list = list.filter((e) => sessoMatches(e.sesso, opts.sesso));
  }

  log(`done (${list.length} eletti)`);
  await closeModalIfPresent(page);

  return list;
}
