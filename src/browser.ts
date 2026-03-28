import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Page, Browser, Cookie } from "puppeteer";
import type { ArgoCredentials } from "./types.ts";

puppeteer.use(StealthPlugin());

const BASE_URL = "https://www.portaleargo.it/argoweb/famiglia/";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36";

const KEYCHAIN_SERVICE = "argo-didup-mcp";
const KEYCHAIN_ACCOUNT = "session-cookies";

async function keychainSet(data: string): Promise<boolean> {
  // Delete existing entry first (ignore errors if it doesn't exist)
  const del = Bun.spawn(
    ["security", "delete-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT],
    { stderr: "pipe" },
  );
  await del.exited;

  const proc = Bun.spawn(
    [
      "security",
      "add-generic-password",
      "-s", KEYCHAIN_SERVICE,
      "-a", KEYCHAIN_ACCOUNT,
      "-w", data,
      "-U",
    ],
    { stderr: "pipe" },
  );
  return (await proc.exited) === 0;
}

async function keychainGet(): Promise<string | null> {
  const proc = Bun.spawn(
    ["security", "find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const code = await proc.exited;
  if (code !== 0) return null;
  return (await new Response(proc.stdout).text()).trim();
}

async function loadCookies(): Promise<Cookie[] | null> {
  try {
    const data = await keychainGet();
    if (!data) return null;
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveCookies(page: Page): Promise<void> {
  const cdp = await page.createCDPSession();
  const { cookies } = await cdp.send("Network.getAllCookies");
  await cdp.detach();

  const weekFromNow = Date.now() / 1000 + 7 * 24 * 60 * 60;
  const persistable = cookies.map(({ session: _s, ...c }: any) => ({
    ...c,
    expires: c.expires === -1 || c.expires === 0 ? weekFromNow : c.expires,
  }));

  const ok = await keychainSet(JSON.stringify(persistable));
  console.error(
    ok
      ? `[session] ${persistable.length} cookies saved to Keychain`
      : `[session] failed to save cookies to Keychain`,
  );
}

async function injectBackbasePatch(page: Page) {
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });

    window.alert = (msg?: any) => {
      console.warn("[suppressed alert]", msg);
    };

    let _bbStore: any;
    Object.defineProperty(window, "bb", {
      configurable: true,
      enumerable: true,
      get() {
        return _bbStore;
      },
      set(val) {
        if (val && typeof val === "object") {
          val._G_ = true;
          val.c9_ = "webkit";
          val._U_ = 537.36;
          val.customFallback = function () {};
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

export async function createBrowser(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    defaultViewport: { width: 1280, height: 900 },
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });
}

async function preparePage(browser: Browser): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(USER_AGENT);
  page.setDefaultNavigationTimeout(120_000);
  page.setDefaultTimeout(120_000);
  await injectBackbasePatch(page);
  return page;
}

/**
 * SSO form login — much faster than Backbase portal login.
 * Submits credentials via the lightweight HTML form at /auth/sso/login/.
 */
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

  // Set "Ricordami" hidden input to enable SSO
  await page.evaluate(() => {
    const el = document.querySelector<HTMLInputElement>('[name="remember_me"]');
    if (el) el.value = "1";
  });

  await page.click("#accediBtn");

  // Wait for the full redirect chain: SSO → OAuth → callback → portal
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
  // 1) Try restoring session from cookies (fast, but unlikely to work
  //    because Backbase invalidates server sessions on disconnect)
  const cookies = await loadCookies();
  if (cookies?.length) {
    const page = await preparePage(browser);
    const cdp = await page.createCDPSession();
    for (const c of cookies) {
      await cdp.send("Network.setCookie", c);
    }
    await cdp.detach();

    await page.goto(BASE_URL + "index.jsf", { waitUntil: "networkidle2" });

    // If we landed on the SSO login form, try fast form login
    if (page.url().includes("login_challenge")) {
      if (await loginViaSsoForm(page, credentials)) {
        await saveCookies(page);
        return page;
      }
      await page.close();
    } else {
      try {
        await page.waitForSelector(".btl-panel", { visible: true, timeout: 10_000 });
        console.error("[session] restored from cookies");
        return page;
      } catch {
        await page.close();
      }
    }
  }

  // 2) Full Backbase login (fallback)
  console.error("[session] full Backbase login");
  const page = await preparePage(browser);
  await page.goto(BASE_URL, { waitUntil: "networkidle2" });

  await page.waitForSelector("#codiceScuola", { visible: true });
  await page.type("#codiceScuola", credentials.codiceScuola, { delay: 20 });
  await page.type("#username", credentials.username, { delay: 20 });
  await page.type("#password", credentials.password, { delay: 20 });
  try {
    await page.waitForSelector("#shared_remember_me", { visible: true, timeout: 3_000 });
    await page.evaluate(() => {
      const cb = document.querySelector("#shared_remember_me") as HTMLInputElement;
      if (cb && !cb.checked) cb.click();
    });
    await page.waitForSelector(".modal-footer > button", { visible: true, timeout: 5_000 });
    await page.click(".modal-footer > button");
    await new Promise((r) => setTimeout(r, 500));
  } catch {}

  await page.waitForSelector("#accediBtn", { visible: true });
  await page.click("#accediBtn");

  await page.waitForSelector(".btl-panel", {
    visible: true,
    timeout: 120_000,
  });
  await new Promise((r) => setTimeout(r, 1500));

  await saveCookies(page);
  return page;
}
