import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { getDb } from "./index";

/**
 * Applied once at boot, before the server takes traffic. Safe to run every
 * start — drizzle records which migrations have already been applied.
 */
export function runMigrations(): void {
  migrate(getDb(), { migrationsFolder: path.join(process.cwd(), "drizzle") });
}
