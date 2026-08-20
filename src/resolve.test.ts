import { afterEach, describe, expect, it, vi } from "vitest";
import { planChain, resolveDid } from "./resolve";
import type { Env } from "./types";
import { resetHealthCache, type HealthSnapshot } from "./routing/health";
import { fetchUpstream } from "./resolvers/upstream";

const env = {
  GODIDDY_RESOLVER: "https://godiddy.test",
  ARCHON_RESOLVER: "https://archon.test",
  ARCHON_CID_RESOLVER: "https://gatekeeper.test/api/v1/did",
  GOPLAUSIBLE_RESOLVER: "https://goplausible.test",
  RESOLVER_LABEL: "test",
} as Env;

afterEach(() => {
  vi.unstubAllGlobals();
  resetHealthCache();
});

it("normalizes non-conformant upstream error objects", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json(
        {
          didResolutionMetadata: {
            error: { type: "INTERNAL_ERROR", detail: "private diagnostic" },
          },
          didDocument: null,
          didDocumentMetadata: {},
        },
        { status: 500 },
      ),
    ),
  );
  const result = await fetchUpstream("did:jwk:test", "https://resolver.test");
  expect(result).toMatchObject({
    ok: false,
    failure: {
      error: "internalError",
      metadata: { error: "internalError" },
    },
  });
});

it("canonicalizes upstream problem-details error casing to DIF camelCase", async () => {
  for (const [upstream, expected] of [
    ["METHOD_NOT_SUPPORTED", "methodNotSupported"],
    ["https://w3id.org/security#NOT_FOUND", "notFound"],
    ["INVALID_DID", "invalidDid"],
    ["someVendorSpecificCode", "someVendorSpecificCode"], // unknown → verbatim
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didResolutionMetadata: { error: { type: upstream } },
            didDocument: null,
            didDocumentMetadata: {},
          },
          { status: 500 },
        ),
      ),
    );
    const result = await fetchUpstream("did:jwk:test", "https://resolver.test");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure.error).toBe(expected);
  }
});

it("treats an empty didDocument object as absent so upstream notFound surfaces", async () => {
  // Archon's cid Gatekeeper reports misses as HTTP 200 + `didDocument: {}`.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        didResolutionMetadata: { error: "notFound" },
        didDocument: {},
        didDocumentMetadata: {},
      }),
    ),
  );
  const result = await fetchUpstream(
    "did:cid:missing",
    "https://resolver.test",
  );
  expect(result).toMatchObject({ ok: false, failure: { error: "notFound" } });
});

it("maps an upstream HTTP 429 to a rateLimited transport failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("slow down", { status: 429 })),
  );
  const result = await fetchUpstream("did:jwk:test", "https://resolver.test");
  expect(result).toMatchObject({
    ok: false,
    failure: { error: "rateLimited", status: 429 },
  });
});

