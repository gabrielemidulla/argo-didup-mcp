import type { Page, Browser } from "puppeteer";
import type { ArgoCredentials } from "./types.ts";

export const BASE_URL = "https://www.portaleargo.it/argoweb/famiglia/";
/** Home portale dopo login: ogni tool call riparte da qui. */
export const PORTAL_INDEX_JSF = BASE_URL + "index.jsf";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

async function injectBackbasePatch(page: Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    window.alert = (msg?: unknown) => {
      console.warn("[suppressed alert]", msg);
    };

    let _bbStore: unknown;
    Object.defineProperty(window, "bb", {
      configurable: true,
      enumerable: true,
      get() {
        return _bbStore;
      },
      set(val) {
        if (val && typeof val === "object") {
          (val as Record<string, unknown>)._G_ = true;
          (val as Record<string, unknown>).c9_ = "webkit";
          (val as Record<string, unknown>)._U_ = 537.36;
          (val as Record<string, unknown>).customFallback = function () {};
        }
        _bbStore = val;
        Object.defineProperty(window, "bb", {
          value: val,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      },
    });
  });

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });
}

export async function preparePage(browser: Browser): Promise<Page> {
  const p = await browser.newPage();
  await p.setUserAgent(USER_AGENT);
  p.setDefaultNavigationTimeout(120_000);
  p.setDefaultTimeout(120_000);
  await injectBackbasePatch(p);
  return p;
}

async function loginViaSsoForm(
  page: Page,
  credentials: ArgoCredentials,
): Promise<boolean> {
  try {
    await page.waitForSelector("#loginForm", { visible: true, timeout: 5_000 });
  } catch {
    return false;
  }

  console.error("[session] using SSO form login (fast path)");

  await page.type('[name="famiglia_customer_code"]', credentials.codiceScuola, { delay: 10 });
  await page.type('[name="username"]', credentials.username, { delay: 10 });
  await page.type('[name="password"]', credentials.password, { delay: 10 });

  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('[name="remember_me"]');
    if (el) el.value = "1";
  });

  await page.click("#accediBtn");

  try {
    await page.waitForSelector(".btl-panel", { visible: true, timeout: 120_000 });
  } catch {
    return false;
  }

  await new Promise((r) => setTimeout(r, 1500));
  console.error("[session] SSO form login succeeded");
  return true;
}

export async function login(
  browser: Browser,
  credentials: ArgoCredentials,
): Promise<Page> {
  const newPage = await preparePage(browser);
  await newPage.goto(BASE_URL, { waitUntil: "networkidle2" });

  if (newPage.url().includes("login_challenge")) {
    if (await loginViaSsoForm(newPage, credentials)) {
      return newPage;
    }
    await newPage.close();
    throw new Error("Login Argo fallito (SSO).");
  }

  console.error("[session] full Backbase login");

  await newPage.waitForSelector("#codiceScuola", { visible: true });
  await newPage.type("#codiceScuola", credentials.codiceScuola, { delay: 20 });
  await newPage.type("#username", credentials.username, { delay: 20 });
  await newPage.type("#password", credentials.password, { delay: 20 });
  try {
    await newPage.waitForSelector("#shared_remember_me", { visible: true, timeout: 3_000 });
    await newPage.evaluate(() => {
      const cb = document.querySelector("#shared_remember_me") as HTMLInputElement;
      if (cb && !cb.checked) cb.click();
    });
    await newPage.waitForSelector(".modal-footer > button", { visible: true, timeout: 5_000 });
    await newPage.click(".modal-footer > button");
    await new Promise((r) => setTimeout(r, 500));
  } catch {}

  await newPage.waitForSelector("#accediBtn", { visible: true });
  await newPage.click("#accediBtn");

  await newPage.waitForSelector(".btl-panel", {
    visible: true,
    timeout: 120_000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  return newPage;
}

export function getArgoCredentialsFromEnv(): ArgoCredentials | null {
  const codiceScuola = Bun.env["CODICE_SCUOLA"];
  const username = Bun.env["USERNAME"];
  const password = Bun.env["PASSWORD"];
  if (!codiceScuola?.trim() || !username?.trim() || !password?.trim()) {
    return null;
  }
  return { codiceScuola, username, password };
}

/**
 * Assicura che la pagina sia sulla HOME del portale Argo (griglia pulsanti).
 * Cerca `#bacheca-famglia`; se non c'è, clicca il link Home nella SPA
 * per tornare alla griglia senza triggerare il redirect SSO.
 */
export async function openPortalIndex(page: Page): Promise<void> {
  const onHome = await page
    .evaluate(
      () =>
        !!document.querySelector("#bacheca-famglia") ||
        !!document.querySelector('[id*="bacheca"]'),
    )
    .catch(() => false);

  if (onHome) return;

  console.error("[openPortalIndex] not on home, navigating back");

  const clicked = await page.evaluate(() => {
    const home = document.querySelector<HTMLElement>(
      '[id="menu-home"], a[href*="index.jsf"], .btl-tree-leaf',
    );
    if (home) {
      home.click();
      return true;
    }
    return false;
  });

  if (clicked) {
    await page
      .waitForSelector("#bacheca-famglia", { timeout: 10_000 })
      .catch(() => {});
    const nowHome = await page
      .evaluate(() => !!document.querySelector("#bacheca-famglia"))
      .catch(() => false);
    if (nowHome) {
      await new Promise((r) => setTimeout(r, 500));
      return;
    }
  }

  console.error("[openPortalIndex] SPA nav failed, using goto");
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });

  if (page.url().includes("login_challenge")) {
    console.error("[openPortalIndex] SSO redirect, re-authenticating");
    const creds = getArgoCredentialsFromEnv();
    if (!creds) {
      throw new Error(
        "Sessione Argo scaduta e credenziali non disponibili per il re-login.",
      );
    }
    const ok = await loginViaSsoForm(page, creds);
    if (!ok) {
      throw new Error("Sessione Argo scaduta e re-login SSO fallito.");
    }
    return;
  }

  await page.waitForSelector(".btl-panel", { visible: true, timeout: 30_000 });
  await new Promise((r) => setTimeout(r, 500));
}
