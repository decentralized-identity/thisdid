import { afterEach, describe, expect, it, vi } from "vitest";
import axios from "axios";

import cheqdWorker from "./cheqd";
import dnsWorker from "./dns";
import ebsiWorker from "./ebsi";
import ensWorker from "./ens";
import ethrWorker from "./ethr";
import jwkWorker from "./jwk";
import keyWorker from "./key";
import nearWorker from "./near";
import peerWorker from "./peer";
import pkhWorker from "./pkh";
import plcWorker from "./plc";
import webWorker from "./web";
import webvhWorker from "./webvh";
import type { DriverResponseV1 } from "./contract";
import { createDriverWorker } from "./runtime";

afterEach(() => vi.unstubAllGlobals());

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
  it("can create a fresh resolver for each stateless Worker request", async () => {
    let registries = 0;
    const worker = createDriverWorker({
      method: "test",
      packageName: "test-driver",
      packageVersion: "1.0.0",
      cacheResolver: false,
      registry: () => {
        registries++;
        return {
          test: async (did: string) => ({
            didResolutionMetadata: {},
            didDocument: { id: did },
            didDocumentMetadata: {},
          }),
        };
      },
    });

    await resolve(worker, "did:test:first");
    await resolve(worker, "did:test:second");
    expect(registries).toBe(2);
  });

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

  it("resolves a did:plc document from the configured directory", async () => {
    const did = "did:plc:z72i7hdynmk6r22z27h6tvur";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(
          `https://plc.test/${encodeURIComponent(did)}`,
        );
        return Response.json({ id: did });
      }),
    );
    const body = await resolve(plcWorker, did, {
      PLC_DIRECTORY_URL: "https://plc.test",
    });
    expect(body.driver).toMatchObject({
      method: "plc",
      packageName: "@thisdid/plc-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("maps a plc directory 404 to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const body = await resolve(plcWorker, "did:plc:aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(body.result.didResolutionMetadata.error).toBe("notFound");
    expect(body.result.didDocument).toBeNull();
  });

  it("fails a webvh resolution when the DID log is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("not found", { status: 404 })),
    );
    const body = await resolve(
      webvhWorker,
      "did:webvh:QmUnreachableScid1234:example.com",
    );
    expect(body.driver).toMatchObject({
      method: "webvh",
      packageName: "@thisdid/webvh-did-resolver",
    });
    expect(body.result.didDocument).toBeNull();
    expect(body.result.didResolutionMetadata.error).toBe("notFound");
  });

  it("rejects a non-webvh DID at the webvh driver boundary", async () => {
    const body = await resolve(webvhWorker, "did:web:example.com");
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
  });

  it("fails closed when the ebsi registry var is absent", async () => {
    const body = await resolve(ebsiWorker, "did:ebsi:zZeKyEJfUTGwajhNyNX928z");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("resolves a did:ebsi legal entity from the configured registry", async () => {
    // The EBSI package resolves over axios; its hoisted instance is shared, so
    // pointing it at the fetch adapter lets the stubbed global fetch serve the
    // registry document offline while the real package code runs.
    const did = "did:ebsi:zZeKyEJfUTGwajhNyNX928z";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      expect(url).toBe(`https://registry.test/${did}`);
      return Response.json({
        "@context": ["https://www.w3.org/ns/did/v1"],
        id: did,
        controller: [did],
        verificationMethod: [
          {
            id: `${did}#key-1`,
            type: "JsonWebKey2020",
            controller: did,
            publicKeyJwk: { crv: "secp256k1", kty: "EC", x: "x", y: "y" },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const originalAdapter = axios.defaults.adapter;
    axios.defaults.adapter = "fetch";
    try {
      const body = await resolve(ebsiWorker, did, {
        EBSI_DID_REGISTRY: "https://registry.test",
      });
      expect(body.driver).toMatchObject({
        method: "ebsi",
        packageName: "@cef-ebsi/ebsi-did-resolver",
      });
      expect(body.result.didResolutionMetadata.error).toBeUndefined();
      expect(body.result.didDocument?.id).toBe(did);
      expect(fetchMock).toHaveBeenCalledOnce();
    } finally {
      axios.defaults.adapter = originalAdapter;
    }
  });

  it("resolves a NEAR implicit account offline through the vendored driver", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const did =
      "did:near:98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de";
    const body = await resolve(nearWorker, did, {
      NEAR_RPC_MAINNET_URL: "https://rpc.main.test",
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.driver).toMatchObject({
      method: "near",
      packageName: "@thisdid/near-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    expect(body.result.didDocument?.verificationMethod?.[0]?.type).toBe(
      "Ed25519VerificationKey2018",
    );
  });

  it("resolves the did:jwk P-256 spec vector offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const did =
      "did:jwk:eyJjcnYiOiJQLTI1NiIsImt0eSI6IkVDIiwieCI6ImFjYklRaXVNczNpOF91c3pFakoydHBUdFJNNEVVM3l6OTFQSDZDZEgyVjAiLCJ5IjoiX0tjeUxqOXZXTXB0bm1LdG00NkdxRHo4d2Y3NEk1TEtncmwyR3pIM25TRSJ9";
    const body = await resolve(jwkWorker, did);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(body.driver).toMatchObject({
      method: "jwk",
      packageName: "@thisdid/jwk-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    expect(body.result.didDocument?.verificationMethod?.[0]?.id).toBe(
      `${did}#0`,
    );
  });

  it("rejects a did:jwk embedding private key material", async () => {
    const did =
      "did:jwk:" +
      Buffer.from(
        JSON.stringify({
          kty: "OKP",
          crv: "Ed25519",
          x: "O2onvM62pC1io6jQKm8Nc2UyFXcd4kOmOsBIoYtZ2ik",
          d: "nWGxne_9WmC6hEr0kuwsxERJxWl7MmkZcDusAxyuf2A",
        }),
      ).toString("base64url");
    const body = await resolve(jwkWorker, did);
    expect(body.result.didResolutionMetadata.error).toBe("invalidDid");
    expect(body.result.didDocument).toBeNull();
  });

  it("resolves did:cheqd through the configured cheqd resolver", async () => {
    const did = "did:cheqd:mainnet:Ps1ysXP2Ae6GBfxNhNQNKN";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("resolver.cheqd.net/1.0/identifiers");
        return Response.json({
          didDocument: { id: did, verificationMethod: [] },
          didResolutionMetadata: {},
          didDocumentMetadata: { versionId: "v1" },
        });
      }),
    );
    const body = await resolve(cheqdWorker, did);
    expect(body.driver).toMatchObject({
      method: "cheqd",
      packageName: "@thisdid/cheqd-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
  });

  it("resolves did:dns over DoH with offline did:key recursion", async () => {
    const did = "did:dns:danubetech.com";
    const HEX =
      "\\# 60 00 64 00 0a 64 69 64 3a 6b 65 79 3a 7a 36 4d 6b 6a 76 42 6b 74 38 45 54 6e 78 58 47 42 46 50 53 47 67 59 4b 62 34 33 71 37 6f 4e 48 4c 58 38 42 69 59 53 50 63 58 56 47 36 67 59 36";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const name = new URL(String(input)).searchParams.get("name");
        return Response.json(
          name === "_key1._did.danubetech.com"
            ? { Status: 0, Answer: [{ name, type: 256, data: HEX }] }
            : { Status: 0 },
        );
      }),
    );
    const body = await resolve(dnsWorker, did);
    expect(body.driver).toMatchObject({
      method: "dns",
      packageName: "@thisdid/dns-did-resolver",
    });
    expect(body.result.didDocument?.id).toBe(did);
    expect(body.result.didDocument?.verificationMethod?.[0]?.id).toBe(
      `${did}#key1`,
    );
  });

  it("fails closed when the ens RPC secret is absent", async () => {
    const body = await resolve(ensWorker, "did:ens:vitalik.eth");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });

  it("fails closed when no NEAR RPC endpoint is configured", async () => {
    const body = await resolve(nearWorker, "did:near:alice.near");
    expect(body.result.didResolutionMetadata.error).toBe("internalError");
    expect(body.result.didDocument).toBeNull();
  });
});
