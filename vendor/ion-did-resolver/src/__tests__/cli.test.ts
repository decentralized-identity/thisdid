import { describe, expect, it } from "vitest";
import {
  COMMAND,
  USAGE,
  main,
  optionsFromEnv,
  parseArgs,
  type CliIo,
} from "../cli.js";
import {
  LONG_FORM_DID,
  LONG_FORM_EXPECTED,
  SHORT_FORM_DID,
} from "./fixture.js";

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
    expect(parseArgs(["did:ion:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:ion:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:ion:x", "--version-id"]).error).toBe(
      "--version-id requires a value",
    );
    expect(parseArgs(["did:ion:x", "--version-time", "--compact"]).error).toBe(
      "--version-time requires a value",
    );
  });

  it("passes resolution options and --compact through", () => {
    const parsed = parseArgs([
      "--version-id",
      "3",
      "did:ion:x",
      "--version-time",
      "2026-01-01T00:00:00Z",
      "--compact",
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.did).toBe("did:ion:x");
    expect(parsed.compact).toBe(true);
    expect(parsed.resolutionOptions).toEqual({
      versionId: "3",
      versionTime: "2026-01-01T00:00:00Z",
    });
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:ion:"], ENV, c.io)).toBe(1);
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
    expect(optionsFromEnv({})).toEqual({});
    expect(
      optionsFromEnv({
        ION_RESOLUTION_ENDPOINT: "https://ion.example/identifiers",
        ION_TIMEOUT_MS: "9000",
      }),
    ).toEqual({
      endpointUrl: "https://ion.example/identifiers",
      timeoutMs: 9000,
    });
  });

  it("exits 2 on a malformed environment value without resolving", async () => {
    for (const env of [
      { ION_RESOLUTION_ENDPOINT: "ion.example" },
      { ION_TIMEOUT_MS: "soon" },
    ]) {
      const c = capture();
      expect(await main(["did:ion:x"], { ...{}, ...env }, c.io)).toBe(2);
      expect(c.err.join("")).toContain(Object.keys(env)[0]);
      expect(c.out).toEqual([]);
    }
  });

  it("resolves a long-form identifier fully offline", async () => {
    const c = capture();
    expect(await main([LONG_FORM_DID, "--compact"], {}, c.io)).toBe(0);
    expect(JSON.parse(c.out.join(""))).toMatchObject(LONG_FORM_EXPECTED);
  });

  it("reports a short-form identifier as notConfigured without an endpoint", async () => {
    const c = capture();
    expect(await main([SHORT_FORM_DID], {}, c.io)).toBe(1);
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "notConfigured",
    );
  });
});
