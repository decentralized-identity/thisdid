import { describe, expect, it, vi } from "vitest";
import app from "./index";
import { resetDifBadgesCache } from "./dif-badges";
import type { Env } from "./types";

const env = {
  RESOLVER_LABEL: "test",
  ASSETS: { fetch: async () => new Response("asset") },
} as unknown as Env;

const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
};

describe("HTTP binding", () => {
  it("maps unsupported methods to the DIF HTTP status", async () => {
    const res = await app.request(
      "/1.0/identifiers/did%3Aunknown%3A123",
      {},
      env,
      ctx,
    );
    expect(res.status).toBe(501);
    expect(
      ((await res.json()) as { didResolutionMetadata: { error: string } })
        .didResolutionMetadata.error,
    ).toBe("unsupportedDidMethod");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  it("maps a passed-through upstream METHOD_NOT_SUPPORTED to HTTP 501", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          {
            didDocument: null,
            didResolutionMetadata: {
              error: { type: "METHOD_NOT_SUPPORTED" },
            },
            didDocumentMetadata: {},
          },
          { status: 501 },
        ),
      ),
    );
    const upstreamEnv = {
      ...env,
      GODIDDY_RESOLVER: "https://godiddy.test",
      ARCHON_RESOLVER: "https://archon.test",
    };
    const res = await app.request(
      "/1.0/identifiers/did%3Acheqd%3Amainnet%3APs1ysXP2Ae6GBfxNhNQNKN",
      {},
      upstreamEnv,
      ctx,
    );
    expect(res.status).toBe(501);
    expect(
      ((await res.json()) as { didResolutionMetadata: { error: string } })
        .didResolutionMetadata.error,
    ).toBe("methodNotSupported");
    vi.unstubAllGlobals();
  });

  it("serves MCP over POST and rejects GET", async () => {
    expect((await app.request("/mcp", {}, env, ctx)).status).toBe(405);
    const res = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      },
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    expect(
      ((await res.json()) as { result: { tools: unknown[] } }).result.tools,
    ).toHaveLength(4);
  });

  it("validates MCP media types and actual body size", async () => {
    expect(
      (await app.request("/mcp", { method: "POST", body: "{}" }, env, ctx))
        .status,
    ).toBe(415);
    const oversized = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ping",
      padding: "x".repeat(65 * 1024),
    });
    const response = await app.request(
      "/mcp",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: oversized,
      },
      env,
      ctx,
    );
    expect(response.status).toBe(413);
  });

  it("rate-limits root DID deep links and hashes limiter identities", async () => {
    let key = "";
    const limitedEnv = {
      ...env,
      RESOLUTION_RATE_LIMITER: {
        limit: async ({ key: value }: { key: string }) => {
          key = value;
          return { success: false };
        },
      },
    };
    const response = await app.request(
      "/did:web:example.com",
      {
        headers: {
          accept: "application/json",
          authorization: "Bearer secret-token",
        },
      },
      limitedEnv,
      ctx,
    );
    expect(response.status).toBe(429);
    expect(key).toMatch(/^auth:[a-f0-9]{64}$/);
    expect(key).not.toContain("secret-token");
  });

  it("enforces the configured edge limiter", async () => {
    const limitedEnv = {
      ...env,
      RESOLUTION_RATE_LIMITER: { limit: async () => ({ success: false }) },
    };
    const res = await app.request(
      "/1.0/identifiers/did%3Aweb%3Aexample.com",
      {},
      limitedEnv,
      ctx,
    );
    expect(res.status).toBe(429);
  });
});

describe("/methods DIF badge enrichment", () => {
  const request = (extra: Partial<Env>) =>
    app.request(
      "/methods",
      { headers: { accept: "application/json" } },
      { ...(env as object), ...extra } as Env,
      ctx,
    );

  it("serves fallback recommended badges when D1 is absent", async () => {
    resetDifBadgesCache();
    const res = await request({});
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      dif: { recommended: { id: string }[]; endorsed: unknown[] };
    };
    expect(body.dif.recommended.map((r) => r.id)).toEqual([
      "cid",
      "ethr",
      "hedera",
      "webplus",
      "webvh",
    ]);
    expect(body.dif.endorsed).toEqual([]);
  });

  it("serves synced sets when D1 holds a valid current-version registry", async () => {
    resetDifBadgesCache();
    const stored = JSON.stringify({
      v: 2,
      syncedAt: 7,
      recommended: [{ id: "webvh", url: "https://x/findings-did-webvh.md" }],
      endorsed: [{ id: "cid", url: "https://x/endorsed.md" }],
    });
    const DB = {
      prepare: () => ({ first: async () => ({ value: stored }) }),
    } as unknown as Env["DB"];
    const res = await request({ DB });
    const body = (await res.json()) as {
      dif: { syncedAt: number; recommended: { id: string }[] };
    };
    expect(body.dif.syncedAt).toBe(7);
    expect(body.dif.recommended.map((r) => r.id)).toEqual(["webvh"]);
  });

  it("still answers when the D1 read throws", async () => {
    resetDifBadgesCache();
    const DB = {
      prepare: () => ({
        first: async () => {
          throw new Error("no such table: directory_store");
        },
      }),
    } as unknown as Env["DB"];
    const res = await request({ DB });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { dif: { recommended: unknown[] } };
    expect(body.dif.recommended.length).toBeGreaterThan(0);
  });
});
