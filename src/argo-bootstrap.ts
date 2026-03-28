import { getArgoCredentialsFromEnv, login } from "./browser.ts";
import { getBrowser, setLoggedInPage } from "./session.ts";

/** Login una tantum all'avvio del processo MCP (stdio o HTTP). */
export async function bootstrapArgoSession(): Promise<void> {
  const creds = getArgoCredentialsFromEnv();
  if (!creds) {
    throw new Error(
      "CODICE_SCUOLA, USERNAME e PASSWORD sono obbligatorie all'avvio del server MCP.",
    );
  }
  const browser = await getBrowser();
  const page = await login(browser, creds);
  await setLoggedInPage(page);
  console.error("[argo] login completato; sessione browser persistente attiva");
}
