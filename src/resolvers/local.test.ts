import { describe, expect, it, vi } from "vitest";
import type { DriverResponseV1 } from "../driver-workers/contract";
import { resolveLocal } from "./local";

const did = "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8";

function binding(body: unknown, status = 200) {
  return { fetch: vi.fn(async () => Response.json(body, { status })) };
}

function validResponse(documentId = did): DriverResponseV1 {
  return {
    protocol: 1,
    result: {
      didResolutionMetadata: {},
      didDocument: { id: documentId },
      didDocumentMetadata: {},
    },
    driver: {
      method: "key",
      packageName: "key-did-resolver",
      packageVersion: "4.0.0",
      durationMs: 1,
    },
  };
}

describe("isolated driver client", () => {
  it("invokes the matching private Service Binding", async () => {
    const service = binding(validResponse());
    const result = await resolveLocal(did, { DRIVER_KEY: service });
    expect(result.didDocument?.id).toBe(did);
    expect(service.fetch).toHaveBeenCalledOnce();
  });

  it("reports an absent deployment without throwing", async () => {
    expect((await resolveLocal(did, {})).didResolutionMetadata.error).toBe(
      "notConfigured",
    );
  });

  it("rejects a document with a mismatched id", async () => {
    const env = {
      DRIVER_KEY: binding(validResponse("did:key:zDifferent")),
    };
    expect((await resolveLocal(did, env)).didResolutionMetadata.error).toBe(
      "invalidDidDocument",
    );
  });

  it("rejects malformed internal responses", async () => {
    const env = { DRIVER_KEY: binding({ protocol: 2 }) };
    expect((await resolveLocal(did, env)).didResolutionMetadata.error).toBe(
      "invalidResponse",
    );
  });
});
