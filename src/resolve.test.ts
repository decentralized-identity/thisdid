import { afterEach, describe, expect, it, vi } from "vitest";
import { planChain, resolveDid } from "./resolve";
import type { Env } from "./types";
import type { HealthSnapshot } from "./routing/health";

const env = {
  GODIDDY_RESOLVER: "https://godiddy.test",
  ARCHON_RESOLVER: "https://archon.test",
  GOPLAUSIBLE_RESOLVER: "https://goplausible.test",
  RESOLVER_LABEL: "test",
} as Env;

afterEach(() => vi.unstubAllGlobals());

describe("resolveDid", () => {
  it("rejects malformed DIDs before routing", async () => {
    expect(
      (await resolveDid("not-a-did", env)).didResolutionMetadata.error,
    ).toBe("invalidDid");
  });

  it("returns unsupportedDidMethod for methods outside the advertised catalog", async () => {
    expect(
      (await resolveDid("did:unknown:123", env)).didResolutionMetadata.error,
    ).toBe("unsupportedDidMethod");
  });

  it("preserves meaningful upstream errors and attempt diagnostics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didResolutionMetadata: {
              error: "deactivated",
              upstreamField: "retained",
            },
            didDocument: null,
            didDocumentMetadata: { deactivated: true },
          },
          { status: 410 },
        ),
      ),
    );
    const result = await resolveDid("did:algo:abc", env);
    expect(result.didResolutionMetadata.error).toBe("deactivated");
    expect(result.didResolutionMetadata.attempted).toEqual([
      "goplausible",
      "godiddy",
      "archon",
    ]);
    expect(result.didDocumentMetadata).toEqual({ deactivated: true });
  });

  it("rejects an upstream document for a different DID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          didResolutionMetadata: {},
          didDocument: { id: "did:algo:different" },
          didDocumentMetadata: {},
        }),
      ),
    );
    const result = await resolveDid("did:algo:requested", env);
    expect(result.didDocument).toBeNull();
    expect(
      result.didResolutionMetadata.attempts?.every(
        (a) => a.error === "invalidDidDocument",
      ),
    ).toBe(true);
  });

  it("fails over when an upstream returns JSON null", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(null)),
    );
    const result = await resolveDid("did:algo:requested", env);
    expect(result.didDocument).toBeNull();
    expect(
      result.didResolutionMetadata.attempts?.every(
        (attempt) => attempt.error === "invalidResponse",
      ),
    ).toBe(true);
  });

  it("passes an abort signal to every upstream request", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return Response.json(null);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await resolveDid("did:algo:requested", env);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("rejects oversized upstream bodies without trusting Content-Length", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              id: "did:algo:requested",
              padding: "x".repeat(1024 * 1024),
            }),
            { headers: { "content-type": "application/json" } },
          ),
      ),
    );

    const result = await resolveDid("did:algo:requested", env);
    expect(result.didResolutionMetadata.attempts).toHaveLength(3);
    expect(
      result.didResolutionMetadata.attempts?.every(
        (attempt) => attempt.error === "invalidResponse",
      ),
    ).toBe(true);
  });
});

it("moves down providers behind healthy fallbacks without deleting them", () => {
  const health: HealthSnapshot = {
    v: 1,
    updatedTs: Date.now(),
    providers: {
      local: {
        status: "down",
        ewmaMs: null,
        successRate: 0,
        consecutiveFails: 3,
        lastOkTs: null,
        lastProbeTs: Date.now(),
      },
    },
  };
  expect(planChain(["local", "godiddy", "archon"], health)).toEqual([
    "godiddy",
    "archon",
    "local",
  ]);
});
