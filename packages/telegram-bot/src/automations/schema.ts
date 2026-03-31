import {
  boolean,
  mysqlTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/mysql-core";

/** Automazioni pianificate (single-user, nessuna tabella utenti). */
export const automations = mysqlTable("automations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  prompt: text("prompt").notNull(),
  cronExpression: varchar("cron_expression", { length: 128 }).notNull(),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" })
    .notNull()
    .defaultNow()
    .onUpdateNow(),
});

export type AutomationSelect = typeof automations.$inferSelect;
