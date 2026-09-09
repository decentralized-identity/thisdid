import { describe, expect, it } from "vitest";
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

// Every case here is offline: malformed and foreign identifiers are rejected
// by did-resolver before this driver would touch the network.
describe(COMMAND, () => {
  it("prints usage and exits 0 on --help", async () => {
    const c = capture();
    expect(await main(["--help"], {}, c.io)).toBe(0);
    expect(c.out.join("")).toBe(USAGE);
    expect(c.err).toEqual([]);
  });

  it("exits 2 with usage on stderr when no DID is given", async () => {
    const c = capture();
    expect(await main([], {}, c.io)).toBe(2);
    expect(c.err.join("")).toContain("missing <did>");
    expect(c.err.join("")).toContain("Usage:");
    expect(c.out).toEqual([]);
  });

  it("rejects unknown options, stray arguments and valueless flags", () => {
    expect(parseArgs(["did:oyd:x", "--nope"]).error).toBe(
      "unknown option --nope",
    );
    expect(parseArgs(["did:oyd:x", "extra"]).error).toBe(
      "unexpected argument extra",
    );
    expect(parseArgs(["did:oyd:x", "--version-id"]).error).toBe(
      "--version-id requires a value",
    );
    expect(parseArgs(["did:oyd:x", "--version-time", "--compact"]).error).toBe(
      "--version-time requires a value",
    );
  });

  it("passes resolution options and --compact through", () => {
    const parsed = parseArgs([
      "--version-id",
      "3",
      "did:oyd:x",
      "--version-time",
      "2026-01-01T00:00:00Z",
      "--compact",
    ]);
    expect(parsed.error).toBeUndefined();
    expect(parsed.did).toBe("did:oyd:x");
    expect(parsed.compact).toBe(true);
    expect(parsed.resolutionOptions).toEqual({
      versionId: "3",
      versionTime: "2026-01-01T00:00:00Z",
    });
  });

  it("reports a malformed DID as invalidDid JSON with exit 1", async () => {
    const c = capture();
    expect(await main(["did:oyd:"], {}, c.io)).toBe(1);
    const result = JSON.parse(c.out.join(""));
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didDocument).toBeNull();
  });

  it("reports a foreign method as unsupportedDidMethod with exit 1", async () => {
    const c = capture();
    expect(await main(["did:example:123", "--compact"], {}, c.io)).toBe(1);
    expect(c.out.join("")).not.toContain("\n  ");
    expect(JSON.parse(c.out.join("")).didResolutionMetadata.error).toBe(
      "unsupportedDidMethod",
    );
  });

  it("maps the documented environment variables onto resolver options", () => {
    expect(optionsFromEnv({})).toEqual({});
    expect(
      optionsFromEnv({
        OYD_FOLLOW_ALSO_KNOWN_AS: "1",
        OYD_STRICT_REVOCATION_SIG: "false",
        OYD_STRICT_PUBKEY_BINDING: "yes",
        OYD_MAX_LOG_ENTRIES: "500",
        OYD_MAX_PREVIOUS_REFS: "3",
        OYD_ALLOW_HOSTS: "oydid.ownyourdata.eu, repo.example",
        OYD_ALLOW_PRIVATE_HOSTS: "0",
        OYD_ALLOW_SCHEMES: "https,http",
        UNRELATED: "ignored",
      }),
    ).toEqual({
      followAlsoKnownAs: true,
      strictRevocationSig: false,
      strictPubkeyBinding: true,
      maxLogEntries: 500,
      maxPreviousRefs: 3,
      repositoryPolicy: {
        allowHosts: ["oydid.ownyourdata.eu", "repo.example"],
        schemes: ["https", "http"],
        allowPrivateHosts: false,
      },
    });
  });

  it("exits 2 on a malformed environment value without resolving", async () => {
    for (const env of [
      { OYD_STRICT_REVOCATION_SIG: "maybe" },
      { OYD_MAX_LOG_ENTRIES: "-1" },
      { OYD_MAX_PREVIOUS_REFS: "1.5" },
    ]) {
      const c = capture();
      expect(
        await main(
          ["did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh"],
          env,
          c.io,
        ),
      ).toBe(2);
      expect(c.err.join("")).toContain(Object.keys(env)[0]);
      expect(c.out).toEqual([]);
    }
  });
});
