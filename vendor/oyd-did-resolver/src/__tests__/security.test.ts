import { afterEach, describe, expect, it, vi } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";
import { checkRepositoryUrl, MAX_LOG_ENTRIES } from "../security.js";
import {
  canonical,
  decodeEd25519PublicKey,
  multiDecode,
  multiEncode,
  multiHash,
  verify,
  DidError,
  LOG_HASH_OPTIONS,
} from "../basic.js";
import { read } from "../read.js";
import {
  keypair,
  mintForeignTerminate,
  mintRevoked,
  mintSingleVersion,
  mintSplicedUpdate,
  mintUpdateChain,
  sign,
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

  it("junk op=3 appended to the log cannot deny service (D4 ruling)", async () => {
    // the log endpoint is unauthenticated: anyone can append an unsigned
    // UPDATE referencing the revocation. It must be IGNORED — not picked
    // (first-match) and not an error (naive more-than-one ⇒ error) — so the
    // genuine chain still resolves to v2.
    const chain = await mintUpdateChain({ updateSigner: "v1doc" });
    const junked = async (input: RequestInfo | URL) => {
      const response = await chain.fetch(input);
      if (new URL(String(input)).pathname.startsWith("/log/")) {
        const log = (await response.json()) as Array<Record<string, unknown>>;
        const revoke = log.find((entry) => entry.op === 1);
        const revocationHash =
          (await multiHash(canonical(revoke), LOG_HASH_OPTIONS))[0] ?? "";
        return Response.json([
          ...log,
          {
            ts: 1700000777,
            op: 3,
            doc: "zJunkAppendedByAnyone",
            sig: "zNotARealSignature",
            previous: [revocationHash],
          },
        ]);
      }
      return response;
    };
    vi.stubGlobal("fetch", vi.fn(junked));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.canonicalId).toBe(chain.didV2);
  });

  it("rejects TWO valid UPDATE successors as ambiguous (D4 ruling)", async () => {
    const chain = await mintUpdateChain({
      updateSigner: "v1doc",
      duplicateSuccessor: true,
    });
    vi.stubGlobal("fetch", vi.fn(chain.fetch));
    const result = await resolver().resolve(chain.didV1);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("ambiguous");
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

  it("blocks IPv4-mapped IPv6 loopback/private literals", () => {
    for (const url of [
      "https://[::ffff:127.0.0.1]/doc/x",
      "https://[::ffff:7f00:1]/doc/x",
      "https://[::ffff:192.168.0.1]/doc/x",
      "https://[::ffff:10.0.0.1]/doc/x",
    ]) {
      expect(checkRepositoryUrl(url)).not.toBeNull();
    }
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

  it("accepts both Ed25519 key framings: 0xed 0x20 (multihash) and 0xed 0x01 (varint)", async () => {
    // The reference gem emits Ed25519 keys under BOTH framings across its
    // history — multihash-style code+length (0xed 0x20) and varint
    // multicodec (0xed 0x01) — and decodes on byte[0]=code, last 32 = key,
    // ignoring the middle byte. This is the offline guard for that relaxation
    // (real.test.ts zQmSE1h/zQmfEb3K is the live one): the same real key and
    // signature must decode and verify under either framing.
    const pair = await keypair();
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    const message = "framing-parity";
    const sig = await sign(pair, message);
    const multihashFramed = multiEncode(
      new Uint8Array([0xed, 0x20, ...raw]),
      {},
    )[0] as string;
    const varintFramed = multiEncode(
      new Uint8Array([0xed, 0x01, ...raw]),
      {},
    )[0] as string;

    // both framings decode to the identical 32 raw key bytes …
    expect(decodeEd25519PublicKey(multihashFramed)).toEqual(raw);
    expect(decodeEd25519PublicKey(varintFramed)).toEqual(raw);
    // … and both verify the same signature over the same message
    expect((await verify(message, sig, multihashFramed))[0]).toBe(true);
    expect((await verify(message, sig, varintFramed))[0]).toBe(true);
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

  it("honors a deployment-lowered maxLogEntries (configurable bound, distinct error)", async () => {
    const entries = Array.from({ length: 4 }, (_, i) => ({
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
    const limited = new Resolver(getResolver({ maxLogEntries: 3 }));
    const result = await limited.resolve(
      "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
    );
    // a service limit, distinct from a malformed document
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain("exceed");
  });

  it("propagates a lowered maxPreviousRefs (rejects excess back-references)", async () => {
    const entries = [
      { ts: 1, op: 2, doc: "za", sig: null, previous: [] as string[] },
      { ts: 1, op: 0, doc: "zb", sig: null, previous: ["z1", "z2"] },
    ];
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
    const limited = new Resolver(getResolver({ maxPreviousRefs: 1 }));
    const result = await limited.resolve(
      "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
    );
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain("back-references");
  });

  it.each([NaN, Infinity, -1, 1.5])(
    "ignores an invalid maxLogEntries (%s) and keeps the default bound — never disables it",
    async (bad) => {
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
      const limited = new Resolver(getResolver({ maxLogEntries: bad }));
      const result = await limited.resolve(
        "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh",
      );
      // the bad override is ignored → default MAX_LOG_ENTRIES still enforced
      expect(result.didResolutionMetadata.error).toBe("internalError");
      expect(result.didResolutionMetadata.message).toContain("exceed");
    },
  );
});

describe("revocation-key authorization (strictRevocationSig, DEFAULT ON per D2/D3)", () => {
  const parityResolver = () =>
    new Resolver(getResolver({ strictRevocationSig: false }));

  it("DEFAULT rejects a revocation not signed by the revocation key (D2 ruling)", async () => {
    const did = await mintRevoked({ ok: true }, { badRevSig: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain(
      "revocation signature",
    );
  });

  it("DEFAULT rejects a rev-key-signed REVOKE whose doc does NOT commit to the revoked version (D3 ruling)", async () => {
    // valid revocation-key signature, but `doc` is the hash of OTHER content
    // — spec §4.1 requires REVOKE.doc = hash of the revoked version's
    // {doc, key} (preimage confirmed by the method author; all 1,117
    // production revocations pass it)
    const did = await mintRevoked({ ok: true }, { wrongRevDoc: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("commit");
  });

  it("DEFAULT still honors a revocation correctly signed by the revocation key", async () => {
    const did = await mintRevoked({ ok: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("opt-out (strictRevocationSig: false) restores legacy parity for a bad-rev-sig revocation", async () => {
    const did = await mintRevoked({ ok: true }, { badRevSig: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await parityResolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("opt-out restores legacy parity for a wrong-doc REVOKE", async () => {
    const did = await mintRevoked({ ok: true }, { wrongRevDoc: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const result = await parityResolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("the default is UNIVERSAL: a direct low-level read(did, {}) call still verifies", async () => {
    // the exported low-level API must not silently bypass the mandatory
    // D2/D3 checks — omitting the option means ON; only an explicit
    // `strict_revocation_sig: false` opts out
    const did = await mintRevoked({ ok: true }, { badRevSig: true });
    vi.stubGlobal("fetch", vi.fn(did.fetch));
    const [info] = await read(did.did, {});
    expect(info).not.toBeNull();
    expect(info?.error).toBe(DidError.INVALID);
    expect(info?.message).toContain("revocation signature");
    const [legacy] = await read(did.did, { strict_revocation_sig: false });
    expect(legacy?.error).not.toBe(DidError.INVALID);
  });

  it("a repository cannot forge a revocation by tampering the published REVOKE sig", async () => {
    // mutate the served REVOKE sig WITHOUT recomputing the TERMINATE
    // commitment: the hash no longer matches, so the revocation is ignored and
    // the DID stays live — the commitment stops post-creation substitution
    // regardless of the strict flag.
    const did = await mintRevoked({ ok: true });
    const tampered = async (input: RequestInfo | URL) => {
      const response = await did.fetch(input);
      if (String(input).includes("/log/")) {
        const log = (await response.json()) as Array<Record<string, unknown>>;
        return Response.json(
          log.map((entry) =>
            entry.op === 1 ? { ...entry, sig: "z1tampered" } : entry,
          ),
        );
      }
      return response;
    };
    vi.stubGlobal("fetch", vi.fn(tampered));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBeUndefined();
    expect(result.didDocument).not.toBeNull();
  });
});

describe("multibase input bound (base58 DoS guard)", () => {
  it("rejects an over-long multibase value before decoding", () => {
    // a valid short value still decodes …
    expect(
      multiDecode(multiEncode(new Uint8Array([1, 2, 3]), {})[0] as string)[0],
    ).not.toBeNull();
    // … but a ~1 KB value is refused without running the O(n²) decode
    expect(multiDecode("z" + "1".repeat(1024))[0]).toBeNull();
    expect(multiDecode("z" + "1".repeat(1024))[1]).toContain("too long");
  });
});

describe("I-JSON boundary validation (canonicalization inputs, RFC 8785)", () => {
  const CANARY = "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh";
  const jsonStub = (rawBody: string) =>
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/doc")) {
        return new Response(rawBody, {
          headers: { "content-type": "application/json" },
        });
      }
      return Response.json({ error: "not found" }, { status: 404 });
    });

  it("rejects a repository response containing a non-finite number", async () => {
    // 1e999 parses to Infinity — RFC 8785 cannot canonicalize it, so it must
    // never be hashed as a lossy `null`
    vi.stubGlobal("fetch", jsonStub('{"doc":{"n":1e999},"key":"z","log":"z"}'));
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("non-finite");
  });

  it("rejects a repository response containing a lone Unicode surrogate", async () => {
    vi.stubGlobal("fetch", jsonStub('{"doc":"\\ud800","key":"z","log":"z"}'));
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("surrogate");
  });

  it("rejects duplicate object member names (JSON.parse silently keeps the last)", async () => {
    // I-JSON forbids duplicates; a conformant JCS verifier rejects this
    // input, so hashing the collapsed object would diverge from it
    vi.stubGlobal(
      "fetch",
      jsonStub('{"doc":"first","doc":"second","key":"z","log":"z"}'),
    );
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("duplicate");
  });

  it("detects duplicates hidden behind escape sequences and in nested objects", async () => {
    // "doc" unescapes to "doc" — the scanner must compare decoded
    // names, and must scope member sets per object (nested duplicate)
    vi.stubGlobal(
      "fetch",
      jsonStub('{"doc":{"a":1,"\\u0061":2},"key":"z","log":"z"}'),
    );
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("duplicate");
  });

  it("does NOT flag the same member name in sibling objects", async () => {
    // per-object scoping: {"a":…} inside two different objects is legal
    vi.stubGlobal(
      "fetch",
      jsonStub('{"doc":[{"a":1},{"a":2}],"key":"z","log":"z"}'),
    );
    const result = await resolver().resolve(CANARY);
    // passes the boundary; fails later for unrelated reasons (not a real DID)
    expect(result.didResolutionMetadata.message ?? "").not.toContain(
      "duplicate",
    );
  });
});

describe("repository deactivation assertion is bound to HTTP 410 (finding 1)", () => {
  const docStub = (status: number, body: unknown) =>
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/doc")) return Response.json(body, { status });
      return Response.json({ error: "not found" }, { status: 404 });
    });
  const CANARY = "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh";

  it("confirms a repository 410 'revoked' assertion from the records (D10 ruling)", async () => {
    // the 410 is a HINT: /doc answers 410, but /doc_raw and /log still serve
    // the revoked DID's records — the driver walks them and reports
    // deactivated only on cryptographic confirmation
    const did = await mintRevoked({ ok: true });
    const gated = async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname;
      if (path.startsWith("/doc/")) {
        return Response.json({ error: "revoked" }, { status: 410 });
      }
      return did.fetch(input);
    };
    vi.stubGlobal("fetch", vi.fn(gated));
    const result = await resolver().resolve(did.did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("does NOT deactivate on a bare 410 hint when the records are unavailable (fail closed)", async () => {
    vi.stubGlobal("fetch", docStub(410, { error: "revoked" }));
    const result = await resolver().resolve(CANARY);
    expect(result.didDocumentMetadata.deactivated).toBeUndefined();
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain("revocation");
  });

  it("does NOT deactivate on a 'revoked' body carried by a non-410 status", async () => {
    vi.stubGlobal("fetch", docStub(500, { error: "revoked" }));
    const result = await resolver().resolve(CANARY);
    expect(result.didDocumentMetadata.deactivated).toBeUndefined();
    expect(result.didResolutionMetadata.error).toBe("internalError");
  });

  it("repository error text cannot steer the DIF error code (500 stays internalError)", async () => {
    // "don't match" is an INVALID_MARKERS substring; a hostile repository
    // echoing it in an error body must not turn a transport failure into
    // invalidDidDocument — classification is status-driven
    vi.stubGlobal("fetch", docStub(500, { error: "don't match" }));
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain(
      "repository error 500",
    );
  });

  it("repository error text cannot steer a 404 away from notFound", async () => {
    vi.stubGlobal("fetch", docStub(404, { error: "unsupported digest: x" }));
    const result = await resolver().resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });
});
