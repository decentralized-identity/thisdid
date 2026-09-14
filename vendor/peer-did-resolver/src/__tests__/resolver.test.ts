import { describe, expect, it } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";

// did:peer documents are derived from the identifier itself, so the whole
// suite runs offline. The vector is the canary the ThisDID probe fires.
const NUMALGO0 = "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V";

describe("did:peer DIF wrapper", () => {
  it("registers exactly the peer method", () => {
    expect(Object.keys(getResolver())).toEqual(["peer"]);
  });

  it("resolves a numalgo 0 identifier offline", async () => {
    const result = await new Resolver(getResolver()).resolve(NUMALGO0);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(NUMALGO0);
    expect(result.didDocument?.verificationMethod?.length).toBeGreaterThan(0);
  });

  it("reports an unresolvable identifier as invalidDid, not an exception", async () => {
    const result = await new Resolver(getResolver()).resolve(
      "did:peer:9notanumalgo",
    );
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
  });
});

describe("representation negotiation (accept)", () => {
  const did = "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V";
  it("strips the context for application/did+json and keeps it for application/did+ld+json", async () => {
    const plain = await new Resolver(getResolver()).resolve(did, {
      accept: "application/did+json",
    });
    expect(plain.didResolutionMetadata.contentType).toBe(
      "application/did+json",
    );
    expect(plain.didDocument?.["@context"]).toBeUndefined();
    const linked = await new Resolver(getResolver()).resolve(did, {
      accept: "application/did+ld+json",
    });
    expect(linked.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
    expect(Array.isArray(linked.didDocument?.["@context"])).toBe(true);
  });
  it("refuses a representation it cannot produce", async () => {
    const result = await new Resolver(getResolver()).resolve(did, {
      accept: "application/did+cbor",
    });
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe(
      "representationNotSupported",
    );
  });
});
