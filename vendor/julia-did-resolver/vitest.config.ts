import { defineConfig } from "vitest/config";

// Explicit config so vitest never inherits an ancestor project's include
// patterns when this package is vendored inside another repository.
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
