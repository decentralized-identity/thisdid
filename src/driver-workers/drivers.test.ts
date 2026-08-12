import { describe, expect, it } from "vitest";

import ethrWorker from "./ethr";
import keyWorker from "./key";
import peerWorker from "./peer";
import pkhWorker from "./pkh";
import webWorker from "./web";
import type { DriverResponseV1 } from "./contract";

async function resolve(
  worker: { fetch(request: Request, env: never): Promise<Response> },
  did: string,
  env: unknown = {},
): Promise<DriverResponseV1> {
  const request = new Request("https://driver.internal/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ protocol: 1, did }),
  });
  const response = await worker.fetch(request, env as never);
  expect(response.status).toBe(200);
  return (await response.json()) as DriverResponseV1;
}

describe("Tier 1 driver Workers", () => {
  it("resolves an Ed25519 did:key vector offline", async () => {
    const did = "did:key:z6MktvqCyLxTsXUH1tUZncNdVeEZ7hNh7npPRbUU27GTrYb8";
    const body = await resolve(keyWorker, did);
    expect(body.driver).toMatchObject({
      method: "key",
      packageName: "key-did-resolver",
      packageVersion: "4.0.0",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("resolves a CAIP-10 did:pkh vector offline", async () => {
    const did = "did:pkh:eip155:1:0xab16a96d359ec26a11e2c2b3d8f8b8942d5bfcdb";
    expect((await resolve(pkhWorker, did)).result.didDocument?.id).toBe(did);
  });

  it("resolves a numalgo 0 did:peer vector offline", async () => {
    const did = "did:peer:0z6MkqRYqQiSgvZQdnBytw86Qbs2ZWUkGv22od935YF4s8M7V";
    expect((await resolve(peerWorker, did)).result.didDocument?.id).toBe(did);
  });

  it("does not expose a public-style GET route", async () => {
    const response = await webWorker.fetch(
      new Request("https://driver.internal/resolve"),
      {},
    );
    expect(response.status).toBe(404);
  });

  it("fails closed when the ethr network secret is absent", async () => {
    const body = await resolve(
      ethrWorker,
      "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
    );
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("rejects a DID for another method at the driver boundary", async () => {
    const body = await resolve(keyWorker, "did:web:example.com");
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
  });
});
