import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FullNodeClient,
  RpcTransportError,
  SINGLETON_LAUNCHER_PUZZLE_HASH,
} from "../chain.js";
import { fromHex, toHex } from "../clvm.js";

afterEach(() => vi.unstubAllGlobals());

const COIN_ID = fromHex("11".repeat(32));

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
}

describe("response size is bounded while streaming", () => {
  it("rejects on content-length before reading a single chunk", async () => {
    const read = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const response = jsonResponse(
          { success: true },
          {
            "content-length": String(64 * 1024 * 1024),
          },
        );
        // Fail loudly if anything touches the body after the declared size
        // has already ruled it out.
        Object.defineProperty(response, "body", {
          get() {
            read();
            return null;
          },
        });
        return response;
      }),
    );
    const client = new FullNodeClient({ useSingletonInfo: false });
    await expect(client.getCoinRecordsByParentIds([COIN_ID])).rejects.toThrow(
      /over the .* limit/,
    );
    expect(read).not.toHaveBeenCalled();
  });

  it("stops reading and cancels once the limit is passed mid-stream", async () => {
    let emitted = 0;
    let cancelled = false;
    const chunk = new Uint8Array(1024 * 1024); // 1 MiB per pull
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              // No content-length: the bound has to come from the read loop.
              pull(controller) {
                emitted += 1;
                controller.enqueue(chunk);
              },
              cancel() {
                cancelled = true;
              },
            }),
            { status: 200 },
          ),
      ),
    );
    const client = new FullNodeClient({ useSingletonInfo: false });
    await expect(client.getCoinRecordsByParentIds([COIN_ID])).rejects.toThrow(
      RpcTransportError,
    );
    // Bounded at 4 MiB: a handful of chunks, not an unbounded buffer.
    expect(emitted).toBeLessThan(16);
    expect(cancelled).toBe(true);
  });
});

describe("transport failures are never absence", () => {
  it("propagates an HTTP error instead of reporting the coin absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad gateway", { status: 502 })),
    );
    const client = new FullNodeClient({ useSingletonInfo: false });
    await expect(client.getCoinRecordByName(COIN_ID)).rejects.toThrow(
      /HTTP 502/,
    );
  });

  it("propagates a non-JSON body instead of reporting the coin absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response("<html>maintenance</html>", { status: 200 }),
      ),
    );
    const client = new FullNodeClient({ useSingletonInfo: false });
    await expect(client.getCoinRecordByName(COIN_ID)).rejects.toThrow(
      /not JSON/,
    );
  });

  it("returns null only when the node itself reports absence", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          success: false,
          error: "Coin record not found",
          structuredError: { code: "COIN_RECORD_NOT_FOUND" },
        }),
      ),
    );
    const client = new FullNodeClient({ useSingletonInfo: false });
    await expect(client.getCoinRecordByName(COIN_ID)).resolves.toBeNull();
  });
});

describe("the Coinset fast path degrades without disabling itself wrongly", () => {
  it("stops asking a node that does not implement the extension", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/get_singleton_info")
        ? new Response("not found", { status: 404 })
        : jsonResponse({ success: true, coin_record: null }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = new FullNodeClient();
    expect(await client.getSingletonInfo(COIN_ID)).toBeNull();
    expect(await client.getSingletonInfo(COIN_ID)).toBeNull();
    const attempts = fetchMock.mock.calls.filter((call) =>
      String(call[0]).endsWith("/get_singleton_info"),
    );
    expect(attempts).toHaveLength(1);
  });

  it("keeps trying after a transient outage", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("connection reset");
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new FullNodeClient();
    expect(await client.getSingletonInfo(COIN_ID)).toBeNull();
    expect(await client.getSingletonInfo(COIN_ID)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("constants", () => {
  it("pins the standard singleton launcher puzzle hash", () => {
    expect(toHex(SINGLETON_LAUNCHER_PUZZLE_HASH)).toBe(
      "eff07522495060c066f66f32acc2a77e3a3e737aca8baea4d1a64ea4cdc13da9",
    );
  });
});
