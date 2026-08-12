import { describe, expect, it } from "vitest";
import { safeExternalUrl, validateDid } from "./api";

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
});
