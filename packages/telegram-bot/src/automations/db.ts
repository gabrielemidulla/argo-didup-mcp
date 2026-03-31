import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle, type MySql2Database } from "drizzle-orm/mysql2";
import { migrate } from "drizzle-orm/mysql2/migrator";
import mysql from "mysql2/promise";
import { serverEnv } from "../config/env.ts";
import * as schema from "./schema.ts";

export type MysqlConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export type AppDb = MySql2Database<typeof schema>;

export function mysqlConfigFromEnv(): MysqlConfig | null {
  const host = serverEnv.MYSQL_HOST?.trim();
  const database = serverEnv.MYSQL_DATABASE?.trim();
  const user = serverEnv.MYSQL_USER?.trim();
  if (!host || !database || !user) return null;
  const port = Number.parseInt(serverEnv.MYSQL_PORT ?? "3306", 10);
  return {
    host,
    port: Number.isFinite(port) ? port : 3306,
    user,
    password: serverEnv.MYSQL_PASSWORD ?? "",
    database,
  };
}

let pool: mysql.Pool | null = null;
let db: AppDb | null = null;

export function getDb(): AppDb {
  if (!db) throw new Error("Database non inizializzata");
  return db;
}

export async function initMysqlPool(cfg: MysqlConfig): Promise<void> {
  if (pool && db) return;
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    waitForConnections: true,
    connectionLimit: 10,
  });
  const migrationsFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../drizzle",
  );
  const d = drizzle(pool, { schema, mode: "default" });
  await migrate(d, { migrationsFolder });
  db = d;
}

export async function closeMysqlPool(): Promise<void> {
  db = null;
  if (!pool) return;
  await pool.end();
  pool = null;
}
