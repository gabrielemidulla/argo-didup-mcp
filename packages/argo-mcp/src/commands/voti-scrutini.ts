import type { Page } from "puppeteer";
import type {
  VotiScrutiniResult,
  VotoScrutinioQuadrimestre1,
  VotoScrutinioQuadrimestre2,
} from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";

const SEL = {
  menu: '[id="menu-servizialunno:voti-scrutinio-famiglia"]',
  tabBox: ".btl-tabBox",
} as const;

export interface VotiScrutiniOptions {
  quadrimestre: 1 | 2;
}

function log(msg: string) {
  console.error(`[voti-scrutini] ${msg}`);
}

type ScrapePayload =
  | { ok: false; err: string }
  | {
      ok: true;
      quadrimestre: 1;
      tabEtichetta: string;
      righe: VotoScrutinioQuadrimestre1[];
    }
  | {
      ok: true;
      quadrimestre: 2;
      tabEtichetta: string;
      righe: VotoScrutinioQuadrimestre2[];
      avvisoFamiglia: string | null;
    };

/**
 * Voti scrutinio (famiglia): tab 1 = primo quadrimestre, tab 2 = scrutinio finale.
 */
export async function votiScrutini(
  page: Page,
  opts: VotiScrutiniOptions,
): Promise<VotiScrutiniResult> {
  const q = opts.quadrimestre;
  if (q !== 1 && q !== 2) {
    throw new Error("quadrimestre deve essere 1 o 2");
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

  log("wait tab box");
  try {
    await page.waitForSelector(SEL.tabBox, { timeout: 30_000 });
  } catch {
    log("tab box wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 600));

  log(`select tab quadrimestre=${q}`);
  await page.evaluate((target: 1 | 2) => {
    const container = document.querySelector(".btl-tabBox-tabContainer");
    if (!container) return;
    const tabs = Array.from(container.children).filter((el) =>
      el.classList.contains("btl-tab"),
    ) as HTMLElement[];
    const idx = target - 1;
    const tab = tabs[idx];
    if (tab && !tab.classList.contains("btl-tab-selected")) {
      tab.click();
    }
  }, q);

  const idx = q - 1;
  try {
    await page.waitForFunction(
      (expectedIdx: number) => {
        const container = document.querySelector(".btl-tabBox-tabContainer");
        if (!container) return false;
        const tabs = Array.from(container.children).filter((el) =>
          el.classList.contains("btl-tab"),
        );
        const t = tabs[expectedIdx];
        return !!(t && t.classList.contains("btl-tab-selected"));
      },
      { timeout: 15_000 },
      idx,
    );
  } catch {
    log("tab selected wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 600));
  log("scrape");

  const raw = await page.evaluate((target: 1 | 2): ScrapePayload => {
    function norm(s: string): string {
      return s.replace(/\s+/g, " ").trim();
    }

    const selectedTab = document.querySelector(
      ".btl-tab.btl-tab-selected .btl-tab-label",
    );
    const tabEtichetta = norm(selectedTab?.textContent ?? "");

    const panel = document.querySelector(
      ".btl-tab-content.btl-tab-content-selected",
    );
    const table =
      panel?.querySelector(".tableContainer table") ??
      panel?.querySelector("table");
    if (!table) {
      return { ok: false, err: "tabella voti scrutinio non trovata" };
    }

    let avvisoFamiglia: string | null = null;
    if (target === 2 && panel) {
      for (const div of Array.from(panel.querySelectorAll("div"))) {
        const st = div.getAttribute("style") ?? "";
        if (!st.includes("padding-top") || !st.includes("5px")) continue;
        const t = norm(div.textContent ?? "");
        if (t) {
          avvisoFamiglia = t;
          break;
        }
      }
    }

    if (target === 1) {
      const righe: VotoScrutinioQuadrimestre1[] = [];
      for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
        const tds = tr.querySelectorAll("td");
        if (tds.length < 6) continue;
        const cells = Array.from(tds).map((td) =>
          norm(td.textContent ?? ""),
        );
        righe.push({
          materia: cells[0] ?? "",
          scritto: cells[1] ?? "",
          orale: cells[2] ?? "",
          altro: cells[3] ?? "",
          pratico: cells[4] ?? "",
          assenze: cells[5] ?? "",
        });
      }
      return {
        ok: true,
        quadrimestre: 1,
        tabEtichetta,
        righe,
      };
    }

    const righe: VotoScrutinioQuadrimestre2[] = [];
    for (const tr of Array.from(table.querySelectorAll("tbody tr"))) {
      const tds = tr.querySelectorAll("td");
      if (tds.length < 3) continue;
      const cells = Array.from(tds).map((td) => norm(td.textContent ?? ""));
      righe.push({
        materia: cells[0] ?? "",
        voto: cells[1] ?? "",
        assenze: cells[2] ?? "",
      });
    }

    return {
      ok: true,
      quadrimestre: 2,
      tabEtichetta,
      righe,
      avvisoFamiglia,
    };
  }, q);

  if (!raw.ok) {
    log(`warning: ${raw.err}`);
    throw new Error(raw.err);
  }

  log(`done (${raw.righe.length} materie, tab="${raw.tabEtichetta}")`);
  await closeModalIfPresent(page);

  if (raw.quadrimestre === 1) {
    return {
      quadrimestre: 1,
      tabEtichetta: raw.tabEtichetta,
      righe: raw.righe,
    };
  }
  return {
    quadrimestre: 2,
    tabEtichetta: raw.tabEtichetta,
    righe: raw.righe,
    avvisoFamiglia: raw.avvisoFamiglia,
  };
}
