import { defineConfig } from "vitest/config";

export default defineConfig({
  server: {
    sourcemapIgnoreList: (sourcePath) =>
      sourcePath.includes("vendor/did-resolver"),
  },
  test: {
    include: [
      "src/**/*.test.ts",
      "probe/src/**/*.test.ts",
      "web/src/**/*.test.ts",
    ],
    coverage: {
      include: ["src/**/*.ts", "probe/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
