import { describe, expect, it } from "vitest";
import {
  DestinationGuardError,
  detectRuntime,
  settleDestinationGuard,
} from "../destination-guard.js";

const aFetch = (() =>
  Promise.reject(new Error("unused"))) as unknown as typeof fetch;

describe("runtime detection", () => {
  it("recognises Cloudflare Workers before Node compatibility shims", () => {
    expect(
      detectRuntime({
        navigator: { userAgent: "Cloudflare-Workers" },
        process: { versions: { node: "22.0.0" } },
      }),
    ).toBe("workers");
  });
  it("recognises Node", () => {
    expect(detectRuntime({ process: { versions: { node: "22.0.0" } } })).toBe(
      "node",
    );
  });
  it("treats anything else as unknown", () => {
    expect(detectRuntime({})).toBe("unknown");
    expect(detectRuntime({ navigator: { userAgent: "Mozilla/5.0" } })).toBe(
      "unknown",
    );
  });
  it("detects this test process as Node", () => {
    expect(detectRuntime()).toBe("node");
  });
});

describe("settling the destination guard", () => {
  it("defaults to the connect-time guard on Node and the platform on Workers", () => {
    expect(settleDestinationGuard({}, "node")).toBe("node");
    expect(settleDestinationGuard({}, "workers")).toBe("platform");
  });
  it("refuses to guess in an unknown runtime", () => {
    expect(() => settleDestinationGuard({}, "unknown")).toThrow(
      DestinationGuardError,
    );
  });
  it("honours an explicit declaration anywhere", () => {
    expect(
      settleDestinationGuard({ destinationGuard: "caller" }, "unknown"),
    ).toBe("caller");
    expect(
      settleDestinationGuard({ destinationGuard: "platform" }, "node"),
    ).toBe("platform");
    expect(
      settleDestinationGuard(
        { destinationGuard: "caller", fetch: aFetch },
        "node",
      ),
    ).toBe("caller");
  });
  it("never lets a custom fetch through without a declaration", () => {
    for (const runtime of ["node", "workers", "unknown"] as const) {
      expect(() => settleDestinationGuard({ fetch: aFetch }, runtime)).toThrow(
        DestinationGuardError,
      );
    }
  });
  it('rejects "node" combined with a custom fetch, which it could not guard', () => {
    expect(() =>
      settleDestinationGuard(
        { destinationGuard: "node", fetch: aFetch },
        "node",
      ),
    ).toThrow(DestinationGuardError);
  });
  it("needs no guard when private hosts are allowed", () => {
    expect(settleDestinationGuard({ allowPrivateHosts: true }, "unknown")).toBe(
      "caller",
    );
    expect(
      settleDestinationGuard(
        { allowPrivateHosts: true, fetch: aFetch },
        "node",
      ),
    ).toBe("caller");
    expect(
      settleDestinationGuard(
        { allowPrivateHosts: true, destinationGuard: "node" },
        "node",
      ),
    ).toBe("node");
  });
});
