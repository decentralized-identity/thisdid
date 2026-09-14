import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

afterEach(() => vi.unstubAllGlobals());

describe("did:plc DIF wrapper", () => {
  it("resolves a document from the configured directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://plc.test/${encodeURIComponent(DID)}`,
        );
        return Response.json({
          "@context": [
            "https://www.w3.org/ns/did/v1",
            "https://w3id.org/security/multikey/v1",
          ],
          id: DID,
          verificationMethod: [
            {
              id: `${DID}#atproto`,
              type: "Multikey",
              controller: DID,
              publicKeyMultibase:
                "zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF",
            },
          ],
          service: [
            {
              id: "#atproto_pds",
              type: "AtprotoPersonalDataServer",
              serviceEndpoint: "https://pds.test",
            },
          ],
        });
      }),
    );
    const result = await getResolver({ directoryUrl: "https://plc.test" }).plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
  });

  it("maps a directory 404 to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const result = await getResolver().plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("notFound");
    expect(result.didDocument).toBeNull();
  });

  it("treats a directory redirect as a failure (workerd-safe)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 301,
            headers: { location: "https://elsewhere.test" },
          }),
      ),
    );
    const result = await getResolver().plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didDocument).toBeNull();
  });
});

// ThisDID: identifier and document validation the upstream package's resolver
// path does not perform (its own strict validator is never called there, and
// its document schema is marked deprecated by its authors).
describe("did:plc validation (ThisDID)", () => {
  const VALID = {
    "@context": ["https://www.w3.org/ns/did/v1"],
    id: DID,
    alsoKnownAs: ["at://alice.test"],
    verificationMethod: [
      {
        id: `${DID}#atproto`,
        type: "Multikey",
        controller: DID,
        publicKeyMultibase: "zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF",
      },
    ],
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: "https://pds.test",
      },
    ],
  };
  const serve = (document: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(document)),
    );
  const resolve = (did = DID) =>
    getResolver({ directoryUrl: "https://plc.test" }).plc(
      did,
      null as never,
      null as never,
      {},
    );

  it("refuses a malformed identifier without contacting the directory", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:plc:tooshort",
      "did:plc:z72i7hdynmk6r22z27h6tvurxx",
      "did:plc:Z72I7HDYNMK6R22Z27H6TVUR",
      "did:plc:z72i7hdynmk6r22z27h6tvu1",
      "did:plc:",
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error, did).toBe("invalidDid");
      expect(result.didDocument, did).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a well-formed document", async () => {
    serve(VALID);
    const result = await resolve();
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(DID);
  });

  it("refuses malformed documents from the directory", async () => {
    const cases: unknown[] = [
      { ...VALID, verificationMethod: "a string" },
      {
        ...VALID,
        verificationMethod: [
          { id: "atproto", type: "Multikey", controller: DID },
        ],
      },
      {
        ...VALID,
        verificationMethod: [
          { ...VALID.verificationMethod[0], controller: "not-a-did" },
        ],
      },
      {
        ...VALID,
        verificationMethod: [
          {
            ...VALID.verificationMethod[0],
            publicKeyMultibase: "not multibase",
          },
        ],
      },
      { ...VALID, alsoKnownAs: ["alice.test"] },
      {
        ...VALID,
        service: [
          { id: "pds", type: "X", serviceEndpoint: "https://pds.test" },
        ],
      },
      {
        ...VALID,
        service: [
          {
            id: "did:plc:z72i7hdynmk6r22z27h6tvur#pds",
            type: "X",
            serviceEndpoint: 42,
          },
        ],
      },
      { ...VALID, authentication: [`${DID}#missing`] },
      { ...VALID, id: "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa" },
    ];
    for (const document of cases) {
      serve(document);
      const result = await resolve();
      expect(
        result.didResolutionMetadata.error,
        JSON.stringify(document).slice(0, 80),
      ).toBe("invalidDidDocument");
      expect(result.didDocument).toBeNull();
    }
  });
});

