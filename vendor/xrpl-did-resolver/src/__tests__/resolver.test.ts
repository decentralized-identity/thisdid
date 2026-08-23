import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";
import {
  DEVNET_DID,
  DEVNET_RESPONSE,
  MAINNET_DID,
  MAINNET_REFERENCE_DOCUMENT,
  MAINNET_RESPONSE,
  NOTFOUND_ADDRESS,
  NOTFOUND_PUBKEY,
  NOTFOUND_RESPONSE,
  TESTNET_DID,
  TESTNET_RESPONSE,
} from "./fixture.js";

const resolve = (did: string, opts = {}) =>
  getResolver(opts).xrpl(did, null as never, null as never, {});

/** Stub fetch to answer one ledger_entry call, asserting endpoint + account. */
const stubRpc = (
  response: unknown,
  expectBase: string,
  expectAccount: string,
) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(expectBase);
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: [{ did: string; ledger_index: string }];
      };
      expect(body.method).toBe("ledger_entry");
      expect(body.params[0].did).toBe(expectAccount);
      expect(body.params[0].ledger_index).toBe("validated");
      return Response.json(response);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe("did:xrpl resolution (live ledger captures)", () => {
  it("composes the mainnet reference document from the raw ledger entry", async () => {
    stubRpc(
      MAINNET_RESPONSE,
      "https://xrplcluster.com",
      "r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
    );
    const result = await resolve(MAINNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(MAINNET_REFERENCE_DOCUMENT);
    expect(result.didDocumentMetadata).toEqual({
      network: "mainnet",
      deactivated: false,
      objectId:
        "146461286F33D5ACFA64E8C29CF76921A251016B98E8E01BFE183B75668887E8",
      previousTxnId:
        "37AB12A3A0F7857BDD6CB9680B065FFAF52A5BEED4BCBFD5DA73606459E27439",
      previousTxnLgrSeq: 94030601,
      ledgerIndex: 106486103,
      uri: "ipfs://bafkreigum5rzlojb7eiagbiimmj3mhbuiidwivik2b2wdnrczzkr5iuyjy",
      attestationData:
        "ipfs://bafkreiarlwt7kk7fwzkdsqkkfxst2pva22gyp5yeokda5tkezr3hzgt7xm",
    });
  });

  it("serves an authored on-ledger DIDDocument blob, normalizing its id", async () => {
    stubRpc(
      TESTNET_RESPONSE,
      "https://s.altnet.rippletest.net:51234",
      "rHsr6TjYRgXfVH69AZgKhfCVG3cQUFz3on",
    );
    const result = await resolve(TESTNET_DID);
    expect(result.didDocument).toEqual({
      "@context": "https://www.w3.org/ns/did/v1",
      id: TESTNET_DID,
      alsoKnownAs: ["did:example:123"],
      service: [
        {
          id: `${TESTNET_DID}#uri`,
          type: "LinkedResource",
          serviceEndpoint: "https://xrplcluster.com",
        },
      ],
    });
    expect(result.didDocumentMetadata.attestationData).toBe(
      "did:example:123#key-1",
    );
  });

  it("falls back to the implicit base document on non-UTF-8 blobs, keeping the hex", async () => {
    stubRpc(
      DEVNET_RESPONSE,
      "https://s.devnet.rippletest.net:51234",
      "rfhcRtTbDSyVwCNALUsVMdfabSJMQXyUbm",
    );
    const result = await resolve(DEVNET_DID);
    expect(result.didDocument).toEqual({
      "@context": "https://www.w3.org/ns/did/v1",
      id: DEVNET_DID,
    });
    expect(result.didDocumentMetadata).toMatchObject({
      network: "devnet",
      didDocumentBlobHex: "A1B1",
      uriHex: "A1B1",
      attestationDataHex: "A1B1",
    });
  });

  it("rejects an authored blob that fails DID-document structural validation", async () => {
    const forged = structuredClone(TESTNET_RESPONSE);
    forged.result.node.DIDDocument = Buffer.from(
      JSON.stringify({
        "@context": "https://www.w3.org/ns/did/v1",
        id: "did:example:123",
        verificationMethod: "not-an-array",
      }),
    )
      .toString("hex")
      .toUpperCase();
    stubRpc(
      forged,
      "https://s.altnet.rippletest.net:51234",
      "rHsr6TjYRgXfVH69AZgKhfCVG3cQUFz3on",
    );
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    // Falls back to the implicit base document; the raw blob and the reason
    // stay in metadata instead of normalizing a malformed document.
    expect(result.didDocument).toEqual({
      "@context": "https://www.w3.org/ns/did/v1",
      id: TESTNET_DID,
      service: [
        {
          id: `${TESTNET_DID}#uri`,
          type: "LinkedResource",
          serviceEndpoint: "https://xrplcluster.com",
        },
      ],
    });
    expect(result.didDocumentMetadata.didDocumentBlobError).toBe(
      "invalidDidDocument",
    );
    expect(result.didDocumentMetadata.didDocumentBlobHex).toBeDefined();
  });

  describe("authored-document usability validation", () => {
    const authoredResponse = (docObject: Record<string, unknown>) => {
      const forged = structuredClone(TESTNET_RESPONSE);
      forged.result.node.DIDDocument = Buffer.from(JSON.stringify(docObject))
        .toString("hex")
        .toUpperCase();
      return forged;
    };
    const resolveAuthored = async (docObject: Record<string, unknown>) => {
      stubRpc(
        authoredResponse(docObject),
        "https://s.altnet.rippletest.net:51234",
        "rHsr6TjYRgXfVH69AZgKhfCVG3cQUFz3on",
      );
      return resolve(TESTNET_DID);
    };
    const expectRejected = (result: Awaited<ReturnType<typeof resolve>>) => {
      expect(result.didDocument?.verificationMethod).toBeUndefined();
      expect(result.didDocumentMetadata.didDocumentBlobError).toBe(
        "invalidDidDocument",
      );
    };

    it("rejects a verification method without key material", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [
            { id: "#keyless", type: "Multikey", controller: TESTNET_DID },
          ],
        }),
      );
    });

    it("rejects a verification method with more than one key material", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [
            {
              id: "#twokeys",
              type: "Multikey",
              publicKeyMultibase:
                "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
              publicKeyBase58:
                "6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
            },
          ],
        }),
      );
    });

    it("rejects dangling relationship references", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [
            {
              id: "#k1",
              type: "Multikey",
              publicKeyMultibase:
                "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
            },
          ],
          authentication: ["#nope"],
        }),
      );
    });

    it("rejects verification-method and service ids under a foreign DID", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [
            {
              id: "did:example:123#key-1",
              type: "Multikey",
              publicKeyMultibase:
                "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
            },
          ],
        }),
      );
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          service: [
            {
              id: "did:example:123#hub",
              type: "DIDCommMessaging",
              serviceEndpoint: "https://hub.example",
            },
          ],
        }),
      );
    });

    it("rejects scalar service endpoints", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          service: [{ id: "#svc", type: "LinkedDomains", serviceEndpoint: 42 }],
        }),
      );
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          service: [
            { id: "#svc", type: "LinkedDomains", serviceEndpoint: true },
          ],
        }),
      );
    });

    it("rejects placeholder or malformed key-material encodings", async () => {
      const method = (material: Record<string, unknown>) => ({
        id: TESTNET_DID,
        verificationMethod: [{ id: "#k", type: "Multikey", ...material }],
      });
      // Too short to be a real key, wrong alphabet, or missing JWK members.
      expectRejected(
        await resolveAuthored(method({ publicKeyMultibase: "zKey" })),
      );
      expectRejected(
        await resolveAuthored(method({ publicKeyBase58: "0OIl-invalid" })),
      );
      expectRejected(
        await resolveAuthored(method({ publicKeyHex: "deadbeef" })),
      );
      expectRejected(await resolveAuthored(method({ publicKeyJwk: {} })));
      expectRejected(
        await resolveAuthored(method({ blockchainAccountId: "not-caip-10" })),
      );
    });

    it("rejects JWKs missing the members their key type requires", async () => {
      const method = (publicKeyJwk: Record<string, unknown>) => ({
        id: TESTNET_DID,
        verificationMethod: [
          { id: "#k", type: "JsonWebKey2020", publicKeyJwk },
        ],
      });
      // Cross-type members: an RSA key has no `x`.
      expectRejected(await resolveAuthored(method({ kty: "RSA", x: "abc" })));
      // Empty required values.
      expectRejected(
        await resolveAuthored(method({ kty: "OKP", crv: "Ed25519", x: "" })),
      );
      expectRejected(
        await resolveAuthored(method({ kty: "RSA", n: "abc", e: "" })),
      );
      // EC without `y`.
      expectRejected(
        await resolveAuthored(method({ kty: "EC", crv: "P-256", x: "abc" })),
      );
      // Unsupported key type (symmetric keys are not verification material).
      expectRejected(
        await resolveAuthored(method({ kty: "oct", k: "secret" })),
      );
    });

    it("rejects JWKs carrying private key members", async () => {
      const method = (publicKeyJwk: Record<string, unknown>) => ({
        id: TESTNET_DID,
        verificationMethod: [
          { id: "#k", type: "JsonWebKey2020", publicKeyJwk },
        ],
      });
      // A leaked private key must never be served back out of the ledger.
      expectRejected(
        await resolveAuthored(
          method({ kty: "OKP", crv: "Ed25519", x: "abc", d: "PRIVATE" }),
        ),
      );
      expectRejected(
        await resolveAuthored(
          method({ kty: "EC", crv: "P-256", x: "abc", y: "def", d: "PRIVATE" }),
        ),
      );
      expectRejected(
        await resolveAuthored(
          method({ kty: "RSA", n: "abc", e: "AQAB", d: "PRIVATE" }),
        ),
      );
      expectRejected(
        await resolveAuthored(
          method({ kty: "RSA", n: "abc", e: "AQAB", p: "P", q: "Q" }),
        ),
      );
      expectRejected(
        await resolveAuthored(
          method({ kty: "RSA", n: "abc", e: "AQAB", oth: [] }),
        ),
      );
    });

    it("accepts a verification method carrying a complete public JWK", async () => {
      const result = await resolveAuthored({
        id: TESTNET_DID,
        verificationMethod: [
          {
            id: "#jwk",
            type: "JsonWebKey2020",
            publicKeyJwk: {
              kty: "EC",
              crv: "P-256",
              x: "acbIQiuMs3i8_uszEjJ2tpTtRM4EU3yz91PH6CdH2V0",
              y: "_KcyLj9vWMptnmKtm46GqDz8wf74I5LKgrl2GzH3nSE",
            },
          },
        ],
        authentication: ["#jwk"],
      });
      expect(result.didDocumentMetadata.didDocumentBlobError).toBeUndefined();
      expect(result.didDocument?.verificationMethod?.[0].id).toBe("#jwk");
    });

    it("rejects conflicting duplicate fragments across methods and services", async () => {
      const key = {
        type: "Multikey",
        publicKeyMultibase: "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
      };
      // Two verification methods claiming the same id.
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [
            { id: "#k1", ...key },
            { id: `${TESTNET_DID}#k1`, ...key },
          ],
        }),
      );
      // A service colliding with a verification-method id.
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          verificationMethod: [{ id: "#k1", ...key }],
          service: [
            {
              id: "#k1",
              type: "LinkedDomains",
              serviceEndpoint: "https://example.com",
            },
          ],
        }),
      );
    });

    it("rejects an authored service claiming the reserved #uri fragment", async () => {
      expectRejected(
        await resolveAuthored({
          id: TESTNET_DID,
          service: [
            {
              id: "#uri",
              type: "LinkedDomains",
              serviceEndpoint: "https://example.com",
            },
          ],
        }),
      );
    });

    it("accepts a fully usable authored document verbatim", async () => {
      const result = await resolveAuthored({
        "@context": "https://www.w3.org/ns/did/v1",
        id: TESTNET_DID,
        verificationMethod: [
          {
            id: "#master",
            type: "Multikey",
            controller: TESTNET_DID,
            publicKeyMultibase:
              "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
          },
        ],
        authentication: ["#master"],
        service: [
          {
            id: `${TESTNET_DID}#hub`,
            type: "DIDCommMessaging",
            serviceEndpoint: ["https://hub.example", { uri: "wss://alt" }],
          },
        ],
      });
      expect(result.didResolutionMetadata.error).toBeUndefined();
      expect(result.didDocumentMetadata.didDocumentBlobError).toBeUndefined();
      expect(
        result.didDocument?.verificationMethod?.[0].publicKeyMultibase,
      ).toBe("z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ");
      expect(result.didDocument?.authentication).toEqual(["#master"]);
      // Authored services are preserved; the ledger URI service is appended.
      expect(result.didDocument?.service?.map((s) => s.id)).toEqual([
        `${TESTNET_DID}#hub`,
        `${TESTNET_DID}#uri`,
      ]);
    });
  });

  it("serves the implicit minimal document when no DID entry exists (address form)", async () => {
    stubRpc(NOTFOUND_RESPONSE, "https://xrplcluster.com", NOTFOUND_ADDRESS);
    const result = await resolve(`did:xrpl:0:${NOTFOUND_ADDRESS}`);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual({
      "@context": "https://www.w3.org/ns/did/v1",
      id: `did:xrpl:0:${NOTFOUND_ADDRESS}`,
    });
    expect(result.didDocumentMetadata).toEqual({
      network: "mainnet",
      implicit: true,
      deactivated: false,
    });
  });

  it("derives the account from a public-key DID and serves the implicit master key", async () => {
    // The spec's own pubkey/address pair: the RPC call must use the address.
    stubRpc(NOTFOUND_RESPONSE, "https://xrplcluster.com", NOTFOUND_ADDRESS);
    const did = `did:xrpl:0:${NOTFOUND_PUBKEY}`;
    const result = await resolve(did);
    expect(result.didDocument).toEqual({
      "@context": [
        "https://www.w3.org/ns/did/v1",
        "https://w3id.org/security/multikey/v1",
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#master-key`,
          type: "Multikey",
          controller: did,
          publicKeyMultibase:
            "zQ3shhw1sF7LSWptzVSnLchhGwoRArb1MuvY5qP2yWeeJosuq",
        },
      ],
      authentication: [`${did}#master-key`],
      assertionMethod: [`${did}#master-key`],
      capabilityInvocation: [`${did}#master-key`],
    });
    expect(result.didDocumentMetadata.equivalentId).toEqual([
      `did:xrpl:0:${NOTFOUND_ADDRESS}`,
    ]);
  });

  it("handles ed25519 master keys (ED prefix), lowercase hex included", async () => {
    stubRpc(
      NOTFOUND_RESPONSE,
      "https://xrplcluster.com",
      "rJB8dmrf4JxkLKHPUfdxyPwpXMyxjkQsyG",
    );
    const pubkey = "ed" + "11".repeat(32);
    const result = await resolve(`did:xrpl:0:${pubkey}`);
    const vm = result.didDocument?.verificationMethod?.[0];
    expect(vm?.publicKeyMultibase).toBe(
      "z6Mkfbt52NAcPcYKV36L6eWTnyfxyGrGrxvJBxF5pjjCctGQ",
    );
    expect(result.didDocumentMetadata.equivalentId).toEqual([
      "did:xrpl:0:rJB8dmrf4JxkLKHPUfdxyPwpXMyxjkQsyG",
    ]);
  });
});

