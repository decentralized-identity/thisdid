import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

const browserGlobals = {
  Blob: "readonly",
  document: "readonly",
  localStorage: "readonly",
  navigator: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  window: "readonly",
};

export default tseslint.config(
  {
    ignores: [
      "node_modules/**",
      "vendor/**",
      "web/dist/**",
      "worker-configuration.d.ts",
      "**/.wrangler/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["web/src/**/*.{ts,tsx}"],
    languageOptions: { globals: browserGlobals },
    ...reactHooks.configs.flat["recommended-latest"],
  },
  prettier,
);
