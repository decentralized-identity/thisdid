import { describe, expect, it } from "vitest";
import app from "./index";
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
