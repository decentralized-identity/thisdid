import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";

const DID = "did:plc:z72i7hdynmk6r22z27h6tvur";

afterEach(() => vi.unstubAllGlobals());

describe("did:plc DIF wrapper", () => {
  it("resolves a document from the configured directory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://plc.test/${encodeURIComponent(DID)}`,
        );
        return Response.json({ id: DID });
      }),
    );
    const result = await getResolver({ directoryUrl: "https://plc.test" }).plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didDocument?.id).toBe(DID);
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
  });

  it("maps a directory 404 to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const result = await getResolver().plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("notFound");
    expect(result.didDocument).toBeNull();
  });

  it("treats a directory redirect as a failure (workerd-safe)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(null, {
            status: 301,
            headers: { location: "https://elsewhere.test" },
          }),
      ),
    );
    const result = await getResolver().plc(
      DID,
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didDocument).toBeNull();
  });
});
