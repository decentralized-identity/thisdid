import { describe, expect, it } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";

// did:key documents are derived from the identifier itself, so the whole suite
// runs offline. The vector is the canary the ThisDID probe fires every minute.
const CANARY = "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8";

describe("did:key DIF wrapper", () => {
  it("registers exactly the key method", () => {
    expect(Object.keys(getResolver())).toEqual(["key"]);
  });

  it("resolves the probe canary offline", async () => {
    const result = await new Resolver(getResolver()).resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(CANARY);
    expect(result.didDocument?.verificationMethod?.length).toBeGreaterThan(0);
  });
});
