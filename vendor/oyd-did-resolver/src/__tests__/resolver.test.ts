import { afterEach, describe, expect, it, vi } from "vitest";
import { Resolver } from "did-resolver";
import { dereferenceFragment, getResolver } from "../resolver.js";
import {
  canonical,
  multiEncode,
  multiHash,
  verify,
  LOG_HASH_OPTIONS,
  type LogEntry,
  type Tuple,
} from "../basic.js";
import { Op } from "../log.js";
import { decodeEd25519PublicKey } from "../basic.js";
import { mintPubkeyForm, mintSingleVersion } from "./builder.js";
import {
  CANARY_DID,
  CANARY_DOC,
  CANARY_HASH,
  CANARY_LOG,
  REFERENCE_DOCUMENT,
  REFERENCE_METADATA,
  canaryFetch,
} from "./fixture.js";
import {
  LOCATION_DID,
  REFERENCE_LOCATION_DOCUMENT,
  REFERENCE_UPDATED_NEW,
  REFERENCE_UPDATED_OLD,
  REVOKED_DID,
  UPDATED_LOG,
  UPDATED_NEW_RECORD,
  UPDATED_NEW_HASH,
  UPDATED_OLD_DID,
  UPDATED_NEW_DID,
  samplesFetch,
} from "./samples.js";

afterEach(() => vi.unstubAllGlobals());

const resolver = () => new Resolver(getResolver());

/** Unwrap a reference-style `[value, message]` tuple or fail the test. */
function must<T>([value, message]: Tuple<T>): T {
  if (value === null) throw new Error(message || "tuple carried no value");
  return value;
}

describe("verification primitives against the reference deployment's data", () => {
  it("recomputes the identifier as the multihash of the document record", async () => {
    const computed = must(
      await multiHash(canonical(CANARY_DOC), {
        digest: "sha2-256",
        encode: "base58btc",
      }),
    );
    expect(computed).toBe(CANARY_HASH);
  });

  it("recomputes the document's log reference as the TERMINATE entry hash", async () => {
    const terminate = CANARY_LOG[1];
    const computed = must(
      await multiHash(canonical(terminate), LOG_HASH_OPTIONS),
    );
    expect(computed).toBe(CANARY_DOC.log);
  });

  it("verifies the CREATE entry's Ed25519 signature with the document key", async () => {
    const create = CANARY_LOG[0];
    const [ok] = await verify(
      create.doc,
      create.sig,
      CANARY_DOC.key.split(":")[0],
    );
    expect(ok).toBe(true);
  });
});

