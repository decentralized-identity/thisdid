import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const vendor = fileURLToPath(new URL("./vendor/", import.meta.url));

export default defineConfig({
  // The vendored packages are not npm dependencies (npm prunes and rewrites
  // anything it finds in node_modules, including pnpm-installed vendor trees),
  // so they are resolved by alias here, in tsconfig "paths" and in the wrangler
  // configs.
  resolve: {
    alias: [
      { find: /^@thisdid\/(.+)$/, replacement: `${vendor}$1` },
      { find: /^did-resolver$/, replacement: `${vendor}did-resolver` },
    ],
  },
  server: {
    sourcemapIgnoreList: (sourcePath) =>
      sourcePath.includes("vendor/did-resolver"),
  },
  test: {
    // Execute the vendored packages natively (as installed dependencies are),
    // so their own pnpm-resolved imports are handled by Node, not by Vite.
    server: { deps: { external: [/\/vendor\//] } },
    include: [
      "src/**/*.test.ts",
      "probe/src/**/*.test.ts",
      "directory/src/**/*.test.ts",
      "web/src/**/*.test.ts",
    ],
    coverage: {
      include: ["src/**/*.ts", "probe/src/**/*.ts", "directory/src/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
