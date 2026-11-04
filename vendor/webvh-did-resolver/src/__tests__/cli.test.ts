import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FETCH_POLICY_DEFAULTS } from "../fetch-policy.js";
import {
  COMMAND,
  USAGE,
  main,
  optionsFromEnv,
  parseArgs,
  type CliIo,
} from "../cli.js";

function capture(): { out: string[]; err: string[]; io: CliIo } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: (text) => {
        out.push(text);
      },
      stderr: (text) => {
        err.push(text);
      },
    },
  };
}

const ENV = {};

// Every case here is offline: malformed and foreign identifiers are rejected
// by did-resolver before the driver would touch the network.
describe(COMMAND, () => {
  it("prints usage and exits 0 on --help", async () => {
    const c = capture();
    expect(await main(["--help"], ENV, c.io)).toBe(0);
    expect(c.out.join("")).toBe(USAGE);
    expect(c.err).toEqual([]);
  });

  it("exits 2 with usage on stderr when no DID is given", async () => {
    const c = capture();
    expect(await main([], ENV, c.io)).toBe(2);
    expect(c.err.join("")).toContain("missing <did>");
    expect(c.err.join("")).toContain("Usage:");
    expect(c.out).toEqual([]);
  });

  it("rejects unknown options, stray arguments and valueless flags", () => {
    expect(parseArgs(["did:webvh:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:webvh:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:webvh:x", "--version-id"]).error).toBe(
      "--version-id requires a value",
    );
    expect(
      parseArgs(["did:webvh:x", "--version-time", "--compact"]).error,
    ).toBe("--version-time requires a value");
  });

  it("passes resolution options and --compact through", () => {
    const parsed = parseArgs([
      "--version-id",
      "3",
      "did:webvh:x",
      "--version-time",
      "2026-01-01T00:00:00Z",
      "--compact",
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.did).toBe("did:webvh:x");
    expect(parsed.compact).toBe(true);
    expect(parsed.resolutionOptions).toEqual({
      versionId: "3",
      versionTime: "2026-01-01T00:00:00Z",
    });
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:webvh:"], ENV, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports a foreign method as unsupportedDidMethod with exit 1", async () => {
    const c = capture();
    expect(await main(["did:example:123", "--compact"], ENV, c.io)).toBe(1);
    expect(c.out.join("")).not.toContain("\n  ");
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "unsupportedDidMethod",
    );
  });

  it("maps the documented environment variables onto resolver options", () => {
    expect(optionsFromEnv({})).toEqual({
      fetchPolicy: { ...FETCH_POLICY_DEFAULTS },
    });
    expect(
      optionsFromEnv({
        WEBVH_TIMEOUT_MS: "3000",
        WEBVH_MAX_RESPONSE_BYTES: "1048576",
        WEBVH_MAX_REDIRECTS: "1",
        WEBVH_ALLOW_PRIVATE_HOSTS: "1",
      }),
    ).toEqual({
      fetchPolicy: {
        timeoutMs: 3000,
        maxResponseBytes: 1048576,
        maxRedirects: 1,
        allowPrivateHosts: true,
      },
    });
  });

  it("falls back to the default for every unset or empty variable", () => {
    expect(
      optionsFromEnv({
        WEBVH_TIMEOUT_MS: "",
        WEBVH_MAX_RESPONSE_BYTES: "  ",
        WEBVH_MAX_REDIRECTS: undefined,
        WEBVH_ALLOW_PRIVATE_HOSTS: "",
      }).fetchPolicy,
    ).toEqual(FETCH_POLICY_DEFAULTS);
    expect(
      optionsFromEnv({ WEBVH_MAX_REDIRECTS: "0" }).fetchPolicy,
    ).toMatchObject({
      maxRedirects: 0,
      timeoutMs: FETCH_POLICY_DEFAULTS.timeoutMs,
    });
  });

  // The example file, the README table and --help each restate the defaults;
  // these checks keep all three equal to FETCH_POLICY_DEFAULTS.
  const VARIABLES = {
    WEBVH_TIMEOUT_MS: String(FETCH_POLICY_DEFAULTS.timeoutMs),
    WEBVH_MAX_RESPONSE_BYTES: String(FETCH_POLICY_DEFAULTS.maxResponseBytes),
    WEBVH_MAX_REDIRECTS: String(FETCH_POLICY_DEFAULTS.maxRedirects),
    WEBVH_ALLOW_PRIVATE_HOSTS: FETCH_POLICY_DEFAULTS.allowPrivateHosts
      ? "1"
      : "0",
  };

  it(".dev.vars.example sets every variable to its default", () => {
    const example = readFileSync(
      new URL("../../.dev.vars.example", import.meta.url),
      "utf8",
    );
    const entries = Object.fromEntries(
      example
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"))
        .map((line) => line.split("=", 2) as [string, string]),
    );
    expect(entries).toEqual(VARIABLES);
    expect(optionsFromEnv(entries).fetchPolicy).toEqual(FETCH_POLICY_DEFAULTS);
  });

  it("documents every default in the README and in --help", () => {
    const readme = readFileSync(
      new URL("../../README.md", import.meta.url),
      "utf8",
    );
    for (const [name, value] of Object.entries(VARIABLES)) {
      expect(readme, name).toMatch(
        new RegExp(`\\| \`${name}\`\\s*\\| \`${value}\``),
      );
      expect(USAGE, name).toMatch(
        new RegExp(`${name}\\b.*\\(default ${value}\\)`),
      );
    }
  });

  it("exits 2 on a malformed environment value without resolving", async () => {
    for (const env of [
      { WEBVH_MAX_REDIRECTS: "-1" },
      { WEBVH_ALLOW_PRIVATE_HOSTS: "sometimes" },
      { WEBVH_TIMEOUT_MS: "0" },
      { WEBVH_TIMEOUT_MS: "8s" },
      { WEBVH_MAX_RESPONSE_BYTES: "0" },
    ]) {
      const c = capture();
      expect(await main(["did:webvh:x"], { ...{}, ...env }, c.io)).toBe(2);
      expect(c.err.join("")).toContain(Object.keys(env)[0]);
      expect(c.out).toEqual([]);
    }
  });
});
