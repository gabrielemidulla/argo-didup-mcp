import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import type { AppDb } from "./db.ts";
import { automations, type AutomationSelect } from "./schema.ts";

export type AutomationRow = {
  id: string;
  prompt: string;
  cron_expression: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
};

function rowFromDb(r: AutomationSelect): AutomationRow {
  return {
    id: r.id,
    prompt: r.prompt,
    cron_expression: r.cronExpression,
    enabled: r.enabled,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

export class AutomationRepository {
  constructor(private readonly db: AppDb) {}

  async listAll(): Promise<AutomationRow[]> {
    const rows = await this.db
      .select()
      .from(automations)
      .orderBy(asc(automations.createdAt));
    return rows.map(rowFromDb);
  }

  async listEnabled(): Promise<AutomationRow[]> {
    const rows = await this.db
      .select()
      .from(automations)
      .where(eq(automations.enabled, true))
      .orderBy(asc(automations.createdAt));
    return rows.map(rowFromDb);
  }

  async getById(id: string): Promise<AutomationRow | null> {
    const rows = await this.db
      .select()
      .from(automations)
      .where(eq(automations.id, id))
      .limit(1);
    const r = rows[0];
    return r ? rowFromDb(r) : null;
  }

  async create(prompt: string, cron_expression: string): Promise<string> {
    const id = randomUUID();
    await this.db
      .insert(automations)
      .values({
        id,
        prompt,
        cronExpression: cron_expression,
      })
      .execute();
    return id;
  }

  async update(
    id: string,
    patch: {
      prompt?: string;
      cron_expression?: string;
      enabled?: boolean;
    },
  ): Promise<boolean> {
    const updates: Partial<{
      prompt: string;
      cronExpression: string;
      enabled: boolean;
    }> = {};
    if (patch.prompt !== undefined) updates.prompt = patch.prompt;
    if (patch.cron_expression !== undefined) {
      updates.cronExpression = patch.cron_expression;
    }
    if (patch.enabled !== undefined) updates.enabled = patch.enabled;
    if (Object.keys(updates).length === 0) return false;
    const [header] = await this.db
      .update(automations)
      .set(updates)
      .where(eq(automations.id, id))
      .execute();
    return header.affectedRows > 0;
  }

  async delete(id: string): Promise<boolean> {
    const [header] = await this.db
      .delete(automations)
      .where(eq(automations.id, id))
      .execute();
    return header.affectedRows > 0;
  }
}
