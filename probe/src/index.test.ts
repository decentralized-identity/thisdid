import { afterEach, expect, it, vi } from "vitest";
import { fold, probeOne } from "./index";

type ProbeEnv = Parameters<typeof probeOne>[1];

afterEach(() => vi.unstubAllGlobals());

it("trips a provider down after three all-failed probe rounds and recovers on success", () => {
  const failed = [
    {
      step: "archon" as const,
      did: "did:iden3:test",
      ok: false,
      ms: 8000,
      error: "timeout",
    },
  ];
  const one = fold(null, failed, 1);
  const two = fold(one, failed, 2);
  const three = fold(two, failed, 3);
  expect(three.providers.archon?.status).toBe("down");
  const recovered = fold(
    three,
    [{ ...failed[0], ok: true, ms: 100, error: null }],
    4,
  );
  expect(recovered.providers.archon?.status).toBe("up");
  expect(recovered.providers.archon?.consecutiveFails).toBe(0);
});

it("probes Godiddy via the health endpoint, never the resolver API", async () => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://health.test/health");
      // The probe authenticates exactly like live resolution traffic.
      expect(
        (init?.headers as Record<string, string> | undefined)?.authorization,
      ).toBe("Bearer probe-key");
      return new Response("OK");
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  const result = await probeOne({ step: "godiddy", did: "health:godiddy" }, {
    GODIDDY_HEALTH: "https://health.test/health",
    GODIDDY_API_KEY: "probe-key",
  } as ProbeEnv);
  expect(result.ok).toBe(true);
  expect(result.error).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("counts a throttled (429) Godiddy as up, flagged rateLimited", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("slow down", { status: 429 })),
  );
  const result = await probeOne(
    { step: "godiddy", did: "health:godiddy" },
    {} as ProbeEnv,
  );
  expect(result.ok).toBe(true);
  expect(result.error).toBe("rateLimited");
});

it("counts a failing Godiddy health endpoint as a miss", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("boom", { status: 503 })),
  );
  const result = await probeOne(
    { step: "godiddy", did: "health:godiddy" },
    {} as ProbeEnv,
  );
  expect(result.ok).toBe(false);
  expect(result.error).toBe("miss");
});

it("counts a rate-limited canary resolution as up for any upstream", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("slow down", { status: 429 })),
  );
  const result = await probeOne({ step: "archon", did: "did:iden3:test" }, {
    ARCHON_RESOLVER: "https://archon.test",
  } as ProbeEnv);
  expect(result.ok).toBe(true);
  expect(result.error).toBe("rateLimited");
});
