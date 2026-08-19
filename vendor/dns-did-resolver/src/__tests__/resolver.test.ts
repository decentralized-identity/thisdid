import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver, uriRecordTarget } from "../resolver.js";

/** Live-captured RFC 3597 URI record for _key1._did.danubetech.com. */
const DANUBE_HEX =
  "\\# 60 00 64 00 0a 64 69 64 3a 6b 65 79 3a 7a 36 4d 6b 6a 76 42 6b 74 38 45 54 6e 78 58 47 42 46 50 53 47 67 59 4b 62 34 33 71 37 6f 4e 48 4c 58 38 42 69 59 53 50 63 58 56 47 36 67 59 36";
const DANUBE_TARGET =
  "did:key:z6MkjvBkt8ETnxXGBFPSGgYKb43q7oNHLX8BiYSPcXVG6gY6";
const DID = "did:dns:danubetech.com";

const resolve = (did: string) =>
  getResolver({ dohUrl: "https://doh.test/dns-query" }).dns(
    did,
    null as never,
    null as never,
    {},
  );

afterEach(() => vi.unstubAllGlobals());

describe("uriRecordTarget", () => {
  it("decodes RFC 3597 generic wire format", () => {
    expect(uriRecordTarget(DANUBE_HEX)).toBe(DANUBE_TARGET);
  });
  it("parses presentation format", () => {
    expect(uriRecordTarget('100 10 "did:key:zTest"')).toBe("did:key:zTest");
  });
  it("returns undefined for garbage", () => {
    expect(uriRecordTarget("\\# 2 00")).toBeUndefined();
    expect(uriRecordTarget("nonsense")).toBeUndefined();
  });
});

describe("did:dns DIF driver", () => {
  it("resolves sequential key records with offline did:key recursion", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const name = url.searchParams.get("name");
        if (name === "_key1._did.danubetech.com") {
          return Response.json({
            Status: 0,
            Answer: [{ name, type: 256, TTL: 86400, data: DANUBE_HEX }],
          });
        }
        return Response.json({ Status: 0 }); // NODATA → stop
      }),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.id).toBe(DID);
    // The Ed25519 did:key expands to two methods: the signing key itself and
    // the X25519 agreement key embedded in the did:key doc's `keyAgreement`.
    expect(doc?.verificationMethod).toHaveLength(2);
    expect(doc?.verificationMethod?.[0]?.id).toBe(`${DID}#key1`);
    expect(doc?.verificationMethod?.[0]?.controller).toBe(DID);
    expect(doc?.verificationMethod?.[0]?.type).toBe(
      "Ed25519VerificationKey2018",
    );
    expect(doc?.verificationMethod?.[1]?.id).toBe(`${DID}#key1-1`);
    expect(doc?.verificationMethod?.[1]?.controller).toBe(DID);
    expect(doc?.verificationMethod?.[1]?.type).toBe(
      "X25519KeyAgreementKey2019",
    );
    // Every id is unique and each relationship points at the key that
    // actually holds that capability — the signing key never gains
    // keyAgreement, the agreement key never gains authentication.
    const ids = (doc?.verificationMethod ?? []).map((vm) => vm.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(doc?.authentication).toEqual([`${DID}#key1`]);
    expect(doc?.assertionMethod).toEqual([`${DID}#key1`]);
    expect(doc?.keyAgreement).toEqual([`${DID}#key1-1`]);
  });

  it("returns notFound when no key records exist", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ Status: 0 })),
    );
    const result = await resolve("did:dns:nokeys.example");
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("treats NXDOMAIN as notFound and SERVFAIL as networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ Status: 3 })),
    );
    expect(
      (await resolve("did:dns:missing.example")).didResolutionMetadata.error,
    ).toBe("notFound");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ Status: 2 })),
    );
    expect(
      (await resolve("did:dns:broken.example")).didResolutionMetadata.error,
    ).toBe("networkError");
  });

  it("rejects an oversized DoH response before parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(300 * 1024))),
    );
    const result = await resolve("did:dns:oversized.example");
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("size bound");
  });

  it("skips non-did:key targets and rejects invalid domains offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const name = new URL(String(input)).searchParams.get("name");
        return Response.json(
          name === "_key1._did.other.example"
            ? {
                Status: 0,
                Answer: [
                  { name, type: 256, data: '10 1 "https://not-a-did.example"' },
                ],
              }
            : { Status: 0 },
        );
      }),
    );
    expect(
      (await resolve("did:dns:other.example")).didResolutionMetadata.error,
    ).toBe("notFound");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (await resolve("did:dns:not_a_domain!")).didResolutionMetadata.error,
    ).toBe("invalidDid");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
