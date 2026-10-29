import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

// Connect on first use, not at module load: `next build` evaluates route
// modules across several workers, and opening the same file from all of them
// races for the lock.
const globalForDb = globalThis as unknown as {
  konbenSqlite?: Database.Database;
  konbenDb?: Db;
};

export function getSqlite(): Database.Database {
  if (!globalForDb.konbenSqlite) {
    const sqlite = new Database(process.env.DATABASE_PATH ?? "./konben.db");
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    globalForDb.konbenSqlite = sqlite;
  }
  return globalForDb.konbenSqlite;
}

export function getDb(): Db {
  if (!globalForDb.konbenDb) {
    globalForDb.konbenDb = drizzle(getSqlite(), { schema });
  }
  return globalForDb.konbenDb;
}
