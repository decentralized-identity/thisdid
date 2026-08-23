import { describe, expect, it } from "vitest";
import { compareCores, isVerificationExempt } from "./verify";
import type { DIDResolutionResult } from "did-resolver";

function result(
  doc: Record<string, unknown> | null,
  deactivated = false,
): DIDResolutionResult {
  return {
    didResolutionMetadata: {},
    didDocument: doc as DIDResolutionResult["didDocument"],
    didDocumentMetadata: deactivated ? { deactivated: true } : {},
  };
}

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

describe("compareCores", () => {
  it("matches identical cores despite cosmetic differences", () => {
    const local = result({
      id: DID,
      verificationMethod: [
        { id: `${DID}#a`, type: "Multikey", publicKeyMultibase: "zKeyOne" },
        { id: `${DID}#b`, type: "Multikey", publicKeyMultibase: "zKeyTwo" },
      ],
    });
    const upstream = result({
      "@context": ["https://www.w3.org/ns/did/v1", "https://extra.example"],
      id: DID,
      alsoKnownAs: ["at://bsky.app"],
      verificationMethod: [
        // Different order, different ids, extra properties — same key material.
        {
          id: `${DID}#other`,
          type: "Multikey",
          publicKeyMultibase: "zKeyTwo",
          extra: true,
        },
        { id: `${DID}#a`, type: "Multikey", publicKeyMultibase: "zKeyOne" },
      ],
    });
    expect(compareCores(local, upstream)).toBe("match");
  });

  it("mismatches on differing key material", () => {
    const local = result({
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyMultibase: "zKeyOne" }],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyMultibase: "zRotated" }],
    });
    expect(compareCores(local, upstream)).toBe("mismatch");
  });

  it("mismatches on document id or deactivation disagreement", () => {
    const doc = {
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyBase58: "Key" }],
    };
    expect(
      compareCores(result(doc), result({ ...doc, id: "did:plc:other" })),
    ).toBe("mismatch");
    expect(compareCores(result(doc), result(doc, true))).toBe("mismatch");
  });

  it("mismatches when the same key is authorized for different purposes", () => {
    const vm = { id: `${DID}#a`, publicKeyMultibase: "zKeyOne" };
    const local = result({
      id: DID,
      verificationMethod: [vm],
      authentication: [`${DID}#a`],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [vm],
      keyAgreement: [`${DID}#a`],
    });
    expect(compareCores(local, upstream)).toBe("mismatch");
  });

  it("mismatches when one side authorizes an extra relationship", () => {
    const vm = { id: `${DID}#a`, publicKeyMultibase: "zKeyOne" };
    const local = result({
      id: DID,
      verificationMethod: [vm],
      authentication: [`${DID}#a`],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [vm],
      authentication: [`${DID}#a`],
      capabilityInvocation: [`${DID}#a`],
    });
    expect(compareCores(local, upstream)).toBe("mismatch");
  });

  it("matches an embedded relationship method against listed + referenced", () => {
    const agreement = {
      id: `${DID}#x25519`,
      type: "X25519KeyAgreementKey2019",
      publicKeyBase58: "AgreementKey",
    };
    const embedded = result({
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyMultibase: "zKeyOne" }],
      authentication: [`${DID}#a`],
      keyAgreement: [agreement],
    });
    const referenced = result({
      id: DID,
      verificationMethod: [
        { id: `${DID}#a`, publicKeyMultibase: "zKeyOne" },
        agreement,
      ],
      authentication: [`${DID}#a`],
      keyAgreement: [`${DID}#x25519`],
    });
    expect(compareCores(embedded, referenced)).toBe("match");
  });

  it("mismatches when duplicate methods carry the same key on one side only", () => {
    const local = result({
      id: DID,
      verificationMethod: [
        { id: `${DID}#a`, publicKeyMultibase: "zKeyOne" },
        { id: `${DID}#b`, publicKeyMultibase: "zKeyOne" },
      ],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyMultibase: "zKeyOne" }],
    });
    expect(compareCores(local, upstream)).toBe("mismatch");
  });

  it("mismatches on a controller change, treating self as omittable", () => {
    const local = result({
      id: DID,
      verificationMethod: [
        { id: `${DID}#a`, controller: DID, publicKeyMultibase: "zKeyOne" },
      ],
    });
    const sameImplicit = result({
      id: DID,
      verificationMethod: [{ id: `${DID}#a`, publicKeyMultibase: "zKeyOne" }],
    });
    expect(compareCores(local, sameImplicit)).toBe("match");
    const foreign = result({
      id: DID,
      verificationMethod: [
        {
          id: `${DID}#a`,
          controller: "did:plc:attacker",
          publicKeyMultibase: "zKeyOne",
        },
      ],
    });
    expect(compareCores(local, foreign)).toBe("mismatch");
  });

  it("treats a purpose-silent upstream as having no opinion on relationships", () => {
    // Live regression: Godiddy's Transmute-based did:jwk driver returns only
    // `verificationMethod` — no relationship properties, relative `#0` id —
    // while the local driver emits the spec's five relationships. Silence on
    // purposes must not read as a disagreement.
    const jwk = {
      crv: "P-256",
      kty: "EC",
      x: "acbIQiuMs3i8_uszEjJ2tpTtRM4EU3yz91PH6CdH2V0",
      y: "_KcyLj9vWMptnmKtm46GqDz8wf74I5LKgrl2GzH3nSE",
    };
    const local = result({
      id: DID,
      verificationMethod: [
        { id: `${DID}#0`, controller: DID, publicKeyJwk: jwk },
      ],
      assertionMethod: [`${DID}#0`],
      authentication: [`${DID}#0`],
      capabilityInvocation: [`${DID}#0`],
      capabilityDelegation: [`${DID}#0`],
      keyAgreement: [`${DID}#0`],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [{ id: "#0", controller: DID, publicKeyJwk: jwk }],
    });
    expect(compareCores(local, upstream)).toBe("match");
    // Key material is still fully verified against a purpose-silent upstream.
    const rotated = result({
      id: DID,
      verificationMethod: [
        { id: "#0", controller: DID, publicKeyJwk: { ...jwk, x: "rotated" } },
      ],
    });
    expect(compareCores(local, rotated)).toBe("mismatch");
  });

  it("mismatches when the local document omits purposes the upstream expresses", () => {
    const vm = { id: `${DID}#a`, publicKeyMultibase: "zKeyOne" };
    const local = result({ id: DID, verificationMethod: [vm] });
    const upstream = result({
      id: DID,
      verificationMethod: [vm],
      authentication: [`${DID}#a`],
    });
    expect(compareCores(local, upstream)).toBe("mismatch");
  });

  it("compares JWK material by canonical public members", () => {
    const local = result({
      id: DID,
      verificationMethod: [
        {
          id: `${DID}#a`,
          publicKeyJwk: { crv: "Ed25519", kty: "OKP", x: "abc" },
        },
      ],
    });
    const upstream = result({
      id: DID,
      verificationMethod: [
        {
          id: `${DID}#a`,
          // Same key, different member order and an extra non-key member.
          publicKeyJwk: { x: "abc", kty: "OKP", crv: "Ed25519", alg: "EdDSA" },
        },
      ],
    });
    expect(compareCores(local, upstream)).toBe("match");
  });
});

