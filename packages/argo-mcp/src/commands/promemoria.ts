import type { Page } from "puppeteer";
import type { Promemoria } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";
import { parseDdMmYyyy } from "./_shared/parse-dd-mm-yyyy.ts";

const SEL = {
  menu: '[id="menu-serviziclasse:promemoria-famiglia"]',
  /** Griglia elenco promemoria. */
  listGrid: '[id="sheet-promemoria:_idJsp2"]',
  /** "Mostra anche i promemoria con data antecedente alla data odierna". */
  checkboxMostraPassati: '[id="sheet-promemoria:_idJsp13"]',
} as const;

export interface PromemoriaOptions {
  /** DD/MM/YYYY inclusiva sul campo data. */
  data_da?: string;
  /** DD/MM/YYYY inclusiva sul campo data. */
  data_a?: string;
}

type Ymd = { y: number; m: number; d: number };

/** Oggi calendario (mezzanotte logica) in Europe/Rome. */
function romeTodayYmd(): Ymd {
  const s = new Date().toLocaleDateString("en-CA", {
    timeZone: "Europe/Rome",
  });
  const parts = s.split("-").map((x) => Number.parseInt(x, 10));
  const y = parts[0]!;
  const mo = parts[1]!;
  const d = parts[2]!;
  return { y, m: mo, d };
}

function parseDdMmYyyyYmd(raw: string): Ymd | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  const y = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return { y, m: mo, d };
}

/** Confronto solo calendario: -1 se a < b, 0 se uguale, 1 se a > b. */
function compareCalendar(a: Ymd, b: Ymd): number {
  if (a.y !== b.y) return a.y < b.y ? -1 : 1;
  if (a.m !== b.m) return a.m < b.m ? -1 : 1;
  if (a.d !== b.d) return a.d < b.d ? -1 : 1;
  return 0;
}

/**
 * True se il filtro richiesto può includere promemoria con data **strictly before**
 * oggi (Rome): allora va attivato il checkbox e poi si filtra lato client.
 * - Nessun parametro → solo elenco “futuri” del portale (no checkbox).
 * - Solo data_a → limite superiore con inferiore illimitato → include sempre il passato.
 * - Solo data_da → [data_da, ∞) interseca il passato sse data_da < oggi.
 * - Entrambe → [data_da, data_a] interseca il passato sse data_da < oggi.
 */
function rangeNeedsPastPromemoria(
  data_da?: string,
  data_a?: string,
): boolean {
  const da = data_da?.trim();
  const a = data_a?.trim();
  if (!da && !a) return false;

  const today = romeTodayYmd();

  if (da && !a) {
    const p = parseDdMmYyyyYmd(da);
    if (!p) return false;
    return compareCalendar(p, today) < 0;
  }

  if (!da && a) {
    return true;
  }

  const pDa = parseDdMmYyyyYmd(da!);
  const pA = parseDdMmYyyyYmd(a!);
  if (!pDa || !pA) return false;
  return compareCalendar(pDa, today) < 0;
}

function log(msg: string) {
  console.error(`[promemoria] ${msg}`);
}

type RawRow = {
  data: string;
  dataIso: string | null;
  appunto: string;
  inseritaDa: string;
};

/**
 * Modale promemoria famiglia: se il filtro richiesto può includere date prima di oggi
 * (Europe/Rome), attiva il checkbox “mostra passati”, attende il caricamento e poi
 * filtra per data_da/data_a; altrimenti legge solo l’elenco default (senza checkbox).
 */
export async function promemoria(
  page: Page,
  opts: PromemoriaOptions = {},
): Promise<Promemoria[]> {
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

  const loadPast = rangeNeedsPastPromemoria(opts.data_da, opts.data_a);
  log(
    loadPast
      ? "range include passato (Rome) → carico tutti i promemoria (checkbox)"
      : "range solo oggi/futuro o assente → elenco default senza checkbox",
  );

  log("wait menu (attached)");
  await page.waitForSelector(SEL.menu, { timeout: 60_000 });

  log("click menu");
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", inline: "nearest" });
    el?.click();
  }, SEL.menu);

  log("wait network idle (dopo menu)");
  await page
    .waitForNetworkIdle({ idleTime: 500, timeout: 15_000 })
    .catch(() => {
      log("network idle timeout (ok)");
    });

  if (loadPast) {
    log("wait checkbox mostra passati");
    await page.waitForSelector(SEL.checkboxMostraPassati, { timeout: 30_000 });

    log("attiva checkbox promemoria passati se necessario");
    const toggled = await page.evaluate((sel) => {
      const root = document.querySelector(sel) as HTMLElement | null;
      if (!root) return false;

      const inp = (
        root.matches("input")
          ? root
          : root.querySelector("input[type='checkbox']")
      ) as HTMLInputElement | null;

      if (inp) {
        if (!inp.checked) {
          inp.click();
          return true;
        }
        return false;
      }

      root.click();
      return true;
    }, SEL.checkboxMostraPassati);

    if (toggled) {
      log("wait network idle (dopo checkbox)");
      await page
        .waitForNetworkIdle({ idleTime: 500, timeout: 20_000 })
        .catch(() => {
          log("network idle dopo checkbox timeout (ok)");
        });
    } else {
      log("checkbox già attivo — breve attesa griglia");
      await new Promise((r) => setTimeout(r, 600));
    }
  } else {
    await new Promise((r) => setTimeout(r, 500));
  }

  log("wait list grid");
  try {
    await page.waitForSelector(SEL.listGrid, { timeout: 30_000 });
  } catch {
    log("list grid wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 500));
  log("scrape");

  const raw = await page.evaluate((listSel: string) => {
    function norm(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    const root = document.querySelector(listSel);
    if (!root) {
      return { rows: [] as RawRow[], err: "griglia non trovata" };
    }

    const tbody = root.querySelector(".btl-grid-dataViewContainer tbody");
    const trs = Array.from(tbody?.querySelectorAll("tr[rowid]") ?? []);

    const rows: RawRow[] = [];
    for (const tr of trs) {
      const cells = tr.querySelectorAll("td.btl-grid-cell");
      if (cells.length < 3) continue;

      const td0 = cells[0]!;
      const valSpan = td0.querySelector("span.value");
      const isoRaw = norm(valSpan?.textContent ?? "");
      const dataIso = /^\d{4}-\d{2}-\d{2}$/.test(isoRaw) ? isoRaw : null;

      let data = "";
      for (const sp of Array.from(td0.querySelectorAll("span"))) {
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
      if (!data) {
        data = norm(td0.textContent ?? "");
      }

      const appunto = norm(cells[1]?.textContent ?? "");
      const inseritaDa = norm(cells[2]?.textContent ?? "");

      if (!data && !appunto) continue;
      rows.push({
        data,
        dataIso,
        appunto,
        inseritaDa,
      });
    }

    return { rows, err: null as string | null };
  }, SEL.listGrid);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  let list: Promemoria[] = raw.rows.map((r) => ({
    data: r.data,
    dataIso: r.dataIso,
    appunto: r.appunto,
    inseritaDa: r.inseritaDa,
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

  log(`done (${list.length} promemoria)`);
  await closeModalIfPresent(page);

  return list;
}
