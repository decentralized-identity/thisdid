import { describe, expect, it, vi } from "vitest";
import type { Env } from "./types";

// Resolution is replaced by a fixed answer: this file checks only what the
// routes hand to analytics.
vi.mock("./resolve", () => ({
  resolveDid: vi.fn(async () => ({
    didResolutionMetadata: { provider: "goplausible" },
    didDocument: { id: "did:algo:x" },
    didDocumentMetadata: {},
  })),
}));

const { default: app } = await import("./index");

const LOWER =
  "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i";
const UPPER =
  "did:algo:UTI7PAASILRDA3ISHY5M7J7LNRX2AIVQJWI7ZKCCGKVLMFD3VPR5PWSZ4I";

/** The `did` bound into each INSERT INTO resolutions for one request. */
async function recordedDids(path: string, accept?: string) {
  const dids: unknown[] = [];
  const pending: Promise<unknown>[] = [];
  const db = {
    prepare: (sql: string) => {
      const stmt = {
        bind: (...args: unknown[]) => {
          if (sql.includes("INSERT INTO resolutions")) dids.push(args[1]);
          return stmt;
        },
        run: async () => ({}),
        all: async () => ({ results: [] }),
      };
      return stmt;
    },
  };
  const env = {
    RESOLVER_LABEL: "test",
    ASSETS: { fetch: async () => new Response("asset") },
    DB: db,
  } as unknown as Env;
  const res = await app.request(
    path,
    accept ? { headers: { accept } } : {},
    env,
    {
      waitUntil: (p: Promise<unknown>) => void pending.push(p),
      passThroughOnException: () => {},
      props: {},
    },
  );
  expect(res.status).toBe(200);
  await Promise.all(pending);
  return dids;
}

describe("analytics records the canonical DID", () => {
  it("records a lower-case did:algo account as the upper-case DID", async () => {
    expect(
      await recordedDids(`/1.0/identifiers/${encodeURIComponent(LOWER)}`),
    ).toEqual([UPPER]);
    expect(await recordedDids(`/${LOWER}`, "application/did+json")).toEqual([
      UPPER,
    ]);
  });

  it("records other DIDs exactly as requested", async () => {
    const did = "did:web:Example.com";
    expect(
      await recordedDids(`/1.0/identifiers/${encodeURIComponent(did)}`),
    ).toEqual([did]);
  });
});
