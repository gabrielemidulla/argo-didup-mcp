import type { Page } from "puppeteer";
import type { OrarioSlot } from "../types.ts";

const SEL = {
  menuOrario: '[id="menu-serviziclasse:orario-famiglia"]',
  grid: "#grigliaorariofamlst",
} as const;

const SEARCH_LOCALE = "it-IT";

export interface OrarioFamigliaOptions {
  /** Parole (AND) sulla materia (case-insensitive). */
  materia?: string;
  /** Parole (AND) sul nome giorno (es. "mercoledì", "lun"). */
  giorno?: string;
  /** Parole (AND) su materia + docenti concatenati. */
  contenuto?: string;
  /** DD/MM/YYYY inclusiva sulla data colonna. */
  data_da?: string;
  /** DD/MM/YYYY inclusiva sulla data colonna. */
  data_a?: string;
  /** Sottostringa sulla fascia (es. "1^", "3"). */
  fascia?: string;
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

function parseDdMmYyyy(raw: string): { ok: true; t: number } | { ok: false } {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { ok: false };
  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm ||
    d.getDate() !== dd
  ) {
    return { ok: false };
  }
  d.setHours(0, 0, 0, 0);
  return { ok: true, t: d.getTime() };
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

function logOrario(msg: string) {
  console.error(`[orario-famiglia] ${msg}`);
}

type RawSlot = {
  fascia: string;
  giorno: string;
  data: string;
  materia: string;
  docenti: string[];
};

/**
 * Modale orario famiglia: griglia Backbase `grigliaorariofamlst`.
 */
export async function orarioFamiglia(
  page: Page,
  opts: OrarioFamigliaOptions = {},
): Promise<OrarioSlot[]> {
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

  logOrario("wait menu (attached)");
  await page.waitForSelector(SEL.menuOrario, { timeout: 60_000 });

  logOrario("click menu");
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    el?.click();
  }, SEL.menuOrario);

  logOrario("wait network idle");
  await page
    .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
    .catch(() => {
      logOrario("network idle timeout (ok)");
    });

  logOrario("wait grid");
  try {
    await page.waitForSelector(SEL.grid, { timeout: 30_000 });
  } catch {
    logOrario("grid wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 1200));
  logOrario("scrape");

  const raw = await page.evaluate((gridSel: string) => {
    function norm(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    function parseInnerCell(td: Element): { materia: string; docenti: string[] } {
      const innerTds = td.querySelectorAll("table td");
      const materie: string[] = [];
      const docenti: string[] = [];
      for (const it of Array.from(innerTds)) {
        const st = (it as HTMLElement).getAttribute("style") ?? "";
        const txt = norm(it.textContent ?? "");
        if (!txt || txt === "\u00a0") continue;
        if (/font-weight\s*:\s*bold/i.test(st) && /font-size\s*:\s*11px/i.test(st)) {
          materie.push(txt);
        } else if (/font-size\s*:\s*9px/i.test(st)) {
          const m = txt.match(/^\((.*)\)$/);
          docenti.push(m ? norm(m[1]!) : txt);
        }
      }
      return {
        materia: materie.join(" / "),
        docenti,
      };
    }

    const grid = document.querySelector(gridSel);
    if (!grid) {
      return { slots: [] as RawSlot[], err: "grid non trovata" };
    }

    const headerTable = grid.querySelector("table.btl-grid-header-table");
    const headerRows = Array.from(
      headerTable?.querySelectorAll("tbody > tr") ?? [],
    ).filter((tr) => !tr.classList.contains("btl-grid-clear"));

    const days: string[] = [];
    const dates: string[] = [];

    if (headerRows.length >= 2) {
      const rowDays = headerRows[0]!;
      for (const td of Array.from(rowDays.querySelectorAll("td"))) {
        const span = td.querySelector(".btl-grid-header-group span");
        const t = norm(span?.textContent ?? "");
        if (t && t !== "Ora") days.push(t);
      }
      const rowDates = headerRows[1]!;
      for (const td of Array.from(rowDates.querySelectorAll("td"))) {
        const span = td.querySelector(".btl-grid-header-content span");
        const t = norm(span?.textContent ?? "");
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) dates.push(t);
      }
    }

    const container = grid.querySelector(".btl-grid-data-container");
    const ports = Array.from(
      container?.querySelectorAll(":scope > .btl-grid-port") ?? [],
    );
    const dataPort =
      ports.find((p) => p.querySelector("tr.btl-grid-row")) ?? null;
    const tbody = dataPort?.querySelector(
      "table.btl-grid-table tbody",
    );
    const gridRows = Array.from(tbody?.querySelectorAll("tr.btl-grid-row") ?? []);

    const slots: RawSlot[] = [];
    const nCol = Math.min(days.length, dates.length);

    for (const tr of gridRows) {
      const cells = Array.from(tr.querySelectorAll("td.btl-grid-data"));
      if (cells.length < 2) continue;
      const fascia = norm(cells[0]?.textContent ?? "");
      if (!fascia) continue;

      for (let c = 1; c < cells.length - 1 && c - 1 < nCol; c++) {
        const dayIdx = c - 1;
        const { materia, docenti } = parseInnerCell(cells[c]!);
        if (!materia && docenti.length === 0) continue;
        slots.push({
          fascia,
          giorno: days[dayIdx] ?? "",
          data: dates[dayIdx] ?? "",
          materia,
          docenti,
        });
      }
    }

    return { slots, err: null as string | null };
  }, SEL.grid);

  if (raw.err) {
    logOrario(`warning: ${raw.err}`);
  }

  let list: OrarioSlot[] = raw.slots.map((s) => ({
    fascia: s.fascia,
    giorno: s.giorno,
    data: s.data,
    materia: s.materia,
    docenti: s.docenti,
  }));

  if (minOpt?.ok || maxOpt?.ok) {
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
      tokensMatch(e.materia.toLocaleLowerCase(SEARCH_LOCALE), opts.materia),
    );
  }
  if (opts.giorno?.trim()) {
    list = list.filter((e) =>
      tokensMatch(e.giorno.toLocaleLowerCase(SEARCH_LOCALE), opts.giorno),
    );
  }
  if (opts.fascia?.trim()) {
    const q = opts.fascia.trim().toLocaleLowerCase(SEARCH_LOCALE);
    list = list.filter((e) =>
      e.fascia.toLocaleLowerCase(SEARCH_LOCALE).includes(q),
    );
  }
  if (opts.contenuto?.trim()) {
    list = list.filter((e) => {
      const hay = `${e.materia} ${e.docenti.join(" ")}`.toLocaleLowerCase(
        SEARCH_LOCALE,
      );
      return tokensMatch(hay, opts.contenuto);
    });
  }

  logOrario(`done (${list.length} slot)`);
  await closeModalIfPresent(page);

  return list;
}