// ThisDID: verification material, JSON-LD context and representation.
describe("did:plc material, context and representation (ThisDID)", () => {
  const K256 = "zQ3shXjHeiBuRCKmM36cuYnm7YEMzhGnCmCyW92sRJ9pribSF"; // secp256k1
  const P256 = "zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169"; // p256
  const ED = "z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V"; // ed25519: not a did:plc key type
  const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const multibase = (bytes: number[]) => {
    const digits = [0];
    for (const byte of bytes) {
      let carry = byte;
      for (let i = 0; i < digits.length; i += 1) {
        carry += digits[i] << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    return (
      "z" +
      digits
        .reverse()
        .map((d) => BASE58[d])
        .join("")
    );
  };
  const doc = (
    vm: Record<string, unknown>,
    extra: Record<string, unknown> = {},
  ) => ({
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/multikey/v1",
    ],
    id: DID,
    verificationMethod: [
      { id: `${DID}#atproto`, type: "Multikey", controller: DID, ...vm },
    ],
    service: [
      {
        id: "#atproto_pds",
        type: "AtprotoPersonalDataServer",
        serviceEndpoint: "https://pds.test",
      },
    ],
    ...extra,
  });
  const serve = (document: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(document)),
    );
  const resolve = (options: Record<string, unknown> = {}) =>
    getResolver({ directoryUrl: "https://plc.test" }).plc(
      DID,
      null as never,
      null as never,
      options,
    );
  const rejects = async (document: unknown, fragment: string) => {
    serve(document);
    const result = await resolve();
    expect(result.didResolutionMetadata.error, fragment).toBe(
      "invalidDidDocument",
    );
    expect(result.didResolutionMetadata.message, fragment).toContain(fragment);
  };

  it("accepts the key types the directory publishes", async () => {
    for (const key of [K256, P256]) {
      serve(doc({ publicKeyMultibase: key }));
      expect(
        (await resolve()).didResolutionMetadata.error,
        key,
      ).toBeUndefined();
    }
  });

  it("decodes the Multikey: codec, length and curve point", async () => {
    await rejects(doc({}), "has no verification material");
    await rejects(
      doc({ publicKeyMultibase: K256, publicKeyJwk: { kty: "EC" } }),
      "more than one verification material",
    );
    await rejects(
      doc({ publicKeyJwk: { kty: "EC" } }),
      "must carry publicKeyMultibase",
    );
    await rejects(
      doc({ publicKeyMultibase: "zabc" }),
      "is not a key type did:plc publishes",
    );
    await rejects(
      doc({ publicKeyMultibase: ED }),
      "multicodec 0xed is not a key type did:plc publishes",
    );
    await rejects(
      doc({ publicKeyMultibase: "not multibase" }),
      "must be base58btc multibase",
    );
    await rejects(
      doc({
        publicKeyMultibase: multibase([0xe7, 0x01, ...new Array(31).fill(2)]),
      }),
      "secp256k1 needs 33 key bytes, got 31",
    );
    // 33 bytes with a valid prefix but no point on the curve
    await rejects(
      doc({
        publicKeyMultibase: multibase([
          0xe7,
          0x01,
          0x02,
          ...new Array(32).fill(0xff),
        ]),
      }),
      "is not a valid secp256k1 public key",
    );
  });

  it("resolves references in any property order and validates embedded methods (DID Core §5.3, R9.3)", async () => {
    const embedded = {
      id: `${DID}#signing`,
      type: "Multikey",
      controller: DID,
      publicKeyMultibase: P256,
    };
    // authentication references a method embedded later, under assertionMethod
    serve(
      doc(
        { publicKeyMultibase: K256 },
        { authentication: [`${DID}#signing`], assertionMethod: [embedded] },
      ),
    );
    expect((await resolve()).didResolutionMetadata.error).toBeUndefined();
    await rejects(
      doc({ publicKeyMultibase: K256 }, { authentication: [`${DID}#missing`] }),
      "references undefined verification method",
    );
    // a service id is not a verification method
    await rejects(
      doc(
        { publicKeyMultibase: K256 },
        { authentication: [`${DID}#atproto_pds`] },
      ),
      "references undefined verification method",
    );
    // an embedded method is validated like any other
    await rejects(
      doc(
        { publicKeyMultibase: K256 },
        {
          assertionMethod: [
            {
              id: `${DID}#weak`,
              type: "Multikey",
              controller: DID,
              publicKeyMultibase: ED,
            },
          ],
        },
      ),
      "not a key type did:plc publishes",
    );
  });

  it("requires a terminated, minimal multicodec varint (R8.2)", async () => {
    const { secp256k1 } = await import("@noble/curves/secp256k1");
    const key = Array.from(
      secp256k1.getPublicKey(secp256k1.utils.randomPrivateKey(), true),
    );
    serve(doc({ publicKeyMultibase: multibase([0xe7, 0x01, ...key]) }));
    expect((await resolve()).didResolutionMetadata.error).toBeUndefined();
    await rejects(
      doc({
        publicKeyMultibase: multibase([0xe7, 0x81, 0x80, 0x80, 0x80, ...key]),
      }),
      "varint does not terminate",
    );
    await rejects(
      doc({ publicKeyMultibase: multibase([0xe7, 0x81, 0x00, ...key]) }),
      "varint is not minimal",
    );
  });

  it("requires a JSON-LD context starting with the DID Core context", async () => {
    await rejects(
      doc({ publicKeyMultibase: K256 }, { "@context": [] }),
      "@context must be",
    );
    serve(
      doc(
        { publicKeyMultibase: K256 },
        { "@context": [42, { unexpected: true }] },
      ),
    );
    expect((await resolve()).didResolutionMetadata.error).toBe(
      "invalidDidDocument",
    ); // the upstream schema refuses this one first
    await rejects(
      doc(
        { publicKeyMultibase: K256 },
        { "@context": ["https://w3id.org/security/multikey/v1"] },
      ),
      "@context[0] must be",
    );
    const { "@context": _context, ...missing } = doc({
      publicKeyMultibase: K256,
    });
    await rejects(missing, "@context is required");
  });

  it("negotiates the representation", async () => {
    serve(doc({ publicKeyMultibase: K256 }));
    const plain = await resolve({ accept: "application/did+json" });
    expect(plain.didResolutionMetadata.contentType).toBe(
      "application/did+json",
    );
    expect(plain.didDocument?.["@context"]).toBeUndefined();
    const linked = await resolve({ accept: "application/did+ld+json" });
    expect(linked.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
    const other = await resolve({ accept: "text/plain" });
    expect(other.didDocument).toBeNull();
    expect(other.didResolutionMetadata.error).toBe(
      "representationNotSupported",
    );
  });
});