describe("did:oyd resolution", () => {
  it("resolves the canary to the reference resolver's exact document", async () => {
    vi.stubGlobal("fetch", vi.fn(canaryFetch));
    const result = await resolver().resolve(CANARY_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.didDocument))).toEqual(
      REFERENCE_DOCUMENT,
    );
  });

  it("composes the reference resolver's didDocumentMetadata", async () => {
    vi.stubGlobal("fetch", vi.fn(canaryFetch));
    const result = await resolver().resolve(CANARY_DID);
    expect(JSON.parse(JSON.stringify(result.didDocumentMetadata))).toEqual(
      REFERENCE_METADATA,
    );
  });

  it("rejects a tampered version document (hash commitment on /doc_raw)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/doc_raw/" + CANARY_HASH)) {
          return Response.json({
            doc: { ...CANARY_DOC, doc: { simple: "tampered" } },
            log: CANARY_LOG,
          });
        }
        return canaryFetch(input);
      }),
    );
    const result = await resolver().resolve(CANARY_DID);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("don't match");
  });

  it("rejects a log that does not contain the requested identifier (binding)", async () => {
    // the repository serves ANOTHER DID's (valid, verifiable) data for the
    // requested identifier — every hop verifies, but the chain never
    // contains the requested version
    const foreign = "zQmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === "/doc/" + foreign) {
          return Response.json(UPDATED_NEW_RECORD);
        }
        if (url.pathname === "/log/" + foreign) {
          return Response.json(UPDATED_LOG);
        }
        return samplesFetch()(input);
      }),
    );
    const result = await resolver().resolve("did:oyd:" + foreign);
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("don't match");
  });

  it("rejects a malformed document record with a diagnostic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ doc: {}, log: "z" })), // key missing
    );
    const result = await resolver().resolve(CANARY_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain(
      "malformed document record",
    );
  });

  it("rejects a malformed log with a diagnostic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/log/")) {
          return Response.json([{ ts: "not-a-number" }]);
        }
        return canaryFetch(input);
      }),
    );
    const result = await resolver().resolve(CANARY_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("malformed log");
  });

  it("reports an oversized response as a transport failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x", {
            headers: { "content-length": String(10 * 1024 * 1024) },
          }),
      ),
    );
    const result = await resolver().resolve(CANARY_DID);
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain(
      "response too large",
    );
  });

  it("maps a repository miss to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "not found" }, { status: 404 })),
    );
    const result = await resolver().resolve(
      "did:oyd:zQmaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("reports unsupported digests as representationNotSupported", async () => {
    // blake2b-16 identifier prefix (0x02 0x10) — recognized, not ported;
    // the walk reaches the version-hash commitment check, which needs the
    // identifier's own digest
    const fakeId = must(
      multiEncode(
        new Uint8Array([0x02, 0x10, ...new Array<number>(16).fill(7)]),
        {
          encode: "base58btc",
        },
      ),
    );
    const record = { doc: {}, key: CANARY_DOC.key, log: "zQmT8SG" };
    const log = [
      { ts: 1, op: Op.CREATE, doc: fakeId, sig: null, previous: [] },
      { ts: 1, op: Op.TERMINATE, doc: "zQmT8SG", sig: "z1", previous: [] },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/doc_raw/")) {
          return Response.json({ doc: record, log });
        }
        if (url.includes("/log/")) return Response.json(log);
        return Response.json(record);
      }),
    );
    const result = await resolver().resolve("did:oyd:" + fakeId);
    expect(result.didResolutionMetadata.error).toBe(
      "representationNotSupported",
    );
    expect(result.didResolutionMetadata.message).toContain(
      "unsupported digest",
    );
  });
});

