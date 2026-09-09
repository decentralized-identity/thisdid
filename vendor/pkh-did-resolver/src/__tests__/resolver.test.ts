import { describe, expect, it } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";

// did:pkh documents are derived from the identifier itself, so the whole suite
// runs offline. The vector is the canary the ThisDID probe fires every minute.
const CANARY = "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb";

describe("did:pkh DIF wrapper", () => {
  it("registers exactly the pkh method", () => {
    expect(Object.keys(getResolver())).toEqual(["pkh"]);
  });

  it("resolves the probe canary offline", async () => {
    const result = await new Resolver(getResolver()).resolve(CANARY);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(CANARY);
    expect(result.didDocument?.verificationMethod?.length).toBeGreaterThan(0);
  });
});
