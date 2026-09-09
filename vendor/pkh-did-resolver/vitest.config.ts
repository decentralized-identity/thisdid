import { defineConfig } from "vitest/config";

// Explicit config so vitest never falls back to the repo root's
// vitest.config.ts (whose include patterns match nothing from this cwd).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
