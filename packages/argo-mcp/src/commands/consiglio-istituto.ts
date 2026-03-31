import type { Page } from "puppeteer";
import type { ConsiglioIstitutoEletto } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { SEARCH_LOCALE } from "./_shared/locale.ts";
import { tokensMatch } from "./_shared/tokens-match.ts";

const SEL = {
  menu: '[id="menu-serviziclasse:consiglio-istituto-famiglia"]',
  listGrid: '[id="listgrid-listaElettiConsIstituto:listaElettiConsIstituto"]',
} as const;

export interface ConsiglioIstitutoOptions {
  nominativo?: string;
  sesso?: string;
  /** Parole (AND) sulla colonna Tipo Comp. (es. alunno). */
  tipo_componente?: string;
  /** Parole (AND) sul testo nota. */
  nota?: string;
  /** Se impostato, filtra solo chi è / non è componente di giunta. */
  componente_giunta?: boolean;
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
  console.error(`[consiglio-istituto] ${msg}`);
}

type RawRow = {
  nominativo: string;
  sesso: string;
  tipoComponente: string;
  componenteGiunta: boolean;
  nota: string;
};

/**
 * Modale consiglio d'istituto (famiglia): lista `listaElettiConsIstituto`.
 */
export async function consiglioIstituto(
  page: Page,
  opts: ConsiglioIstitutoOptions = {},
): Promise<ConsiglioIstitutoEletto[]> {
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
      if (cells.length < 6) continue;

      const nominativo = norm(cells[1]?.textContent ?? "");
      const sesso = norm(cells[2]?.textContent ?? "");
      const tipoComponente = norm(cells[3]?.textContent ?? "");

      const tdGiunta = cells[4]!;
      const cb = tdGiunta.querySelector(
        'input[type="checkbox"]',
      ) as HTMLInputElement | null;
      let componenteGiunta = false;
      if (cb) {
        componenteGiunta = Boolean(cb.checked);
      } else {
        const valSpan = tdGiunta.querySelector("span.value");
        const v = norm(valSpan?.textContent ?? "").toLowerCase();
        componenteGiunta = v === "true";
      }

      const nota = norm(cells[5]?.textContent ?? "");

      if (!nominativo) continue;
      rows.push({
        nominativo,
        sesso,
        tipoComponente,
        componenteGiunta,
        nota,
      });
    }

    return { rows, err: null as string | null };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: ConsiglioIstitutoEletto[] = raw.rows.map((r) => ({
    nominativo: r.nominativo,
    sesso: r.sesso,
    tipoComponente: r.tipoComponente,
    componenteGiunta: r.componenteGiunta,
    nota: r.nota,
  }));

  if (opts.nominativo?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.nominativo.toLocaleLowerCase(SEARCH_LOCALE),
        opts.nominativo,
      ),
    );
  }
  if (opts.sesso?.trim()) {
    list = list.filter((e) => sessoMatches(e.sesso, opts.sesso));
  }
  if (opts.tipo_componente?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.tipoComponente.toLocaleLowerCase(SEARCH_LOCALE),
        opts.tipo_componente,
      ),
    );
  }
  if (opts.nota?.trim()) {
    list = list.filter((e) =>
      tokensMatch(e.nota.toLocaleLowerCase(SEARCH_LOCALE), opts.nota),
    );
  }
  if (opts.componente_giunta !== undefined) {
    list = list.filter((e) => e.componenteGiunta === opts.componente_giunta);
  }

  log(`done (${list.length} eletti)`);
  await closeModalIfPresent(page);

  return list;
}
