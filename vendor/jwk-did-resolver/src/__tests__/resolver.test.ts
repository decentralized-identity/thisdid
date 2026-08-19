import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";

/** Official test vectors from the did:jwk specification. */
const P256_DID =
  "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9";
const X25519_ENC_DID =
  "did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJYMjU1MTkiLCJ1c2UiOiJlbmMiLCJ4IjoiM3A3YmZYdDl3YlRUVzJIQzdPUTFOei1EUThoYmVHZE5yZngtRkctSUswOCJ9";

const encode = (jwk: Record<string, unknown>): string =>
  "did:jwk:" + Buffer.from(JSON.stringify(jwk)).toString("base64url");

const resolve = (did: string) =>
  getResolver().jwk(did, null as never, null as never, {});

afterEach(() => vi.unstubAllGlobals());

describe("did:jwk resolver — positive path", () => {
  it("resolves the P-256 spec vector offline with all relationships", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve(P256_DID);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
    const doc = result.didDocument;
    expect(doc?.id).toBe(P256_DID);
    const vm = doc?.verificationMethod?.[0];
    expect(vm?.id).toBe(`${P256_DID}#0`);
    expect(vm?.type).toBe("JsonWebKey2020");
    expect(vm?.publicKeyJwk).toMatchObject({ kty: "EC", crv: "P-256" });
    for (const rel of [
      "assertionMethod",
      "authentication",
      "capabilityInvocation",
      "capabilityDelegation",
      "keyAgreement",
    ]) {
      expect((doc as Record<string, unknown>)?.[rel]).toEqual([
        `${P256_DID}#0`,
      ]);
    }
  });

  it("emits only keyAgreement for a use:enc key (X25519 spec vector)", async () => {
    const result = await resolve(X25519_ENC_DID);
    const doc = result.didDocument as Record<string, unknown> | null;
    expect(doc?.keyAgreement).toEqual([`${X25519_ENC_DID}#0`]);
    expect(doc?.authentication).toBeUndefined();
    expect(doc?.assertionMethod).toBeUndefined();
    expect(doc?.capabilityInvocation).toBeUndefined();
    expect(doc?.capabilityDelegation).toBeUndefined();
  });

  it("omits keyAgreement for a use:sig key", async () => {
    const did = encode({
      kty: "OKP",
      crv: "Ed25519",
      use: "sig",
      x: "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
    });
    const result = await resolve(did);
    const doc = result.didDocument as Record<string, unknown> | null;
    expect(doc?.authentication).toEqual([`${did}#0`]);
    expect(doc?.keyAgreement).toBeUndefined();
  });

  it("never assigns keyAgreement to a signing-only curve, even without use", async () => {
    const did = encode({
      kty: "OKP",
      crv: "Ed25519",
      x: "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
    });
    const result = await resolve(did);
    const doc = result.didDocument as Record<string, unknown> | null;
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(doc?.authentication).toEqual([`${did}#0`]);
    expect(doc?.assertionMethod).toEqual([`${did}#0`]);
    expect(doc?.keyAgreement).toBeUndefined();
  });

  it("assigns only keyAgreement to an agreement-only curve without use", async () => {
    const did = encode({
      kty: "OKP",
      crv: "X25519",
      x: "3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08",
    });
    const result = await resolve(did);
    const doc = result.didDocument as Record<string, unknown> | null;
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(doc?.keyAgreement).toEqual([`${did}#0`]);
    expect(doc?.authentication).toBeUndefined();
    expect(doc?.assertionMethod).toBeUndefined();
  });

  it("resolves a well-formed RSA key with signing relationships only", async () => {
    const n = Buffer.alloc(256, 7); // 2048-bit modulus, no leading zero
    const did = encode({
      kty: "RSA",
      n: n.toString("base64url"),
      e: "AQAB",
    });
    const result = await resolve(did);
    const doc = result.didDocument as Record<string, unknown> | null;
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(doc?.authentication).toEqual([`${did}#0`]);
    expect(doc?.keyAgreement).toBeUndefined();
  });
});