describe("resolveDid", () => {
  it("rejects malformed DIDs before routing", async () => {
    expect(
      (await resolveDid("not-a-did", env)).didResolutionMetadata.error,
    ).toBe("invalidDid");
  });

  it("returns unsupportedDidMethod for methods outside the advertised catalog", async () => {
    expect(
      (await resolveDid("did:unknown:123", env)).didResolutionMetadata.error,
    ).toBe("unsupportedDidMethod");
  });

  it("preserves meaningful upstream errors and attempt diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didResolutionMetadata: {
              error: "deactivated",
              upstreamField: "retained",
            },
            didDocument: null,
            didDocumentMetadata: { deactivated: true },
          },
          { status: 410 },
        ),
      ),
    );
    const result = await resolveDid("did:algo:abc", env);
    expect(result.didResolutionMetadata.error).toBe("deactivated");
    expect(result.didResolutionMetadata.attempted).toEqual([
      "goplausible",
      "godiddy",
      "archon",
    ]);
    expect(result.didDocumentMetadata).toEqual({ deactivated: true });
  });

  it("rejects an upstream document for a different DID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didResolutionMetadata: {},
          didDocument: { id: "did:algo:different" },
          didDocumentMetadata: {},
        }),
      ),
    );
    const result = await resolveDid("did:algo:requested", env);
    expect(result.didDocument).toBeNull();
    expect(
      result.didResolutionMetadata.attempts?.every(
        (a) => a.error === "invalidDidDocument",
      ),
    ).toBe(true);
  });

  it("fails over when an upstream returns JSON null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(null)),
    );
    const result = await resolveDid("did:algo:requested", env);
    expect(result.didDocument).toBeNull();
    expect(
      result.didResolutionMetadata.attempts?.every(
        (attempt) => attempt.error === "invalidResponse",
      ),
    ).toBe(true);
  });

  it("routes did:cid through Archon's Gatekeeper endpoint, not its Universal Resolver", async () => {
    const CID_DID =
      "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq";
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        return url.startsWith("https://gatekeeper.test/api/v1/did/")
          ? Response.json({
              didDocument: { id: CID_DID, verificationMethod: [] },
              didDocumentMetadata: { versionSequence: "18" },
              didResolutionMetadata: {},
            })
          : new Response("wrong endpoint", { status: 404 });
      }),
    );
    const result = await resolveDid(CID_DID, env);
    expect(result.didDocument?.id).toBe(CID_DID);
    expect(result.didResolutionMetadata.provider).toBe("archon");
    expect(result.didResolutionMetadata.via).toBe(
      "https://gatekeeper.test/api/v1/did",
    );
    expect(result.didResolutionMetadata.network).toBe("IPFS (Archon)");
    expect(urls[0]).toBe(
      `https://gatekeeper.test/api/v1/did/${encodeURIComponent(CID_DID)}`,
    );
  });

  it("probation-verifies the local cid driver against Archon's Gatekeeper", async () => {
    const CID_DID =
      "did:cid:bagaaieraoqzjgi6537vyu3h3rtetki5g4bk6stzyqplcmwpqgqxp7fewowcq";
    const doc = {
      id: CID_DID,
      verificationMethod: [
        {
          id: "#key-1",
          controller: CID_DID,
          type: "EcdsaSecp256k1VerificationKey2019",
          publicKeyJwk: { kty: "EC", crv: "secp256k1", x: "xVal", y: "yVal" },
        },
      ],
      authentication: ["#key-1"],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://gatekeeper.test/api/v1/did/${encodeURIComponent(CID_DID)}`,
        );
        return Response.json({
          didResolutionMetadata: {},
          didDocument: doc,
          didDocumentMetadata: {},
        });
      }),
    );
    const probationEnv = { ...env, DRIVER_CID: fakeDriver("cid", doc) } as Env;
    const result = await resolveDid(CID_DID, probationEnv);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.route).toBe("local");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "match",
      provider: "archon",
    });
  });

  it("keeps non-cid Archon traffic on the Universal Resolver base", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        urls.push(String(input));
        return new Response("miss", { status: 404 });
      }),
    );
    await resolveDid(
      "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
      env,
    );
    expect(urls[0]).toMatch(/^https:\/\/archon\.test\//);
  });

  it("falls through a rate-limited provider to the next chain step", async () => {
    const doc = { id: "did:algo:abc" };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).startsWith("https://archon.test")
          ? Response.json({
              didResolutionMetadata: {},
              didDocument: doc,
              didDocumentMetadata: {},
            })
          : new Response("slow down", { status: 429 }),
      ),
    );
    const result = await resolveDid("did:algo:abc", env);
    expect(result.didDocument).toEqual(doc);
    expect(result.didResolutionMetadata.provider).toBe("archon");
    expect(result.didResolutionMetadata.attempted).toEqual([
      "goplausible",
      "godiddy",
      "archon",
    ]);
  });

  it("reports rateLimited, not notFound, when every provider is throttled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    const result = await resolveDid("did:algo:abc", env);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("rateLimited");
    expect(
      result.didResolutionMetadata.attempts?.every(
        (attempt) => attempt.error === "rateLimited" && attempt.status === 429,
      ),
    ).toBe(true);
  });

  it("passes an abort signal to every upstream request", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json(null);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await resolveDid("did:algo:requested", env);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects oversized upstream bodies without trusting Content-Length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "did:algo:requested",
              padding: "x".repeat(1024 * 1024),
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const result = await resolveDid("did:algo:requested", env);
    expect(result.didResolutionMetadata.attempts).toHaveLength(3);
    expect(
      result.didResolutionMetadata.attempts?.every(
        (attempt) => attempt.error === "invalidResponse",
      ),
    ).toBe(true);
  });
});