describe("spec samples (ownyourdata.github.io/oydid#samples)", () => {
  it("resolves the updated DID through its ORIGINAL identifier", async () => {
    vi.stubGlobal("fetch", vi.fn(samplesFetch()));
    const result = await resolver().resolve(UPDATED_OLD_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.didDocument))).toEqual(
      REFERENCE_UPDATED_OLD.didDocument,
    );
    expect(JSON.parse(JSON.stringify(result.didDocumentMetadata))).toEqual(
      REFERENCE_UPDATED_OLD.didDocumentMetadata,
    );
  });

  it("resolves the updated DID through its UPDATED identifier", async () => {
    vi.stubGlobal("fetch", vi.fn(samplesFetch()));
    const result = await resolver().resolve(UPDATED_NEW_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.didDocument))).toEqual(
      REFERENCE_UPDATED_NEW.didDocument,
    );
    expect(JSON.parse(JSON.stringify(result.didDocumentMetadata))).toEqual(
      REFERENCE_UPDATED_NEW.didDocumentMetadata,
    );
  });

  it("reports the revoked sample as deactivated (repository answers 410)", async () => {
    vi.stubGlobal("fetch", vi.fn(samplesFetch("gone")));
    const result = await resolver().resolve(REVOKED_DID);
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("detects the revocation independently from the full log", async () => {
    vi.stubGlobal("fetch", vi.fn(samplesFetch("served")));
    const result = await resolver().resolve(REVOKED_DID);
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("resolves the non-default-location sample from its own repository", async () => {
    vi.stubGlobal("fetch", vi.fn(samplesFetch()));
    const result = await resolver().resolve(LOCATION_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(JSON.parse(JSON.stringify(result.didDocument))).toEqual(
      REFERENCE_LOCATION_DOCUMENT,
    );
    expect(result.didDocumentMetadata.registry).toBe(
      "https://did2.data-container.net",
    );
  });
});

/** Synthesize a minimal revoked DID with real keys and signatures,
 *  following the reference write path's structure (CREATE + TERMINATE
 *  published, REVOKE published, no UPDATE building on it — spec §3.4). */
async function mintRevokedDid(payload: Record<string, unknown>): Promise<{
  didHash: string;
  fetchStub: (input: RequestInfo | URL) => Promise<Response>;
}> {
  const generate = async (): Promise<CryptoKeyPair> =>
    (await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ])) as CryptoKeyPair;
  const docPair = await generate();
  const revPair = await generate();
  const packKey = async (pair: CryptoKeyPair): Promise<string> => {
    const raw = new Uint8Array(
      await crypto.subtle.exportKey("raw", pair.publicKey),
    );
    return must(multiEncode(new Uint8Array([0xed, 0x20, ...raw]), {}));
  };
  const sign = async (
    pair: CryptoKeyPair,
    message: string,
  ): Promise<string> => {
    const sig = new Uint8Array(
      await crypto.subtle.sign(
        "Ed25519",
        pair.privateKey,
        new TextEncoder().encode(message),
      ),
    );
    return must(multiEncode(sig, {}));
  };
  const hashOf = async (value: unknown): Promise<string> =>
    must(await multiHash(canonical(value), LOG_HASH_OPTIONS));

  const ts = 1700000000;
  const docKey = await packKey(docPair);
  const revKey = await packKey(revPair);

  // revocation record (hashed without `previous` for the TERMINATE ref)
  const revocationBase = {
    ts,
    op: Op.REVOKE,
    doc: "revocation",
    sig: await sign(revPair, "revocation"),
  };
  const terminate: LogEntry = {
    ts,
    op: Op.TERMINATE,
    doc: await hashOf(revocationBase),
    sig: "",
    previous: [],
  };
  // the document record commits to the TERMINATE entry, whose signature
  // is made with the document key
  const docRecord = { doc: payload, key: docKey + ":" + revKey, log: "" };
  terminate.sig = await sign(docPair, terminate.doc);
  docRecord.log = await hashOf(terminate);
  const didHash = await hashOf(docRecord);

  const create: LogEntry = {
    ts,
    op: Op.CREATE,
    doc: didHash,
    sig: await sign(docPair, didHash),
    previous: [],
  };
  const revoke: LogEntry = {
    ...revocationBase,
    previous: [await hashOf(create), await hashOf(terminate)],
  };
  const log = [create, terminate, revoke];

  const fetchStub = async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/doc/" + didHash)) return Response.json(docRecord);
    if (url.includes("/doc_raw/" + didHash)) {
      return Response.json({ doc: docRecord, log });
    }
    // /log is fetched by the doc's log-hash (initial read) and the did-hash
    // (revocation search); this single-DID stub serves its log for either.
    if (url.includes("/log/")) return Response.json(log);
    return Response.json({ error: "not found" }, { status: 404 });
  };
  return { didHash, fetchStub };
}

