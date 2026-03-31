import type { Page } from "puppeteer";
import type { ArgoCredentials } from "../types.ts";
import { getArgoCredentialsFromEnv, login, openPortalIndex } from "../browser.ts";
import { getBrowser, shutdownSession } from "../session.ts";

export async function withArgoSession(
  fn: (page: Page) => Promise<unknown>,
): Promise<void> {
  const credentials = getCredentials();
  try {
    const browser = await getBrowser();
    const page = await login(browser, credentials);
    await openPortalIndex(page);
    const result = await fn(page);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await shutdownSession();
  }
}

export function getCredentials(): ArgoCredentials {
  const creds = getArgoCredentialsFromEnv();
  if (!creds) {
    console.error(
      "Variabili d'ambiente mancanti: CODICE_SCUOLA, USERNAME, PASSWORD",
    );
    process.exit(1);
  }
  return creds;
}
