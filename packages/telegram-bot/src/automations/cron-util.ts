import { Cron } from "croner";

/** Cron standard a 5 campi: minuto ora giorno mese giorno_settimana. Fuso in opzioni Cron. */
export function assertValidCronExpression(
  expr: string,
  timezone: string,
): void {
  const trimmed = expr.trim();
  if (!trimmed) throw new Error("Espressione cron vuota");
  try {
    const c = new Cron(trimmed, { timezone, paused: true }, () => {});
    const next = c.nextRun();
    if (next === null) {
      throw new Error("Impossibile calcolare la prossima esecuzione");
    }
    c.stop();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Cron non valido: ${msg}`);
  }
}
