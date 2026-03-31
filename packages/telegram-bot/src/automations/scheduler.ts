import { Cron } from "croner";
import type { AutomationRepository, AutomationRow } from "./repository.ts";

type RunFn = (row: AutomationRow) => Promise<void>;

/**
 * Una Cron per riga abilitata; reload dopo ogni CRUD.
 * protect: evita sovrapposizioni sulla stessa espressione.
 */
export class AutomationScheduler {
  private crons: Cron[] = [];
  private reloadMutex = Promise.resolve();

  constructor(
    private readonly timezone: string,
    private readonly repo: AutomationRepository,
    private readonly onRun: RunFn,
  ) {}

  async start(): Promise<void> {
    await this.reload();
  }

  /** Serializza i reload per evitare stato inconsistente. */
  reload(): Promise<void> {
    this.reloadMutex = this.reloadMutex.then(() => this.reloadUnsafe());
    return this.reloadMutex;
  }

  private async reloadUnsafe(): Promise<void> {
    for (const c of this.crons) {
      c.stop();
    }
    this.crons = [];
    const rows = await this.repo.listEnabled();
    for (const row of rows) {
      const id = row.id;
      const expr = row.cron_expression;
      try {
        const c = new Cron(
          expr,
          { timezone: this.timezone, protect: true },
          () => {
            void this.tick(id);
          },
        );
        this.crons.push(c);
      } catch (e) {
        console.error(
          new Date().toISOString(),
          "[automation-scheduler]",
          "Salto automazione",
          id,
          "cron invalido:",
          e instanceof Error ? e.message : e,
        );
      }
    }
  }

  private async tick(id: string): Promise<void> {
    const row = await this.repo.getById(id);
    if (!row?.enabled) return;
    try {
      await this.onRun(row);
    } catch (e) {
      console.error(
        new Date().toISOString(),
        "[automation-scheduler]",
        "Esecuzione automazione",
        id,
        e instanceof Error ? e.message : e,
      );
    }
  }

  stop(): void {
    for (const c of this.crons) {
      c.stop();
    }
    this.crons = [];
  }
}
