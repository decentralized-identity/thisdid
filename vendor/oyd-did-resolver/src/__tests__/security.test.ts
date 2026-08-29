import { afterEach, describe, expect, it, vi } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";
import { checkRepositoryUrl, MAX_LOG_ENTRIES } from "../security.js";
import { verify, decodeEd25519PublicKey, multiEncode } from "../basic.js";
import {
  mintForeignTerminate,
  mintRevoked,
  mintSingleVersion,
  mintSplicedUpdate,
  mintUpdateChain,
} from "./builder.js";

afterEach(() => vi.unstubAllGlobals());

const resolver = () => new Resolver(getResolver());

/** A host resolver with a stub driver for the rotation target method. */
function hostResolver(
  cheqd: (did: string) => Promise<{
    didResolutionMetadata: Record<string, unknown>;
    didDocument: Record<string, unknown> | null;
    didDocumentMetadata: Record<string, unknown>;
  }>,
) {
  return new Resolver({
    ...getResolver({ followAlsoKnownAs: true }),
    cheqd: async (did: string) => cheqd(did),
  });
}

describe("update lifecycle authorization (finding 1)", () => {
  it("resolves a correctly authorized update chain (sanity: not vacuous)", async () => {
    const chain = await mintUpdateChain({ updateSigner: "v1doc" });
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const service = result.didDocument?.service?.[0] as unknown as {
      payload?: unknown;
    };
    expect(service?.payload).toEqual({ content: "updated" });
    expect(result.didDocumentMetadata.canonicalId).toBe(chain.didV2);
  });

  it("rejects an UPDATE spliced directly onto CREATE (no authorization)", async () => {
    const chain = await mintSplicedUpdate();
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("unauthorized");
  });

  it("rejects an UPDATE signed by a key that never held authority", async () => {
    const chain = await mintUpdateChain({ updateSigner: "v2doc" });
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });
});