describe("compareCores Ed25519 encoding normalization", () => {
  it("matches the same key expressed as multibase, JWK, and base58", () => {
    // Real pair (verified byte-identical): did:key z6MkjvBkt8… ↔ its JWK x.
    const MULTIBASE = "z6MkjvBkt8ETnxXGBFPSGgYKb43q7oNHLX8BiYSPcXVG6gY6";
    const JWK_X = "UTBElpNSZB8dS_R9rzWnWB-ozdtL7Sz96RQZhwnzur8";
    const did = "did:dns:danubetech.com";
    const asMultibase = result({
      id: did,
      verificationMethod: [
        { id: `${did}#key1`, type: "Multikey", publicKeyMultibase: MULTIBASE },
      ],
    });
    const asJwk = result({
      id: did,
      verificationMethod: [
        {
          id: `${did}#other`,
          type: "JsonWebKey2020",
          publicKeyJwk: { kty: "OKP", crv: "Ed25519", x: JWK_X },
        },
      ],
    });
    expect(compareCores(asMultibase, asJwk)).toBe("match");
    const rotated = result({
      id: did,
      verificationMethod: [
        {
          id: `${did}#other`,
          type: "JsonWebKey2020",
          publicKeyJwk: {
            kty: "OKP",
            crv: "Ed25519",
            x: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
          },
        },
      ],
    });
    expect(compareCores(asMultibase, rotated)).toBe("mismatch");
  });
});

