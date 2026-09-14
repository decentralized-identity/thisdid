import { afterEach, describe, expect, it, vi } from "vitest";
import { Resolver } from "did-resolver";
import { DestinationGuardError, getResolver } from "../resolver.js";

// The suites below stub the global fetch, so they declare that fetch as the
// destination boundary; the default on Node would bind the connect-time guard
// and never touch the stub.
const caller = { destinationGuard: "caller" as const };

const DOC = {
  "@context": "https://www.w3.org/ns/did/v1",
  id: "did:web:localhost%3A8443",
  verificationMethod: [],
};

afterEach(() => vi.unstubAllGlobals());

describe("did:web DIF wrapper", () => {
  it("registers exactly the web method", () => {
    expect(Object.keys(getResolver())).toEqual(["web"]);
  });

  it("rejects a malformed identifier without a network round trip", async () => {
    const result = await new Resolver(getResolver()).resolve("did:web:");
    expect(result.didResolutionMetadata.error).toBe("invalidDid");
  });

  it("refuses loopback and private hosts by default, before any fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:web:localhost%3A8443",
      "did:web:10.1.2.3",
      "did:web:169.254.169.254",
    ]) {
      const result = await new Resolver(getResolver(caller)).resolve(did);
      expect(result.didDocument).toBeNull();
      expect(result.didResolutionMetadata.error).toBe("notFound");
      expect(result.didResolutionMetadata.message).toContain(
        "blocked by fetch policy",
      );
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honours allowPrivateHosts for local development", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(DOC), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new Resolver(
      getResolver({ allowPrivateHosts: true }),
    ).resolve("did:web:localhost%3A8443");
    expect(result.didDocument).toEqual(DOC);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://localhost:8443/.well-known/did.json",
    );
  });

  it("reports a timeout as a transport-class error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () =>
              reject(new Error("aborted")),
            );
          }),
      ),
    );
    const result = await new Resolver(
      getResolver({ ...caller, timeoutMs: 20 }),
    ).resolve("did:web:example.com");
    expect(result.didResolutionMetadata.error).toBe("timeout");
  });

  it("bounds the document size", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response("x".repeat(4096), { status: 200 })),
    );
    const result = await new Resolver(
      getResolver({ ...caller, maxResponseBytes: 1024 }),
    ).resolve("did:web:example.com");
    expect(result.didResolutionMetadata.error).toBe("internalError");
    expect(result.didResolutionMetadata.message).toContain(
      "exceeds 1024 bytes",
    );
  });
});

describe("destination guard (connection level)", () => {
  it("binds the connect-time guard by default on Node, not the global fetch", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);
    const result = await new Resolver(getResolver()).resolve(
      "did:web:nonexistent.invalid",
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain(
      "nonexistent.invalid",
    );
  });

  it("refuses a custom fetch that does not declare its boundary", () => {
    expect(() =>
      getResolver({ fetch: vi.fn() as unknown as typeof fetch }),
    ).toThrow(DestinationGuardError);
    expect(() =>
      getResolver({
        destinationGuard: "node",
        fetch: vi.fn() as unknown as typeof fetch,
      }),
    ).toThrow(DestinationGuardError);
  });

  it("uses a custom fetch once its boundary is declared", async () => {
    const doc = { ...DOC, id: "did:web:example.com" };
    const custom = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify(doc), { status: 200 }));
    const result = await new Resolver(
      getResolver({ ...caller, fetch: custom }),
    ).resolve("did:web:example.com");
    expect(result.didDocument).toEqual(doc);
    expect(custom).toHaveBeenCalledTimes(1);
  });
});

// Live corpus — opt in with WEB_LIVE=1 (`pnpm run test:live`). Uses the same
// canary the ThisDID probe fires every minute.
describe.skipIf(!process.env.WEB_LIVE)("did:web live", () => {
  it("resolves the DIF canary did:web:identity.foundation", async () => {
    const did = "did:web:identity.foundation";
    const result = await new Resolver(getResolver()).resolve(did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(did);
  });
});

describe("representation negotiation (accept)", () => {
  const serve = (document: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify(document), { status: 200 }),
      ),
    );
  const registry = () => getResolver({ ...caller, allowPrivateHosts: true });
  const did = "did:web:localhost%3A8443";

  it("returns plain JSON without the context for application/did+json", async () => {
    serve(DOC);
    const result = await new Resolver(registry()).resolve(did, {
      accept: "application/did+json",
    });
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+json",
    );
    expect(result.didDocument?.["@context"]).toBeUndefined();
    expect(result.didDocument?.id).toBe(did);
  });

  it("returns JSON-LD with the DID Core context for application/did+ld+json, adding it to a plain document", async () => {
    const { "@context": _context, ...plain } = DOC;
    serve(plain);
    const result = await new Resolver(registry()).resolve(did, {
      accept: "application/did+ld+json",
    });
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
    expect(result.didDocument?.["@context"]).toBe(
      "https://www.w3.org/ns/did/v1",
    );
  });

  it("refuses a representation it cannot produce", async () => {
    serve(DOC);
    const result = await new Resolver(registry()).resolve(did, {
      accept: "text/plain",
    });
    expect(result.didDocument).toBeNull();
    expect(result.didResolutionMetadata.error).toBe(
      "representationNotSupported",
    );
    expect(result.didResolutionMetadata.contentType).toBeUndefined();
  });

  it("leaves the driver's choice when accept is absent", async () => {
    serve(DOC);
    const result = await new Resolver(registry()).resolve(did);
    expect(result.didResolutionMetadata.contentType).toBe(
      "application/did+ld+json",
    );
  });
});
