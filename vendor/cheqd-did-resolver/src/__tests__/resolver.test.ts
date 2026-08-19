import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";

const DID = "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN";
const resolve = (did: string, options = {}) =>
  getResolver({ resolverUrl: "https://cheqd.test/1.0/identifiers" }).cheqd(
    did,
    null as never,
    null as never,
    options,
  );

afterEach(() => vi.unstubAllGlobals());

describe("did:cheqd DIF driver", () => {
  it("resolves through the official cheqd resolver", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://cheqd.test/1.0/identifiers/${encodeURIComponent(DID)}`,
        );
        return Response.json({
          "@context": "https://w3id.org/did-resolution/v1",
          didDocument: {
            "@context": ["https://www.w3.org/ns/did/v1"],
            id: DID,
            verificationMethod: [
              {
                id: `${DID}#key-1`,
                type: "Ed25519VerificationKey2020",
                controller: DID,
                publicKeyMultibase: "z6MkKey",
              },
            ],
          },
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocumentMetadata: { versionId: "v1" },
        });
      }),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didDocumentMetadata.versionId).toBe("v1");
  });

  it("canonicalizes resolver error codes and maps 404 to notFound", async () => {
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
    const result = await resolve("did:cheqd:mainnet:zzzzzzzzzzzzzzzzzzzzzz");
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("rejects a document for a different DID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didDocument: { id: "did:cheqd:mainnet:other" },
          didResolutionMetadata: {},
          didDocumentMetadata: {},
        }),
      ),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("classifies transport failures as networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    const result = await resolve(DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});