describe("did:xrpl validation", () => {
  it("rejects malformed DIDs and bad checksums as invalidDid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("must not reach the network");
      }),
    );
    for (const did of [
      "did:xrpl:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE", // missing network-id
      "did:xrpl:main:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE", // non-numeric
      "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtF", // corrupted checksum
      "did:xrpl:0:0430E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020", // bad key prefix
      "did:xrpl:0:0330E7FC", // truncated key
      "did:xrpl:0:notanaddress",
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error, did).toBe("invalidDid");
    }
  });

  it("reports notConfigured for a network-id with no endpoint", async () => {
    const result = await resolve(
      "did:xrpl:21337:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
    );
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
  });

  it("honors rpcUrls overrides for custom networks", async () => {
    stubRpc(NOTFOUND_RESPONSE, "https://sidechain.example", NOTFOUND_ADDRESS);
    const result = await resolve(`did:xrpl:21337:${NOTFOUND_ADDRESS}`, {
      rpcUrls: { "21337": "https://sidechain.example/" },
    });
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.network).toBe("network-21337");
  });
});

describe("did:xrpl transport hardening", () => {
  it("maps RPC transport failures to networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    const result = await resolve(MAINNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("rejects a ledger entry whose Account does not match the DID", async () => {
    const forged = structuredClone(MAINNET_RESPONSE);
    forged.result.node.Account = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(forged)),
    );
    const result = await resolve(MAINNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("mismatch");
  });

  it("rejects oversized responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x".repeat(300 * 1024), {
            headers: { "content-type": "application/json" },
          }),
      ),
    );
    const result = await resolve(MAINNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});
