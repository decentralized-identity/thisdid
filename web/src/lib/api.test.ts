import { describe, expect, it } from "vitest";
import { buildView, safeExternalUrl, validateDid } from "./api";
import type { DIDDocument, DIDResolutionResult } from "./types";

describe("web resolver input handling", () => {
  it("validates basic DID input before sending it to the Worker", () => {
    expect(validateDid("did:web:example.com")).toBeNull();
    expect(validateDid("https://example.com")).toContain("Format");
  });

  it("allows web service endpoints and rejects executable or malformed URLs", () => {
    expect(safeExternalUrl("https://example.com/service")).toBe(
      "https://example.com/service",
    );
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("not a URL")).toBeNull();
  });

  it("normalizes a singleton verification method returned by legacy drivers", () => {
    const did = "did:everscale:abc";
    const doc = {
      id: did,
      verificationMethod: {
        id: did,
        type: "Ed25519VerificationKey2020",
        controller: did,
        publicKeyMultibase: "abc",
      },
    } as unknown as DIDDocument;
    const resolution = {
      didResolutionMetadata: {},
      didDocument: doc,
      didDocumentMetadata: {},
    } as DIDResolutionResult;

    const view = buildView(did, resolution, doc);
    expect(view.vmCount).toBe(1);
    expect(view.vmList[0]?.keyValue).toBe("abc");
  });

  it("normalizes legacy publicKey, relationship, and service shapes", () => {
    const did = "did:ccp:abc";
    const keyId = `${did}#key-1`;
    const doc = {
      id: did,
      publicKey: [
        {
          id: keyId,
          type: "Secp256k1",
          controller: did,
          publicKeyHex: "04abc",
        },
      ],
      authentication: [{ type: "Secp256k1", publicKey: [keyId] }],
      service: [{ type: "DIDResolve", serviceEndpoint: "https://did.example" }],
    } as unknown as DIDDocument;
    const resolution = {
      didResolutionMetadata: {},
      didDocument: doc,
      didDocumentMetadata: {},
    } as DIDResolutionResult;

    const view = buildView(did, resolution, doc);
    expect(view.vmList[0]?.keyLabel).toBe("publicKeyHex");
    expect(view.relList[0]?.refs).toBe("#key-1");
    expect(view.svcList[0]?.frag).toBe("#service-1");
  });
});