it("moves down providers behind healthy fallbacks without deleting them", () => {
  const health: HealthSnapshot = {
    v: 2,
    updatedTs: Date.now(),
    providers: {
      local: {
        status: "down",
        ewmaMs: null,
        successRate: 0,
        consecutiveFails: 3,
        lastOkTs: null,
        lastProbeTs: Date.now(),
      },
    },
  };
  expect(planChain(["local", "godiddy", "archon"], health)).toEqual([
    "godiddy",
    "archon",
    "local",
  ]);
});

// ── Probation double-check (guarantee mechanism for new drivers) ────────────

function fakeDriver(method: string, doc: Record<string, unknown> | null) {
  return {
    fetch: async () =>
      Response.json({
        protocol: 1,
        result: {
          didResolutionMetadata: doc ? {} : { error: "notFound" },
          didDocument: doc,
          didDocumentMetadata: {},
        },
        driver: {
          method,
          packageName: "test-driver",
          packageVersion: "1.0.0",
          durationMs: 1,
        },
      }),
  };
}

describe("probation verification", () => {
  const DID = "did:webvh:QmTestScid1234:probation.example";
  const doc = (key: string) => ({
    id: DID,
    verificationMethod: [{ id: `${DID}#atproto`, publicKeyMultibase: key }],
  });

  it("badges a core match and serves the edge result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didResolutionMetadata: {},
          didDocument: {
            ...doc("zSameKey"),
            alsoKnownAs: ["at://bsky.app"], // cosmetic difference only
          },
          didDocumentMetadata: {},
        }),
      ),
    );
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zSameKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.route).toBe("local");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "match",
      provider: "godiddy",
    });
  });

  it("serves the upstream conservatively on a core mismatch and logs evidence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didResolutionMetadata: {},
          didDocument: doc("zRotatedKey"),
          didDocumentMetadata: {},
        }),
      ),
    );
    const onMismatch = vi.fn();
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zLocalKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv, { onMismatch });
    expect(result.didResolutionMetadata.provider).toBe("godiddy");
    expect(result.didResolutionMetadata.route).toBe("upstream");
    expect(result.didResolutionMetadata.verification?.status).toBe("mismatch");
    expect(onMismatch).toHaveBeenCalledOnce();
    expect(onMismatch.mock.calls[0][0]).toMatchObject({
      did: DID,
      method: "webvh",
      provider: "godiddy",
      reason: "coreMismatch",
    });
  });

  it("serves the edge result unbadged when the upstream is unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstreamUnavailable",
    });
  });

  it("serves the edge result unbadged when the verifier is rate-limited", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("slow down", { status: 429 })),
    );
    const onMismatch = vi.fn();
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv, { onMismatch });
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstreamRateLimited",
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("treats upstream notFound as unverified, never a mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didDocument: null,
            didResolutionMetadata: { error: "notFound" },
            didDocumentMetadata: {},
          },
          { status: 404 },
        ),
      ),
    );
    const onMismatch = vi.fn();
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv, { onMismatch });
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstream:notFound",
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("verifies did:plc against archon, its only capable verifier", async () => {
    // Godiddy does not speak plc, but Archon does (resolution-verified) — the
    // capability map routes the double-check straight to Archon.
    const did = "did:plc:z72i7hdynmk6r22z27h6tvur";
    const plcDoc = {
      id: did,
      verificationMethod: [
        { id: `${did}#atproto`, publicKeyMultibase: "zPlcKey" },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("archon.test");
        return Response.json({
          didResolutionMetadata: {},
          didDocument: plcDoc,
          didDocumentMetadata: {},
        });
      }),
    );
    const probationEnv = {
      ...env,
      DRIVER_PLC: fakeDriver("plc", plcDoc),
    } as Env;
    const result = await resolveDid(did, probationEnv);
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "match",
      provider: "archon",
    });
  });

  it("skips the double-check when the only capable verifier is down", async () => {
    // did:jwk's only capable verifier is Godiddy (Archon's jwk driver is
    // broken); with Godiddy down, no redundant call is made at all.
    const snapshot: HealthSnapshot = {
      v: 2,
      updatedTs: Date.now(),
      providers: {
        godiddy: {
          status: "down",
          ewmaMs: null,
          successRate: 0,
          consecutiveFails: 5,
          lastOkTs: null,
          lastProbeTs: Date.now(),
        },
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const jwkDid = "did:jwk:dGVzdA";
    const probationEnv = {
      ...env,
      STATS_KV: { get: async () => JSON.stringify(snapshot) },
      DRIVER_JWK: fakeDriver("jwk", {
        id: jwkDid,
        verificationMethod: [{ id: `${jwkDid}#0`, publicKeyMultibase: "zK" }],
      }),
    } as unknown as Env;
    const result = await resolveDid(jwkDid, probationEnv);
    // No wasted call to an incapable or down upstream — served at edge speed.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstreamUnavailable",
    });
  });

  it("exempts NEAR implicit accounts from the double-check", async () => {
    const implicit = `did:near:${"a1".repeat(32)}`;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const probationEnv = {
      ...env,
      DRIVER_NEAR: fakeDriver("near", {
        id: implicit,
        verificationMethod: [
          { id: `${implicit}#owner`, publicKeyBase58: "Key" },
        ],
      }),
    } as Env;
    const result = await resolveDid(implicit, probationEnv);
    expect(fetchMock).not.toHaveBeenCalled(); // no upstream consulted
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didResolutionMetadata.verification).toBeUndefined();
  });

  it("treats verifier method-unsupported as unverifiable, not a mismatch", async () => {
    // Godiddy answers 501 METHOD_NOT_SUPPORTED for did:plc — the verifier has
    // no opinion about the DID, so the edge result must be served unbadged.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didDocument: null,
            didResolutionMetadata: {
              error: {
                type: "METHOD_NOT_SUPPORTED",
                title: "The DID method is not supported.",
              },
            },
            didDocumentMetadata: {},
          },
          { status: 501 },
        ),
      ),
    );
    const onMismatch = vi.fn();
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv, { onMismatch });
    expect(result.didResolutionMetadata.provider).toBe("ThisDID");
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstreamUnsupported",
    });
    expect(onMismatch).not.toHaveBeenCalled();
  });

  it("treats an upstream INTERNAL_ERROR as transport, not a mismatch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didDocument: null,
            didResolutionMetadata: {
              error: { type: "INTERNAL_ERROR", title: "internal" },
            },
            didDocumentMetadata: {},
          },
          { status: 500 },
        ),
      ),
    );
    const probationEnv = {
      ...env,
      DRIVER_WEBVH: fakeDriver("webvh", doc("zKey")),
    } as Env;
    const result = await resolveDid(DID, probationEnv);
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.verification).toEqual({
      status: "unverified",
      provider: "godiddy",
      reason: "upstreamUnavailable",
    });
  });
});
