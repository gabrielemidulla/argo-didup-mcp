import type { Page } from "puppeteer";
import type { DatiAnagraficiAlunno } from "../types.ts";
import { closeModalIfPresent } from "./_shared/close-modal.ts";

const SEL = {
  menu: '[id="menu-servizialunno:dati-anagrafici-famiglia"]',
  /** Prefisso stabile; il suffisso `_idJsp*` varia tra build. */
  formTable: 'table[id^="subview_datiAnagrafici:"]',
} as const;

/** ID input nel DOM Argo (nota: residenza è scritto `comuneResisdenza`). */
const IDS = {
  cognome: "subview_datiAnagrafici:cognome",
  nome: "subview_datiAnagrafici:nome",
  dataNascita: "subview_datiAnagrafici:dataNascita",
  cf: "subview_datiAnagrafici:cf",
  comuneNascita: "subview_datiAnagrafici:comuneNascita",
  cittadinanza: "subview_datiAnagrafici:cittadinanza",
  comuneResidenza: "subview_datiAnagrafici:comuneResisdenza",
  cap: "subview_datiAnagrafici:cap",
  via: "subview_datiAnagrafici:via",
  telefono: "subview_datiAnagrafici:telefono",
  sessoM: "subview_datiAnagrafici:sesso;M",
  sessoF: "subview_datiAnagrafici:sesso;F",
} as const;

function log(msg: string) {
  console.error(`[dati-anagrafici] ${msg}`);
}

/**
 * Dati anagrafici alunno (famiglia): modale da menu servizi alunno.
 */
export async function datiAnagrafici(page: Page): Promise<DatiAnagraficiAlunno> {
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

  log("wait form table");
  try {
    await page.waitForSelector(SEL.formTable, { timeout: 30_000 });
  } catch {
    log("form table wait timeout — proseguo");
  }

  await new Promise((r) => setTimeout(r, 800));
  log("scrape");

  const raw = await page.evaluate((ids: typeof IDS) => {
    function inputVal(id: string): string {
      const el = document.getElementById(id) as HTMLInputElement | null;
      return (el?.value ?? "").replace(/\s+/g, " ").trim();
    }

    let sesso = "";
    const m = document.getElementById(ids.sessoM) as HTMLInputElement | null;
    const f = document.getElementById(ids.sessoF) as HTMLInputElement | null;
    if (m?.checked) sesso = "Maschio";
    else if (f?.checked) sesso = "Femmina";

    const cognome = inputVal(ids.cognome);
    const nome = inputVal(ids.nome);

    const err =
      !cognome && !nome
        ? ("campi principali vuoti o form non trovato" as const)
        : null;

    return {
      err,
      data: {
        cognome,
        nome,
        dataNascita: inputVal(ids.dataNascita),
        sesso,
        codiceFiscale: inputVal(ids.cf),
        comuneNascita: inputVal(ids.comuneNascita),
        cittadinanza: inputVal(ids.cittadinanza),
        comuneResidenza: inputVal(ids.comuneResidenza),
        cap: inputVal(ids.cap),
        via: inputVal(ids.via),
        telefono: inputVal(ids.telefono),
      },
    };
  }, IDS);

  if (raw.err) {
    log(`warning: ${raw.err}`);
  }

  log("done");
  await closeModalIfPresent(page);

  return raw.data as DatiAnagraficiAlunno;
}
