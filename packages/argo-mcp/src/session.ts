import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser, Page } from "puppeteer";
import { mcpServerEnv } from "./config/env.ts";

puppeteer.use(StealthPlugin());

let browser: Browser | null = null;
let page: Page | null = null;

export async function getBrowser(): Promise<Browser> {
  if (!browser) {
    const executablePath = mcpServerEnv.PUPPETEER_EXECUTABLE_PATH;
    browser = await puppeteer.launch({
      headless: true,
      defaultViewport: { width: 1280, height: 900 },
      ...(executablePath ? { executablePath } : {}),
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
      ],
    });
  }
  return browser;
}

export function getLoggedInPage(): Page | null {
  return page;
}

export async function setLoggedInPage(newPage: Page): Promise<void> {
  if (page && page !== newPage) {
    await page.close().catch(() => {});
  }
  page = newPage;
}

export async function shutdownSession(): Promise<void> {
  if (page) {
    await page.close().catch(() => {});
    page = null;
  }
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
}
