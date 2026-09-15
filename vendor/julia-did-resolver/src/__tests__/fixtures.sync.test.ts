import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CANONICAL_FIXTURE_DIR, FIXTURE_DIR } from "./fixtures.js";

/**
 * The package carries its own copies of the repository's language-neutral
 * fixtures so it stays self-contained when vendored. In the canonical
 * repository the originals are present, and the copies must match them
 * exactly — otherwise "the TypeScript suite replays the same recordings" would
 * stop being true. Vendored elsewhere, there is nothing to compare and the
 * check is skipped.
 */
describe("fixture copies", () => {
  const canonical = existsSync(CANONICAL_FIXTURE_DIR);

  it.skipIf(!canonical)(
    "are byte-identical to the repository's fixtures",
    () => {
      const names = readdirSync(CANONICAL_FIXTURE_DIR).filter((name) =>
        name.endsWith(".json"),
      );
      expect(names.length).toBeGreaterThan(0);
      for (const name of names) {
        expect(readFileSync(join(FIXTURE_DIR, name), "utf8"), name).toBe(
          readFileSync(join(CANONICAL_FIXTURE_DIR, name), "utf8"),
        );
      }
    },
  );
});
