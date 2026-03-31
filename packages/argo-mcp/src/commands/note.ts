import type { Page } from "puppeteer";
import type { NotaDisciplinare } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { SEARCH_LOCALE } from "./_shared/locale.ts";
import { parseDdMmYyyy } from "./_shared/parse-dd-mm-yyyy.ts";
import { tokensMatch } from "./_shared/tokens-match.ts";

const SEL = {
  menu: '[id="menu-servizialunno:note-famiglia"]',
  listGrid: '[id="sheet-noteDisciplinari:_idJsp2"]',
} as const;

export interface NoteOptions {
  /** Parole (AND) sulla categoria (es. generica, disciplinare). */
  categoria?: string;
  data_da?: string;
  data_a?: string;
}

function log(msg: string) {
  console.error(`[note] ${msg}`);
}

type RawRow = {
  data: string;
  dataIso: string | null;
  nota: string;
  inseritaDa: string;
  categoria: string;
  orario: string;
  orarioIso: string | null;
};

/**
 * Note disciplinari (famiglia): menu servizi alunno → griglia `sheet-noteDisciplinari:_idJsp2`.
 */
export async function note(
  page: Page,
  opts: NoteOptions = {},
): Promise<NotaDisciplinare[]> {
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

    function parseDataCell(td: Element): { data: string; dataIso: string | null } {
      const valSpan = td.querySelector("span.value");
      const isoRaw = norm(valSpan?.textContent ?? "");
      const dataIso = /^\d{4}-\d{2}-\d{2}$/.test(isoRaw) ? isoRaw : null;

      let data = "";
      for (const sp of Array.from(td.querySelectorAll("span"))) {
        if (sp.classList.contains("value")) continue;
        const t = norm(sp.textContent ?? "");
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) {
          data = t;
          break;
        }
      }
      if (!data && dataIso) {
        const [y, mo, d] = dataIso.split("-").map((x) => Number.parseInt(x, 10));
        if (y && mo && d) {
          data = `${String(d).padStart(2, "0")}/${String(mo).padStart(2, "0")}/${y}`;
        }
      }
      if (!data) data = norm(td.textContent ?? "");
      return { data, dataIso };
    }

    function parseOrarioCell(td: Element): { orario: string; orarioIso: string | null } {
      let orario = "";
      for (const sp of Array.from(td.querySelectorAll("span"))) {
        if (sp.classList.contains("value")) continue;
        const t = norm(sp.textContent ?? "");
        if (t) {
          orario = t;
          break;
        }
      }
      const valSpan = td.querySelector("span.value");
      const isoRaw = norm(valSpan?.textContent ?? "");
      const orarioIso = /^\d{1,2}:\d{2}:\d{2}$/.test(isoRaw) ? isoRaw : null;
      if (!orario) orario = norm(td.textContent ?? "");
      return { orario, orarioIso };
    }

    const root = document.querySelector(listSel);
    if (!root) {
      return { rows: [] as RawRow[], err: "griglia non trovata" };
    }

    const tbody = root.querySelector(".btl-grid-dataViewContainer tbody");
    const trs = Array.from(tbody?.querySelectorAll("tr[rowid]") ?? []);

    const rows: RawRow[] = [];
    for (const tr of trs) {
      const cells = Array.from(tr.querySelectorAll("td.btl-grid-cell"));
      if (cells.length < 5) continue;

      const { data, dataIso } = parseDataCell(cells[0]!);
      const nota = norm(cells[1]?.textContent ?? "");
      const inseritaDa = norm(cells[2]?.textContent ?? "");
      const categoria = norm(cells[3]?.textContent ?? "");
      const { orario, orarioIso } = parseOrarioCell(cells[4]!);

      if (!data && !nota) continue;
      rows.push({
        data,
        dataIso,
        nota,
        inseritaDa,
        categoria,
        orario,
        orarioIso,
      });
    }

    return { rows, err: null as string | null };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: NotaDisciplinare[] = raw.rows.map((r) => ({
    data: r.data,
    dataIso: r.dataIso,
    nota: r.nota,
    inseritaDa: r.inseritaDa,
    categoria: r.categoria,
    orario: r.orario,
    orarioIso: r.orarioIso,
  }));

  if (opts.categoria?.trim()) {
    list = list.filter((e) =>
      tokensMatch(
        e.categoria.toLocaleLowerCase(SEARCH_LOCALE),
        opts.categoria,
      ),
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

  log(`done (${list.length} note)`);
  await closeModalIfPresent(page);

  return list;
}
