import type { Page } from "puppeteer";
import type { CurriculumAlunnoRow } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";

const SEL = {
  menu: '[id="menu-servizialunno:curriculum-famiglia"]',
} as const;

function log(msg: string) {
  console.error(`[curriculum-alunno] ${msg}`);
}

type RawRow = {
  anno: string;
  classe: string;
  credito: number | null;
  media: number | null;
  esito: string;
  iconaSmile: boolean;
};

/**
 * Curriculum alunno (famiglia): tabella anni con classe, credito, media, esito.
 */
export async function curriculumAlunno(
  page: Page,
): Promise<CurriculumAlunnoRow[]> {
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

  log("wait curriculum table");
  try {
    await page.waitForFunction(
      () => {
        function norm(s: string): string {
          return s.replace(/\s+/g, " ").trim();
        }
        for (const t of Array.from(document.querySelectorAll("table"))) {
          const ths = t.querySelectorAll("thead tr th");
          if (ths.length < 6) continue;
          const j = Array.from(ths)
            .map((th) => norm(th.textContent ?? ""))
            .join(" ");
          if (
            j.includes("Anno") &&
            j.includes("Classe") &&
            j.includes("Credito") &&
            j.includes("Media") &&
            j.includes("Esito")
          ) {
            return true;
          }
        }
        return false;
      },
      { timeout: 30_000 },
    );
  } catch {
    log("table wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 800));
  log("scrape");

  const raw = await page.evaluate(() => {
    function norm(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    function parseNum(raw: string): number | null {
      const s = norm(raw);
      if (!s) return null;
      const n = parseFloat(s.replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }

    function findTable(): HTMLTableElement | null {
      for (const t of Array.from(document.querySelectorAll("table"))) {
        const ths = t.querySelectorAll("thead tr th");
        if (ths.length < 6) continue;
        const j = Array.from(ths)
          .map((th) => norm(th.textContent ?? ""))
          .join(" ");
        if (
          j.includes("Anno") &&
          j.includes("Classe") &&
          j.includes("Credito") &&
          j.includes("Media") &&
          j.includes("Esito")
        ) {
          return t;
        }
      }
      return null;
    }

    const table = findTable();
    if (!table) {
      return { rows: [] as RawRow[], err: "tabella curriculum non trovata" };
    }

    const rows: RawRow[] = [];
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 6) continue;

      const iconTd = tds[0]!;
      const iconaSmile = !!iconTd.querySelector('img[src*="smile"]');

      const anno = norm(tds[1]!.textContent ?? "");
      const classe = norm(tds[2]!.textContent ?? "");
      const creditoRaw = norm(tds[3]!.textContent ?? "");
      const mediaRaw = norm(tds[4]!.textContent ?? "");
      const esito = norm(tds[5]!.textContent ?? "");

      let credito: number | null = null;
      if (creditoRaw !== "") {
        const c = parseInt(creditoRaw, 10);
        credito = Number.isFinite(c) ? c : null;
      }

      rows.push({
        anno,
        classe,
        credito,
        media: mediaRaw === "" ? null : parseNum(mediaRaw),
        esito,
        iconaSmile,
      });
    }

    return { rows, err: null as string | null };
  });

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  const list: CurriculumAlunnoRow[] = raw.rows.map((r) => ({
    anno: r.anno,
    classe: r.classe,
    credito: r.credito,
    media: r.media,
    esito: r.esito,
    iconaSmile: r.iconaSmile,
  }));

  log(`done (${list.length} righe)`);
  await closeModalIfPresent(page);

  return list;
}