describe("revocation and DID Rotation", () => {
  it("reports a revoked DID as deactivated", async () => {
    const { didHash, fetchStub } = await mintRevokedDid({
      synthetic: "revoked",
    });
    vi.stubGlobal("fetch", vi.fn(fetchStub));
    const result = await resolver().resolve("did:oyd:" + didHash);
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
    expect(result.didResolutionMetadata.error).toBeUndefined();
  });

  it("does not follow rotation by default (driver behavior)", async () => {
    const { didHash, fetchStub } = await mintRevokedDid({
      alsoKnownAs: "did:cheqd:rotated123",
    });
    vi.stubGlobal("fetch", vi.fn(fetchStub));
    const result = await resolver().resolve("did:oyd:" + didHash);
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("follows rotation through the host's own drivers when opted in", async () => {
    const { didHash, fetchStub } = await mintRevokedDid({
      alsoKnownAs: "did:cheqd:rotated123",
    });
    vi.stubGlobal("fetch", vi.fn(fetchStub));
    const rotatedDocument = {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: "did:cheqd:rotated123",
      verificationMethod: [],
    };
    const standalone = new Resolver({
      ...getResolver({ followAlsoKnownAs: true }),
      cheqd: async () => ({
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: rotatedDocument,
        didDocumentMetadata: {},
      }),
    });
    const result = await standalone.resolve("did:oyd:" + didHash);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBeUndefined();
    expect(result.didDocument?.id).toBe("did:cheqd:rotated123");
  });
});

describe("fragment dereferencing helper", () => {
  it("extracts the verification method the fragment names", () => {
    const dereferenced = dereferenceFragment(
      REFERENCE_DOCUMENT as unknown as Record<string, unknown>,
      "key-doc",
    );
    expect(dereferenced).toEqual({
      "@context": REFERENCE_DOCUMENT["@context"],
      id: CANARY_DID + "#key-doc",
      type: "Ed25519VerificationKey2020",
      controller: CANARY_DID,
      publicKeyMultibase: "z6MusYB5iT5krCHYsZ76EzBaTdRwGKsaBhMcSbrXaPJgkuRQ",
    });
  });

  it("returns null for an unknown fragment", () => {
    expect(
      dereferenceFragment(
        REFERENCE_DOCUMENT as unknown as Record<string, unknown>,
        "nope",
      ),
    ).toBeNull();
  });
});

describe("pubkey-form identifiers (spec §3.2.4 binding)", () => {
  const rawHex = (key: string): string | null => {
    const raw = decodeEd25519PublicKey(key);
    return raw === null
      ? null
      : [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  it("resolves a pubkey-form DID whose key IS a document key (binds)", async () => {
    const m = await mintPubkeyForm({ hello: "world" });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBeUndefined();
    expect(r.didDocument?.id).toBe(m.did);
    // the identifier's key is present among the composed verification methods
    const idHex = rawHex(m.docKey);
    const vmHexes = (r.didDocument?.verificationMethod ?? []).map((vm) =>
      rawHex(String(vm.publicKeyMultibase)),
    );
    expect(vmHexes).toContain(idHex);
  });

  it("rejects a pubkey-form DID whose key is NOT a document key (the z6MkrJVn shape)", async () => {
    // A well-formed pubkey-form identifier the same repository serves, but
    // whose key is in no version of the DID — resolvable only by trusting the
    // repository. This is the offline analog of did:oyd:z6MkrJVn… (OYD-DID-CORPUS.md
    // §"Excluded"): the reference resolves it permissively; we fail closed.
    const m = await mintPubkeyForm({ hello: "world" });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.unboundDid);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("don't match");
  });

  it("rejects a pubkey-form DID addressed by its REVOCATION key (spec binds the document key only)", async () => {
    // The revocation key is a real key of the DID but NOT an identifier form
    // (spec §3.2.4 #pubkey_identifier is defined on the document key). It must
    // not bind, even though it is one of the record's two keys.
    const m = await mintPubkeyForm({ hello: "world" });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.revDid);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("don't match");
  });
});

describe("identity invariant & timestamp robustness", () => {
  it("rejects a did:oyd whose payload spoofs a FOREIGN document id", async () => {
    // a committed payload shaped like a W3C DID document (w3c's already-a-DID
    // passthrough) would otherwise set the output id to a foreign identifier
    const m = await mintSingleVersion({
      "@context": "https://www.w3.org/ns/did/v1",
      id: "did:evil:xyz",
      verificationMethod: [
        { id: "did:evil:xyz#k", type: "X", controller: "did:evil:xyz" },
      ],
    });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("does not match");
  });

  it("rejects a payload that overwrites id via the service-merge branch", async () => {
    const m = await mintSingleVersion({
      id: "did:oyd:zSomeOtherDidEntirely1111111111111111111111111",
      service: [{ id: "#s", type: "T", serviceEndpoint: "https://x" }],
    });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("does not match");
  });

  it("rejects a BARE method-specific id (not a DID URI) smuggled via the service merge", async () => {
    // pubkey-form: the creator knows the identifier in advance, so the
    // payload can embed the bare key as `id` — the exact-match invariant
    // must require the full percent-encoded DID URI, not a stripped equal
    const m = await mintPubkeyForm((_did: string, docKey: string) => ({
      id: docKey,
      service: [{ id: "#s", type: "T", serviceEndpoint: "https://x" }],
    }));
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("does not match");
  });

  it("rejects a payload that keeps the CORRECT id but replaces verificationMethod", async () => {
    // the id passes the exact-match invariant, so this isolates the
    // authority invariant: the verified doc/rev keys must survive in the
    // composed verification methods
    const m = await mintPubkeyForm((did: string) => ({
      "@context": "https://www.w3.org/ns/did/v1",
      id: did,
      verificationMethod: [
        {
          id: did + "#evil",
          type: "Ed25519VerificationKey2020",
          controller: did,
          publicKeyMultibase: "z6MkrJVnaZkeFzdQyMZu1cgjg7k1pZZ6pvBQ7XJPt4sw",
        },
      ],
    }));
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("verified keys");
  });

  it("rejects INERT methods that retain the key bytes under foreign ids/controllers/types", async () => {
    // the raw doc/rev key bytes ARE present, but only in methods with a
    // foreign id, foreign controller and unknown type — the authoritative
    // `#key-doc`/`#key-rev` methods are gone, and `authentication` points at
    // the foreign entry. Byte membership alone would pass this; the semantic
    // authority invariant must not.
    const m = await mintPubkeyForm(
      (did: string, docKey: string, revKey: string) => ({
        "@context": "https://www.w3.org/ns/did/v1",
        id: did,
        verificationMethod: [
          {
            id: "did:evil:x#untrusted",
            type: "UnknownType",
            controller: "did:evil:x",
            publicKeyMultibase: docKey,
          },
          {
            id: "did:evil:x#untrusted2",
            type: "UnknownType",
            controller: "did:evil:x",
            publicKeyMultibase: revKey,
          },
        ],
        authentication: ["did:evil:x#untrusted"],
      }),
    );
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("verified keys");
  });

  it("rejects a null verificationMethod entry with a controlled error (no thrown promise)", async () => {
    // property access on a null entry would otherwise THROW outside
    // read()'s guard, rejecting the resolve promise instead of returning a
    // DID error
    const m = await mintPubkeyForm((did: string) => ({
      "@context": "https://www.w3.org/ns/did/v1",
      id: did,
      verificationMethod: [null],
    }));
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("verified keys");
  });

  it("rejects a DUPLICATED authoritative method id (valid first, foreign second)", async () => {
    // both required methods are present and VALID — but #key-doc appears
    // twice, the second carrying a different key. Relying parties disagree
    // on which entry wins, so the document is ambiguous and must not serve.
    const m = await mintPubkeyForm(
      (did: string, docKey: string, revKey: string) => ({
        "@context": "https://www.w3.org/ns/did/v1",
        id: did,
        verificationMethod: [
          {
            id: did + "#key-doc",
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: docKey,
          },
          {
            id: did + "#key-rev",
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: revKey,
          },
          {
            id: did + "#key-doc", // duplicate id, different key
            type: "Ed25519VerificationKey2020",
            controller: did,
            publicKeyMultibase: revKey,
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("verified keys");
  });

  it("still resolves a service payload that leaves the verified keys intact", async () => {
    // control: the ordinary service-merge path composes #key-doc/#key-rev
    // itself, so a normal payload passes both invariants
    const m = await mintSingleVersion({
      service: [{ id: "#s", type: "T", serviceEndpoint: "https://x" }],
    });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBeUndefined();
    const ids = (r.didDocument?.verificationMethod ?? []).map((v) => v.id);
    expect(ids).toEqual([m.did + "#key-doc", m.did + "#key-rev"]);
  });

  it("rejects a same-key id carrying a DIFFERENT location suffix", async () => {
    const m = await mintPubkeyForm((did: string) => ({
      "@context": "https://www.w3.org/ns/did/v1",
      id: did + "%40evil.example",
      service: [{ id: "#s", type: "T", serviceEndpoint: "https://x" }],
    }));
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(r.didResolutionMetadata.message).toContain("does not match");
  });

  it("does not crash on an out-of-Date-range timestamp (omits created)", async () => {
    // 1e15 s → 1e18 ms, beyond the Date range: toISOString() would throw a
    // RangeError outside read()'s guard, rejecting the resolve promise
    const m = await mintSingleVersion({ hello: "world" }, undefined, {
      ts: 1e15,
    });
    vi.stubGlobal("fetch", vi.fn(m.fetch));
    const r = await resolver().resolve(m.did);
    expect(r.didResolutionMetadata.error).toBeUndefined();
    expect(r.didDocument?.id).toBe(m.did);
    expect(r.didDocumentMetadata.created).toBeUndefined();
  });
});