describe("delegate injection (findings 1/2)", () => {
  it("does not honor a disconnected DELEGATE key for update authorization", async () => {
    const chain = await mintUpdateChain({
      updateSigner: "delegate",
      includeDelegate: true,
      delegateConnected: false,
    });
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    // the update is signed only by the injected, DAG-disconnected delegate,
    // so no authorized key verifies it
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("does not honor a CONNECTED DELEGATE key either (delegation not authenticated)", async () => {
    // the delegate is DAG-connected (referenced by the terminal record) and
    // carries an irrelevant signature; its key still must not authorize the
    // update, because delegation is not honored at all
    const chain = await mintUpdateChain({
      updateSigner: "delegate",
      includeDelegate: true,
      delegateConnected: true,
    });
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });
});

describe("dangling back-references (finding: topology completeness)", () => {
  it("rejects a log whose previous references a nonexistent entry", async () => {
    const chain = await mintUpdateChain({ updateSigner: "v1doc" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const res = await chain.fetch(input);
        if (new URL(String(input)).pathname.startsWith("/log/")) {
          const log = (await res.clone().json()) as Array<{
            op: number;
            previous?: string[];
          }>;
          const update = log.find((e) => e.op === 3);
          if (update) {
            update.previous = [
              ...(update.previous ?? []),
              "zBogusNonexistentReferenceHash000000000000000",
            ];
          }
          return Response.json(log);
        }
        return res;
      }),
    );
    const result = await resolver().resolve(chain.didV1);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("dangling");
  });
});

describe("revocation lookup fails closed (finding 3)", () => {
  it("returns internalError when the revocation lookup fails (HTTP 500)", async () => {
    // first /log (in read) succeeds; the second (revocation branch) 500s
    const did = await mintSingleVersion({ ok: true }, (call) =>
      call >= 1 ? new Response("boom", { status: 500 }) : null,
    );
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("internalError");
  });

  it("returns internalError when the revocation lookup is malformed", async () => {
    const did = await mintSingleVersion({ ok: true }, (call) =>
      call >= 1 ? Response.json({ not: "an array" }) : null,
    );
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("internalError");
  });
});

describe("topology validation (finding 4)", () => {
  it("rejects a foreign / disconnected TERMINATE", async () => {
    const did = await mintForeignTerminate();
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });
});

describe("rotation target validation (findings 5/10)", () => {
  it("rejects a rotation target whose document id differs from alsoKnownAs", async () => {
    const revoked = await mintRevoked({ alsoKnownAs: "did:cheqd:rotated123" });
    vi.stubGlobal("fetch", vi.fn(revoked.fetch));
    const host = hostResolver(async () => ({
      didResolutionMetadata: { contentType: "application/did+ld+json" },
      didDocument: { id: "did:cheqd:WRONG", "@context": [] },
      didDocumentMetadata: {},
    }));
    const result = await host.resolve(revoked.did);
    // rotation refused → the DID stays deactivated, never the wrong document
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("rejects a rotation target that resolves with an error", async () => {
    const revoked = await mintRevoked({ alsoKnownAs: "did:cheqd:rotated123" });
    vi.stubGlobal("fetch", vi.fn(revoked.fetch));
    const host = hostResolver(async () => ({
      didResolutionMetadata: { error: "notFound" },
      didDocument: null,
      didDocumentMetadata: {},
    }));
    const result = await host.resolve(revoked.did);
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("follows a rotation target whose id matches (control)", async () => {
    const revoked = await mintRevoked({ alsoKnownAs: "did:cheqd:rotated123" });
    vi.stubGlobal("fetch", vi.fn(revoked.fetch));
    const host = hostResolver(async () => ({
      didResolutionMetadata: { contentType: "application/did+ld+json" },
      didDocument: { id: "did:cheqd:rotated123", "@context": [] },
      didDocumentMetadata: {},
    }));
    const result = await host.resolve(revoked.did);
    expect(result.didDocument?.id).toBe("did:cheqd:rotated123");
    expect(result.didDocumentMetadata.deactivated).toBeUndefined();
  });
});

describe("repository fetch policy / SSRF (finding 6)", () => {
  it("blocks private, loopback and metadata hosts by default", () => {
    for (const url of [
      "https://127.0.0.1/doc/x",
      "https://10.0.0.5/doc/x",
      "https://192.168.1.1/doc/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/doc/x",
      "http://[::1]/doc/x",
    ]) {
      expect(checkRepositoryUrl(url)).not.toBeNull();
    }
  });

  it("blocks non-https schemes and embedded credentials by default", () => {
    expect(
      checkRepositoryUrl("http://oydid.ownyourdata.eu/doc/x"),
    ).not.toBeNull();
    expect(
      checkRepositoryUrl("https://user:pw@oydid.ownyourdata.eu/doc/x"),
    ).not.toBeNull();
    expect(checkRepositoryUrl("file:///etc/passwd")).not.toBeNull();
  });

  it("permits an ordinary public https repository", () => {
    expect(checkRepositoryUrl("https://oydid.ownyourdata.eu/doc/x")).toBeNull();
  });

  it("rejects resolution against a private custom %40 repository", async () => {
    const result = await resolver().resolve(
      "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh%40127.0.0.1",
    );
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain("repository");
  });
});

describe("strict key framing (findings 7/8)", () => {
  it("rejects a 34-byte 0xed key whose length byte is wrong", async () => {
    // 0xed code, WRONG length byte 0x21, then 32 bytes
    const bad = multiEncode(
      new Uint8Array([0xed, 0x21, ...new Array<number>(32).fill(1)]),
      {},
    )[0] as string;
    expect(decodeEd25519PublicKey(bad)).toBeNull();
    expect((await verify("m", "zSig", bad))[0]).toBeNull();
  });

  it("rejects a document whose revocation key is malformed", async () => {
    // valid doc key and valid commitment, but the rev key half is not a
    // well-formed Ed25519 key — never a silent empty publicKeyHex
    const did = await mintSingleVersion({ ok: true }, undefined, {
      badRevKey: true,
    });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("revocation key");
  });
});

describe("resource bounds (finding 5)", () => {
  it("rejects a log longer than the maximum", async () => {
    const entries = Array.from({ length: MAX_LOG_ENTRIES + 1 }, (_, i) => ({
      ts: 1,
      op: 2,
      doc: "z" + i,
      sig: null,
      previous: [] as string[],
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/log/")) return Response.json(entries);
        if (url.includes("/doc")) {
          return Response.json({ doc: {}, key: "z", log: "z" });
        }
        return Response.json({ error: "not found" }, { status: 404 });
      }),
    );
    const result = await resolver().resolve(
      "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
    );
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain("exceed");
  });
});
