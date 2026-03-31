import { getArgoCredentialsFromEnv, login } from "./browser.ts";
import { getBrowser, setLoggedInPage, shutdownSession } from "./session.ts";

async function establishLoggedInSession(): Promise<void> {
  const creds = getArgoCredentialsFromEnv();
  if (!creds) {
    throw new Error(
      "CODICE_SCUOLA, USERNAME e PASSWORD sono obbligatorie all'avvio del server MCP.",
    );
  }
  const browser = await getBrowser();
  const page = await login(browser, creds);
  await setLoggedInPage(page);
}

export async function bootstrapArgoSession(): Promise<void> {
  await establishLoggedInSession();
  console.error("[argo] login completato; sessione browser persistente attiva");
}

/** Use when Puppeteer is inconsistent (e.g. detached frame, target closed). */
export async function restartArgoBrowserSession(): Promise<void> {
  await shutdownSession();
  await establishLoggedInSession();
  console.error("[argo] browser riavviato; login completato");
}
