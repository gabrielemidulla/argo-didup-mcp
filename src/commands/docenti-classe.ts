import type { Page } from "puppeteer";
import type { DocenteClasse } from "../types.ts";

const SEL = {
  menu: '[id="menu-serviziclasse:docenti-classe-famiglia"]',
  listGrid: '[id="sheet-docentiClasse:listgrid"]',
} as const;

const SEARCH_LOCALE = "it-IT";

export interface DocentiClasseOptions {
  /** Parole (AND) sul nominativo (case-insensitive). */
  nominativo?: string;
  /** Parole (AND) sulla stringa materie unite (case-insensitive). */
  materia?: string;
}

function tokensMatch(haystackLower: string, query: string | undefined): boolean {
  if (!query?.trim()) return true;
  const tokens = query
    .trim()
    .toLocaleLowerCase(SEARCH_LOCALE)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return tokens.every((t) => haystackLower.includes(t));
}

async function closeModalIfPresent(page: Page): Promise<void> {
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

function log(msg: string) {
  console.error(`[docenti-classe] ${msg}`);
}

type RawRow = {
  nominativo: string;
  coordinatoreClasse: boolean;
  materie: string[];
};

/**
 * Modale docenti della classe (famiglia): griglia `sheet-docentiClasse:listgrid`.
 */
export async function docentiClasse(
  page: Page,
  opts: DocentiClasseOptions = {},
): Promise<DocenteClasse[]> {
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
      if (cells.length < 3) continue;

      let nominativo = norm(cells[1]?.textContent ?? "");
      const coordinatoreClasse = /\(\*\)\s*$/i.test(nominativo);
      nominativo = nominativo.replace(/\(\*\)\s*$/i, "").trim();

      const materieRaw = norm(cells[2]?.textContent ?? "");
      const materie = materieRaw
        .split(",")
        .map((m) => norm(m))
        .filter((m) => m.length > 0);

      if (!nominativo) continue;
      rows.push({ nominativo, coordinatoreClasse, materie });
    }

    return { rows, err: null as string | null };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: DocenteClasse[] = raw.rows.map((r) => ({
    nominativo: r.nominativo,
    coordinatoreClasse: r.coordinatoreClasse,
    materie: r.materie,
  }));

  if (opts.nominativo?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.nominativo.toLocaleLowerCase(SEARCH_LOCALE),
        opts.nominativo,
      ),
    );
  }
  if (opts.materia?.trim()) {
    list = list.filter((e) => {
      const hay = e.materie.join(", ").toLocaleLowerCase(SEARCH_LOCALE);
      return tokensMatch(hay, opts.materia);
    });
  }

  log(`done (${list.length} docenti)`);
  await closeModalIfPresent(page);

  return list;
}
