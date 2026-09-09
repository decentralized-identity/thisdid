import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DestinationGuardError,
  getResolver,
  webCryptoEd25519Verifier,
} from "../resolver.js";

// The suites below stub the global fetch, so they declare that fetch as the
// destination boundary; the default on Node would bind the connect-time guard
// and never touch the stub.
const caller = { destinationGuard: "caller" as const };

/**
 * Real did:webvh fixtures captured from the DIF Universal Resolver test
 * catalog identifier (opsecid.github.io): a 5-version DID log with witness
 * proofs. Resolution over these fixtures runs the complete verifiable-history
 * validation — SCID, update proofs, witness proofs — fully offline.
 */
const FIXTURE_DID =
  "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:opsecid.github.io";
const FIXTURE_LOG = readFileSync(
  new URL("./opsecid.did.jsonl", import.meta.url),
  "utf8",
);
const FIXTURE_WITNESS = readFileSync(
  new URL("./opsecid.did-witness.json", import.meta.url),
  "utf8",
);

const resolve = (did: string, options = {}) =>
  getResolver(caller).webvh(did, null as never, null as never, options);

afterEach(() => vi.unstubAllGlobals());

describe("did:webvh DIF wrapper — positive path", () => {
  it("resolves and cryptographically verifies a real DID log offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("did.jsonl")) {
          return new Response(FIXTURE_LOG, { status: 200 });
        }
        if (String(url).endsWith("did-witness.json")) {
          return new Response(FIXTURE_WITNESS, { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const result = await resolve(FIXTURE_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
    expect(result.didDocument?.id).toBe(FIXTURE_DID);
    expect(result.didDocumentMetadata.versionId).toBe(
      "5-Qma6tvFnKAqHke9HcgSJCrxUGCh7HRdf7SwnGJMnM6Qnq6",
    );
    expect(result.didDocumentMetadata.created).toBe("2026-07-02T18:12:44Z");
    expect(result.didDocumentMetadata.updated).toBe("2026-07-02T18:12:49Z");
  });

  it("rejects the same log when proof verification fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith("did.jsonl")) {
          return new Response(FIXTURE_LOG, { status: 200 });
        }
        if (String(url).endsWith("did-witness.json")) {
          return new Response(FIXTURE_WITNESS, { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const refuseAll = { verify: async () => false };
    const result = await getResolver({ ...caller, verifier: refuseAll }).webvh(
      FIXTURE_DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
  });
});

describe("did:webvh DIF wrapper — error classification", () => {
  const DID = "did:webvh:QmUnreachableScid1234:example.com";

  it("classifies a missing DID log as notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("classifies transport failures as networkError, not invalidDid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("classifies a non-404 HTTP failure as networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("classifies unparseable log content as notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not json at all", { status: 200 })),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("classifies a malformed identifier as invalidDid", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve("did:webvh:nonsense");
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
  });

  it("accepts an injected custom verifier", async () => {
    const verifier = { verify: vi.fn(async () => true) };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const result = await getResolver({ ...caller, verifier }).webvh(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didDocument).toBeNull();
  });

  it("ships a WebCrypto Ed25519 verifier that rejects garbage input", async () => {
    const ok = await webCryptoEd25519Verifier.verify(
      new Uint8Array(64),
      new Uint8Array([1, 2, 3]),
      new Uint8Array(32),
    );
    expect(ok).toBe(false);
  });
});

describe("did:webvh fetch boundaries (ThisDID fork)", () => {
  it("refuses a loopback destination before any fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve(
      "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:localhost%3A8443",
    );
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didResolutionMetadata.message).toContain(
      "blocked by fetch policy",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("times out and reports a transport-class error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const result = await getResolver({
      ...caller,
      fetchPolicy: { timeoutMs: 20 },
    }).webvh(FIXTURE_DID, null as never, null as never, {});
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("timed out");
  });

  it("bounds the DID log size", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(FIXTURE_LOG, { status: 200 })),
    );
    const result = await getResolver({
      ...caller,
      fetchPolicy: { maxResponseBytes: 512 },
    }).webvh(FIXTURE_DID, null as never, null as never, {});
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("exceeds 512 bytes");
  });

  it("keeps fetch policies per resolver, not per process", async () => {
    const globalFetch = vi.fn(
      async () => new Response("not found", { status: 404 }),
    );
    vi.stubGlobal("fetch", globalFetch);
    const ownFetch = vi.fn(
      async () => new Response("not found", { status: 404 }),
    );
    const did =
      "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:localhost%3A8443";
    const strict = getResolver(caller);
    const permissive = getResolver({
      ...caller,
      fetchPolicy: { allowPrivateHosts: true, fetch: ownFetch as typeof fetch },
    });
    const call = (registry: ReturnType<typeof getResolver>) =>
      registry.webvh(did, null as never, null as never, {});

    // Interleaved: a later getResolver() must not change an earlier one.
    const first = await call(strict);
    const second = await call(permissive);
    const third = await call(strict);
    expect(first.didResolutionMetadata.error).toBe("invalidDid");
    expect(third.didResolutionMetadata.error).toBe("invalidDid");
    expect(second.didResolutionMetadata.error).toBe("notFound");
    expect(ownFetch).toHaveBeenCalledTimes(1);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("reports the connect-time reason a guarded fetch refuses with", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new TypeError("fetch failed");
        (error as { cause?: unknown }).cause = new Error(
          "blocked by fetch policy: opsecid.github.io resolves to non-global address 127.0.0.1",
        );
        throw error;
      }),
    );
    const result = await resolve(FIXTURE_DID);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
    expect(result.didResolutionMetadata.message).toContain(
      "resolves to non-global address 127.0.0.1",
    );
  });

  it("binds the connect-time guard by default on Node, not the global fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await getResolver().webvh(
      "did:webvh:Qmb3KLhAKJ9wZx1gTPzcPfCxviRkiEJ4RGdHNviaedGu3i:nonexistent.invalid",
      null as never,
      null as never,
      {},
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain(
      "nonexistent.invalid",
    );
  });

  it("refuses a custom fetch that does not declare its boundary", () => {
    expect(() =>
      getResolver({
        fetchPolicy: { fetch: vi.fn() as unknown as typeof fetch },
      }),
    ).toThrow(DestinationGuardError);
  });

  it("follows an https redirect and re-validates the target", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        calls += 1;
        const u = String(url);
        if (u.endsWith("did.jsonl") && calls === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: "https://127.0.0.1/did.jsonl" },
          });
        }
        return new Response("not found", { status: 404 });
      }),
    );
    const result = await resolve(FIXTURE_DID);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.message).toContain(
      "not a globally routable unicast",
    );
  });
});