describe("Ed25519 decoder input bound", () => {
  it("never feeds oversized encodings to the base58 BigInt decoder", () => {
    // A bounded-but-large document could carry ~1 MiB of base58 after "z6Mk";
    // the O(n²) decode would burn CPU before the length check rejected it.
    // Oversized values must short-circuit to the tagged-string fallback.
    const giant = "z6Mk" + "1".repeat(256 * 1024);
    const doc = {
      id: DID,
      verificationMethod: [
        { id: `${DID}#a`, type: "Multikey", publicKeyMultibase: giant },
      ],
    };
    const started = Date.now();
    expect(compareCores(result(doc), result(doc))).toBe("match");
    expect(
      compareCores(
        result(doc),
        result({
          ...doc,
          verificationMethod: [
            { id: `${DID}#a`, type: "Multikey", publicKeyMultibase: "zOther" },
          ],
        }),
      ),
    ).toBe("mismatch");
    // With the cap this is instant; without it the BigInt loop takes minutes.
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("compareCores Iden3StateInfo2023 state comparison", () => {
  const IDEN3_DID =
    "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw";
  const stateVm = (overrides: Record<string, unknown> = {}) => ({
    id: `${IDEN3_DID}#state-info`,
    type: "Iden3StateInfo2023",
    controller: IDEN3_DID,
    stateContractAddress: "80002:0x1a4cC30f2aA0377b0c3bc9848766D90cb4404124",
    published: true,
    info: {
      id: IDEN3_DID,
      state: "9d6aa32cfe98d6f96fb0c9c9c1c66666951928d0a129b09b6d4e9d1e33d5b1e1",
      replacedByState:
        "0000000000000000000000000000000000000000000000000000000000000000",
      createdAtTimestamp: "1712102596",
      replacedAtTimestamp: "0",
    },
    global: {
      root: "8b2b9e9201f6d0b6f0e1f9f7e78dc7dc19f9e40707c9e2b696a17b3f27fa5a5e",
      replacedByRoot:
        "0000000000000000000000000000000000000000000000000000000000000000",
      createdAtTimestamp: "1755700000",
      proof: {
        type: "Iden3SparseMerkleTreeProof",
        existence: true,
        siblings: ["123", "456"],
      },
    },
    ...overrides,
  });
  const iden3Result = (vm: Record<string, unknown>) =>
    result({ id: IDEN3_DID, verificationMethod: [vm] });

  it("matches identical state info, ignoring read-time lifecycle fields", () => {
    const local = stateVm();
    const upstream = stateVm({
      global: {
        ...(stateVm().global as Record<string, unknown>),
        createdAtTimestamp: "1755799999", // read-time metadata may differ
      },
    });
    expect(compareCores(iden3Result(local), iden3Result(upstream))).toBe(
      "match",
    );
  });

  it("mismatches identical ids/fragments whose state roots differ", () => {
    const upstream = stateVm({
      global: {
        ...(stateVm().global as Record<string, unknown>),
        root: "deadbeef00000000000000000000000000000000000000000000000000000000",
      },
    });
    expect(compareCores(iden3Result(stateVm()), iden3Result(upstream))).toBe(
      "mismatch",
    );
  });

  it("mismatches on differing identity state or published flag", () => {
    const differentState = stateVm({
      info: {
        ...(stateVm().info as Record<string, unknown>),
        state:
          "1111111111111111111111111111111111111111111111111111111111111111",
      },
    });
    expect(
      compareCores(iden3Result(stateVm()), iden3Result(differentState)),
    ).toBe("mismatch");
    const unpublished = stateVm({ published: false, info: undefined });
    expect(compareCores(iden3Result(stateVm()), iden3Result(unpublished))).toBe(
      "mismatch",
    );
  });

  it("reports unrecognized keyless methods as incomparable, never a match", () => {
    const opaque = {
      id: `${DID}#cond`,
      type: "VerifiableCondition2021",
      controller: DID,
      conditionWeightedThreshold: [],
    };
    const doc = result({ id: DID, verificationMethod: [opaque] });
    expect(compareCores(doc, doc)).toBe("incomparable");
  });
});

describe("isVerificationExempt", () => {
  it("exempts NEAR implicit accounts only", () => {
    expect(isVerificationExempt("near", `did:near:${"a1".repeat(32)}`)).toBe(
      true,
    );
    expect(isVerificationExempt("near", "did:near:registrar.near")).toBe(false);
    expect(isVerificationExempt("plc", DID)).toBe(false);
  });
});
