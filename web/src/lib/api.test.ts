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

  it("surfaces nested VerifiableCondition keys, thresholds, and parents", () => {
    // did:eosio shape: material lives inside conditionWeightedThreshold, the
    // EOSIO canonical key string in the JWK kid, hierarchy in
    // relationshipParent — none of which a flat extractor sees.
    const did = "did:eosio:eos:eoscanadacom";
    const doc = {
      id: did,
      verificationMethod: [
        {
          id: `${did}#active`,
          controller: did,
          type: "VerifiableCondition",
          threshold: 1,
          conditionWeightedThreshold: [
            {
              condition: {
                id: `${did}#active-0`,
                controller: did,
                type: "EcdsaSecp256k1VerificationKey2019",
                publicKeyJwk: {
                  crv: "secp256k1",
                  kty: "EC",
                  x: "xValue",
                  y: "yValue",
                  kid: "PUB_K1_8SC96RUoYvM1X47isB",
                },
              },
              weight: 1,
            },
          ],
          relationshipParent: [`${did}#owner`],
        },
        {
          id: `${did}#owner`,
          controller: did,
          type: "VerifiableCondition",
          threshold: 5,
          conditionWeightedThreshold: [
            {
              condition: {
                id: `${did}#owner-0`,
                controller: did,
                type: "VerifiableCondition",
                conditionDelegated: "did:eosio:eos:eoscanadaaaa#active",
              },
              weight: 2,
            },
            {
              condition: {
                id: `${did}#owner-1`,
                controller: did,
                type: "VerifiableCondition",
                conditionDelegated: "did:eosio:eos:eoscanadaaab#active",
              },
              weight: 1,
            },
          ],
        },
      ],
      service: [
        {
          id: "https://eos.greymass.com",
          type: "LinkedDomains",
          serviceEndpoint: "https://eos.greymass.com",
        },
      ],
    } as unknown as DIDDocument;
    const resolution = {
      didResolutionMetadata: {},
      didDocument: doc,
      didDocumentMetadata: {},
    } as DIDResolutionResult;

    const view = buildView(did, resolution, doc);
    const [active, owner] = view.vmList;
    // Nested key surfaced, friendliest form first (the EOSIO kid).
    expect(active?.keyLabel).toBe("publicKeyJwk");
    expect(active?.keyValue).toBe("PUB_K1_8SC96RUoYvM1X47isB");
    expect(active?.badges).toEqual(["threshold 1", "parent #owner"]);
    // Delegation-only condition sets surface their targets and weights.
    expect(owner?.keyLabel).toBe("Delegates to (2)");
    expect(owner?.keyValue).toBe(
      "did:eosio:eos:eoscanadaaaa#active, did:eosio:eos:eoscanadaaab#active",
    );
    expect(owner?.badges).toEqual([
      "threshold 5",
      "weights 2+1",
      "2 conditions",
    ]);
    // URL service ids are not fragments — shown as-is, not "#https://…".
    expect(view.svcList[0]?.frag).toBe("https://eos.greymass.com");
    // No declared controller must not render as if the document declared one.
    expect(view.controllerShort).toBe("—");
  });

  it("surfaces Iden3 state anchors instead of an empty public-key pill", () => {
    const did =
      "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw";
    const doc = {
      id: did,
      verificationMethod: [
        {
          id: `${did}#state-info`,
          type: "Iden3StateInfo2023",
          controller: did,
          stateContractAddress:
            "80002:0x1a4cC30f2aA0377b0c3bc9848766D90cb4404124",
          published: true,
          info: {
            id: did,
            state:
              "7a1a45d22b686cf1bd2f9fbecbed38b725a555e6d8ad68d3780feda9124b1a13",
            replacedByState:
              "0000000000000000000000000000000000000000000000000000000000000000",
          },
        },
      ],
    } as unknown as DIDDocument;
    const resolution = {
      didResolutionMetadata: {},
      didDocument: doc,
      didDocumentMetadata: {},
    } as DIDResolutionResult;

    const view = buildView(did, resolution, doc);
    const vm = view.vmList[0];
    expect(vm?.keyLabel).toBe("stateContractAddress");
    expect(vm?.keyValue).toBe(
      "80002:0x1a4cC30f2aA0377b0c3bc9848766D90cb4404124",
    );
    expect(vm?.badges).toEqual(["published", "state 7a1a45d2…4b1a13"]);
  });

  it("labels a method with no key-like material honestly", () => {
    const did = "did:example:keyless";
    const doc = {
      id: did,
      verificationMethod: [
        { id: `${did}#odd`, type: "FutureMethod2030", controller: did },
      ],
    } as unknown as DIDDocument;
    const resolution = {
      didResolutionMetadata: {},
      didDocument: doc,
      didDocumentMetadata: {},
    } as DIDResolutionResult;
    const view = buildView(did, resolution, doc);
    expect(view.vmList[0]?.keyLabel).toBe("Key material");
    expect(view.vmList[0]?.keyValue).toBe("");
  });
});
