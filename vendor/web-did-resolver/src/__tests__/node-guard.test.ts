import { describe, expect, it } from "vitest";
import { guardLookup, guardedFetch } from "../node-guard.js";

type Answer = { address: string; family: number };
const lookupWith = (answers: Answer[], allowPrivateHosts = false) =>
  guardLookup({ allowPrivateHosts, resolve: async () => answers });

function call(
  lookup: ReturnType<typeof guardLookup>,
  hostname: string,
  options: { all?: boolean } | undefined,
): Promise<{ error: Error | null; address?: unknown; family?: number }> {
  return new Promise((resolve) => {
    lookup(hostname, options, (error, address?, family?) =>
      resolve({ error, address, family }),
    );
  });
}

describe("connect-time destination guard (Node)", () => {
  it("refuses a public name that resolves to a private address", async () => {
    for (const address of [
      "127.0.0.1",
      "10.9.8.7",
      "169.254.169.254",
      "100.64.0.1",
      "198.18.0.1",
      "224.0.0.1",
      "240.0.0.1",
      "::1",
      "fd00::1",
      "::ffff:192.168.0.1",
      "64:ff9b::7f00:1",
      "2001:db8::1",
      "2002:c000:204::1",
    ]) {
      const { error } = await call(
        lookupWith([{ address, family: address.includes(":") ? 6 : 4 }]),
        "resolver.example",
        undefined,
      );
      expect(error?.message).toContain("resolves to non-global address");
    }
  });

  it("refuses when any one of several answers is private", async () => {
    const { error } = await call(
      lookupWith([
        { address: "93.184.216.34", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
      "resolver.example",
      { all: true },
    );
    expect(error?.message).toContain("127.0.0.1");
  });

  it("connects only to the addresses it validated", async () => {
    const answers = [
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ];
    const single = await call(
      lookupWith(answers),
      "resolver.example",
      undefined,
    );
    expect(single.error).toBeNull();
    expect(single.address).toBe("93.184.216.34");
    expect(single.family).toBe(4);
    const all = await call(lookupWith(answers), "resolver.example", {
      all: true,
    });
    expect(all.error).toBeNull();
    expect(all.address).toEqual(answers);
  });

  it("refuses names that do not resolve and surfaces resolver failures", async () => {
    expect(
      (await call(lookupWith([]), "nowhere.example", undefined)).error?.message,
    ).toContain("did not resolve");
    const failing = guardLookup({
      resolve: async () => {
        throw new Error("ENOTFOUND");
      },
    });
    expect(
      (await call(failing, "nowhere.example", undefined)).error?.message,
    ).toContain("ENOTFOUND");
  });

  it("allows private answers only when explicitly permitted", async () => {
    const { error, address } = await call(
      lookupWith([{ address: "127.0.0.1", family: 4 }], true),
      "localhost",
      undefined,
    );
    expect(error).toBeNull();
    expect(address).toBe("127.0.0.1");
  });

  it("produces a fetch function", () => {
    expect(typeof guardedFetch()).toBe("function");
  });
});