describe("did:jwk resolver — rejection", () => {
  it("rejects private key material instead of stripping it", async () => {
    for (const jwk of [
      // Ed25519 with private scalar
      {
        kty: "OKP",
        crv: "Ed25519",
        x: "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
        d: "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
      },
      // symmetric key
      { kty: "oct", k: "c2VjcmV0" },
      // RSA with a prime
      { kty: "RSA", n: "abc", e: "AQAB", p: "prime" },
    ]) {
      const result = await resolve(encode(jwk));
      expect(result.didDocument).toBeNull();
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });

  it("rejects malformed encodings and structures", async () => {
    for (const did of [
      "did:jwk:!!!not-base64url!!!",
      "did:jwk:" + Buffer.from("not json").toString("base64url"),
      "did:jwk:" + Buffer.from('["array"]').toString("base64url"),
      "did:jwk:abc:extra",
      "did:jwk:" + "A".repeat(5000),
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });

  it("rejects unsupported kty and missing required members", async () => {
    for (const jwk of [
      { kty: "EC", crv: "P-256", x: "onlyX" }, // missing y
      { kty: "OKP", crv: "Ed25519" }, // missing x
      { kty: "RSA", n: "abc" }, // missing e
      { crv: "P-256", x: "a", y: "b" }, // missing kty
      { kty: "unknown", x: "a" },
      { kty: "EC", crv: "P-256", x: "a", y: "b", use: "other" },
    ]) {
      const result = await resolve(encode(jwk));
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });

  it("rejects unknown curves and malformed key material", async () => {
    const X32 = "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik"; // 32 octets
    for (const jwk of [
      { kty: "EC", crv: "foo", x: X32, y: X32 }, // unknown EC curve
      { kty: "OKP", crv: "bar", x: X32 }, // unknown OKP curve
      { kty: "EC", crv: "P-256", x: "c2hvcnQ", y: X32 }, // x too short
      { kty: "EC", crv: "P-384", x: X32, y: X32 }, // 32 octets ≠ 48
      { kty: "OKP", crv: "Ed25519", x: "!!!" }, // not base64url
    ]) {
      const result = await resolve(encode(jwk));
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });

  it("rejects capability-contradicting use values", async () => {
    const X32 = "3p7bfXt9wbTTW2HC7OQ1Nz-DQ8hbeGdNrfx-FG-IK08";
    const n = Buffer.alloc(256, 7).toString("base64url");
    for (const jwk of [
      { kty: "OKP", crv: "X25519", use: "sig", x: X32 }, // agreement-only curve
      { kty: "OKP", crv: "Ed25519", use: "enc", x: X32 }, // signing-only curve
      { kty: "RSA", use: "enc", n, e: "AQAB" }, // RSA cannot key-agree
    ]) {
      const result = await resolve(encode(jwk));
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });

  it("rejects structurally invalid RSA moduli and exponents", async () => {
    const n = Buffer.alloc(256, 7).toString("base64url");
    for (const jwk of [
      { kty: "RSA", n: Buffer.alloc(64, 7).toString("base64url"), e: "AQAB" }, // 512-bit
      {
        kty: "RSA",
        n: Buffer.concat([Buffer.alloc(1), Buffer.alloc(256, 7)]).toString(
          "base64url",
        ),
        e: "AQAB",
      }, // leading zero octet
      { kty: "RSA", n, e: "AAQAB" }, // exponent not base64url-canonical length
      { kty: "RSA", n, e: "BA" }, // even exponent (4)
      { kty: "RSA", n, e: "AQ" }, // exponent 1 < 3
      { kty: "RSA", n, e: Buffer.alloc(9, 1).toString("base64url") }, // > 8 octets
    ]) {
      const result = await resolve(encode(jwk));
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
  });
});
