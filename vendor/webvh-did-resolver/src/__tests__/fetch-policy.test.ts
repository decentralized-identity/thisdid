import { describe, expect, it, vi } from "vitest";
import { boundedFetch, FetchPolicyError } from "../fetch-policy.js";

const HOST = "https://example.com/.well-known/did.jsonl";

const redirectTo = (location: string, status = 302) =>
  new Response(null, { status, headers: { location } });

describe("boundedFetch", () => {
  it("issues every hop with manual redirects under one abort signal", async () => {
    const inner = vi.fn<typeof fetch>(async (url) =>
      String(url).endsWith("hop") ? new Response("ok") : redirectTo("/hop"),
    );
    const response = await boundedFetch({ fetch: inner })(HOST);
    expect(await response.text()).toBe("ok");
    expect(inner).toHaveBeenCalledTimes(2);
    const [first, second] = inner.mock.calls.map(([, init]) => init);
    expect(first).toMatchObject({ redirect: "manual" });
    expect(first?.signal).toBeInstanceOf(AbortSignal);
    expect(second?.signal).toBe(first?.signal);
  });

  it("stops after the redirect limit", async () => {
    const inner = vi.fn<typeof fetch>(async (url) =>
      redirectTo(`${String(url)}x`),
    );
    await expect(
      boundedFetch({ fetch: inner, maxRedirects: 2 })(HOST),
    ).rejects.toThrow("more than 2 redirects");
    expect(inner).toHaveBeenCalledTimes(3);
  });

  it("refuses http:// and private destinations, on the first hop and on redirects", async () => {
    const inner = vi.fn<typeof fetch>(async () =>
      redirectTo("http://example.com/did.jsonl"),
    );
    await expect(boundedFetch({ fetch: inner })(HOST)).rejects.toThrow(
      "http: is not https:",
    );
    await expect(
      boundedFetch({ fetch: inner })("https://10.0.0.1/did.jsonl"),
    ).rejects.toBeInstanceOf(FetchPolicyError);
    expect(inner).toHaveBeenCalledTimes(1);
  });

  it("permits http:// and private destinations only with allowPrivateHosts", async () => {
    const inner = vi.fn<typeof fetch>(async () => new Response("ok"));
    const response = await boundedFetch({
      fetch: inner,
      allowPrivateHosts: true,
    })("http://127.0.0.1:8080/did.jsonl");
    expect(await response.text()).toBe("ok");
  });

  it("refuses a declared length above the limit without reading the body", async () => {
    const inner = vi.fn<typeof fetch>(
      async () =>
        new Response("x", { headers: { "content-length": "999999" } }),
    );
    await expect(
      boundedFetch({ fetch: inner, maxResponseBytes: 100 })(HOST),
    ).rejects.toThrow("exceeds 100 bytes");
  });

  it("times out while the body is still streaming", async () => {
    const inner = vi.fn<typeof fetch>(
      async (_url, init) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("partial"));
              init?.signal?.addEventListener("abort", () =>
                controller.error(new Error("aborted")),
              );
            },
          }),
        ),
    );
    const response = await boundedFetch({ fetch: inner, timeoutMs: 20 })(HOST);
    await expect(response.text()).rejects.toThrow("timed out after 20 ms");
  });

  it("passes a response without a body straight through", async () => {
    const inner = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    const response = await boundedFetch({ fetch: inner })(HOST);
    expect(response.status).toBe(204);
  });
});
