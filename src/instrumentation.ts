/**
 * Next calls this once per server process, before any request is handled —
 * which makes it the right place to bring the schema up to date.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runMigrations } = await import("./db/migrate");
    runMigrations();
  }
}
