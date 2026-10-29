import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The same alias tsconfig.json gives the app, so tests can import route handlers.
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
});
