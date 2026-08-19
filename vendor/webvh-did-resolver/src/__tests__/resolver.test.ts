import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver, webCryptoEd25519Verifier } from "../resolver.js";

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
  getResolver().webvh(did, null as never, null as never, options);

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
    const result = await getResolver({ verifier: refuseAll }).webvh(
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
    const result = await getResolver({ verifier }).webvh(
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
