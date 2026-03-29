import type { Page } from "puppeteer";
import type { CompitoAssegnato } from "../types.ts";

/** Stesso schema di voti-giornalieri: id voce menu servizi classe. */
const SEL = {
  menuCompiti: '[id="menu-serviziclasse:compiti-famiglia"]',
} as const;

/** Legend tipico compiti: solo data DD/MM/YYYY (distingue da altri fieldset anagrafe). */
const LEGEND_DATA_RE = /^\d{1,2}\/\d{1,2}\/\d{4}$/;

const SEARCH_LOCALE = "it-IT";

export interface CompitiAssegnatiOptions {
  /** Parole (AND) cercate nella materia, case-insensitive. */
  materia?: string;
  /** Parole (AND) cercate nel testo del compito, case-insensitive. */
  contenuto?: string;
  /** Inclusiva, formato DD/MM/YYYY: filtra per `data` (legend) ≥ data_da. */
  data_da?: string;
  /** Inclusiva, formato DD/MM/YYYY: filtra per `data` (legend) ≤ data_a. */
  data_a?: string;
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

function legendTimeOrNull(legend: string): number | null {
  const p = parseDdMmYyyy(legend);
  return p.ok ? p.t : null;
}

function extractAssegnatoIl(testo: string): string | null {
  const m = testo.match(/\(Assegnati il\s*(\d{1,2}\/\d{1,2}\/\d{4})\)/i);
  return m?.[1] ?? null;
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

function logCompitiStep(msg: string) {
  console.error(`[compiti-assegnati] ${msg}`);
}

/**
 * Pattern come bacheca (primo click): elemento nel DOM + click da evaluate + scrollIntoView.
 * Non usare `visible: true` sul menu: in alberi Backbase la voce può essere `display:none`
 * finché non si espande il ramo e Puppeteer attenderebbe fino al timeout (sembra freeze).
 */
export async function compitiAssegnati(
  page: Page,
  opts: CompitiAssegnatiOptions = {},
): Promise<CompitoAssegnato[]> {
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

  logCompitiStep("wait menu (attached, no visible check)");
  await page.waitForSelector(SEL.menuCompiti, { timeout: 60_000 });

  logCompitiStep("click menu via evaluate + scrollIntoView");
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    el?.click();
  }, SEL.menuCompiti);

  logCompitiStep("wait network idle (SPA)");
  await page
    .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
    .catch(() => {
      logCompitiStep("network idle timeout (ok)");
    });

  logCompitiStep("wait fieldset attached (no visible; max 30s)");
  try {
    await page.waitForSelector("fieldset.fieldset-anagrafe", {
      timeout: 30_000,
    });
  } catch {
    logCompitiStep("fieldset wait timeout — proseguo con scrape");
  }

  await new Promise((r) => setTimeout(r, 1200));
  logCompitiStep("scrape");

  const raw = await page.evaluate((legendReSource: string) => {
    const legendRe = new RegExp(legendReSource);
    type Row = { dataLegend: string; materia: string; testo: string };
    const out: Row[] = [];
    document.querySelectorAll("fieldset.fieldset-anagrafe").forEach((fs) => {
      const dataLegend =
        fs.querySelector("legend")?.textContent?.trim().replace(/\s+/g, " ") ??
        "";
      if (!legendRe.test(dataLegend)) return;
      fs.querySelectorAll("table tr").forEach((tr) => {
        const tds = tr.querySelectorAll("td");
        if (tds.length >= 2) {
          const materia = (tds[0]?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          const testo = (tds[1]?.textContent ?? "")
            .replace(/\s+/g, " ")
            .trim();
          if (materia || testo) {
            out.push({ dataLegend, materia, testo });
          }
        }
      });
    });
    return out;
  }, LEGEND_DATA_RE.source);

  let list: CompitoAssegnato[] = raw.map((r) => ({
    data: r.dataLegend,
    materia: r.materia,
    testo: r.testo,
    assegnatoIl: extractAssegnatoIl(r.testo),
  }));

  if (minOpt?.ok) {
    list = list.filter((e) => {
      const t = legendTimeOrNull(e.data);
      if (t === null) return true;
      return t >= minOpt.t;
    });
  }
  if (maxOpt?.ok) {
    list = list.filter((e) => {
      const t = legendTimeOrNull(e.data);
      if (t === null) return true;
      return t <= maxOpt.t;
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
        e.testo.toLocaleLowerCase(SEARCH_LOCALE),
        opts.contenuto,
      ),
    );
  }

  logCompitiStep(`done (${list.length} righe)`);
  await closeModalIfPresent(page);

  return list;
}
