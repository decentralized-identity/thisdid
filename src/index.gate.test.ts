import { describe, expect, it, vi } from "vitest";
import type { Env } from "./types";

// The HTTP routes must refuse non-DIDs before resolution: the resolver is
// replaced by one that fails the test if it is ever reached.
vi.mock("./resolve", () => ({
  resolveDid: vi.fn(async () => {
    throw new Error("resolveDid must not be reached for a non-DID");
  }),
}));

const { default: app } = await import("./index");
const { resolveDid } = await import("./resolve");

const env = {
  RESOLVER_LABEL: "test",
  ASSETS: { fetch: async () => new Response("asset") },
} as unknown as Env;
const ctx = {
  waitUntil: () => {},
  passThroughOnException: () => {},
  props: {},
};

describe("HTTP routes refuse non-DIDs before resolution", () => {
  it("never calls the resolver for scanner payloads", async () => {
    for (const input of [
      "file:///etc/passwd",
      "http://bxss.me/t/fit.txt?.jpg",
      "did:web:example.com?q=<script>",
    ]) {
      const res = await app.request(
        `/1.0/identifiers/${encodeURIComponent(input)}`,
        {},
        env,
        ctx,
      );
      expect(res.status, input).toBe(400);
    }
    const deepLink = await app.request(
      "/did:WEB:example.com",
      { headers: { accept: "application/did+json" } },
      env,
      ctx,
    );
    expect(deepLink.status).toBe(400);
    expect(resolveDid).not.toHaveBeenCalled();
  });
});
