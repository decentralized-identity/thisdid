import { afterEach, describe, expect, it, vi } from "vitest";
import type { DIDResolutionResult } from "did-resolver";
import { decodeDidDocument, encodeRequest, getResolver } from "../resolver.js";
import {
  EMPE_MISS_RESPONSE,
  EMPE_OK_RESPONSE,
  EMPE_TESTNET_DID,
} from "./fixture.js";

function mockAbci(handler: (url: string) => unknown) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const abci = handler(String(input));
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: -1, result: { response: abci } }),
      { headers: { "content-type": "application/json" } },
    );
  });
}

async function resolve(
  did: string,
  handler: (url: string) => unknown = () => EMPE_OK_RESPONSE,
): Promise<DIDResolutionResult> {
  mockAbci(handler);
  const registry = getResolver();
  return (await registry.empe(
    did,
    {} as never,
    {} as never,
    {},
  )) as DIDResolutionResult;
}

afterEach(() => vi.restoreAllMocks());

describe("did:empe resolution", () => {
  it("resolves the live testnet capture into a DID Core document", async () => {
    const result = await resolve(EMPE_TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument!;
    expect(doc.id).toBe(EMPE_TESTNET_DID);
    expect(doc["@context"]).toBe("https://www.w3.org/ns/did/v1");
    expect(doc.verificationMethod).toHaveLength(2);
    const [primary, backup] = doc.verificationMethod!;
    expect(primary.id).toBe(`${EMPE_TESTNET_DID}#0`);
    expect(primary.type).toBe("JsonWebKey");
    expect(primary.controller).toBe(EMPE_TESTNET_DID);
    expect(primary.publicKeyJwk).toMatchObject({
      kty: "EC",
      crv: "secp256k1",
    });
    expect(backup.id).toBe(`${EMPE_TESTNET_DID}#backup`);
    expect(doc.authentication).toEqual([`${EMPE_TESTNET_DID}#0`]);
    expect(doc.assertionMethod).toEqual([`${EMPE_TESTNET_DID}#0`]);
    expect(result.didDocumentMetadata).toMatchObject({
      network: "testnet",
      deactivated: false,
    });
  });

  it("sends the hand-encoded request the chain validated live", async () => {
    let queried = "";
    await resolve(EMPE_TESTNET_DID, (url) => {
      queried = url;
      return EMPE_OK_RESPONSE;
    });
    expect(queried).toContain(
      "/abci_query?path=%22/empe.diddoc.Query/DidDocument%22",
    );
    expect(queried).toContain(`data=0x${encodeRequest(EMPE_TESTNET_DID)}`);
    // field 1, length-delimited, 57-byte DID
    expect(encodeRequest(EMPE_TESTNET_DID).slice(0, 4)).toBe("0a39");
  });

  it("maps the chain's not-found answer to notFound", async () => {
    const result = await resolve(
      "did:empe:testnet:" + "0".repeat(40),
      () => EMPE_MISS_RESPONSE,
    );
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("reports notConfigured for mainnet until endpoints exist", async () => {
    const spy = mockAbci(() => EMPE_OK_RESPONSE);
    const result = await resolve("did:empe:" + "a".repeat(40));
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects malformed DIDs without any network call", async () => {
    const spy = mockAbci(() => EMPE_OK_RESPONSE);
    const registry = getResolver();
    for (const bad of [
      "did:empe:testnet:short",
      "did:empe:testnet:" + "A".repeat(40),
      "did:empe:mainnet:" + "a".repeat(40),
      "did:empe:a:b:" + "a".repeat(40),
    ]) {
      const result = (await registry.empe(
        bad,
        {} as never,
        {} as never,
        {},
      )) as DIDResolutionResult;
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a document whose id names another DID or network", async () => {
    const result = await resolve(
      "did:empe:testnet:" + "1".repeat(40),
      () => EMPE_OK_RESPONSE,
    );
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("falls through transport failures to the next endpoint", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls++;
      if (String(input).includes("first.example")) {
        return new Response("busy", { status: 503 });
      }
      return new Response(
        JSON.stringify({ result: { response: EMPE_OK_RESPONSE } }),
      );
    });
    const registry = getResolver({
      rpcUrls: {
        testnet: ["https://first.example", "https://second.example"],
      },
    });
    const result = (await registry.empe(
      EMPE_TESTNET_DID,
      {} as never,
      {} as never,
      {},
    )) as DIDResolutionResult;
    expect(result.didDocument!.id).toBe(EMPE_TESTNET_DID);
    expect(calls).toBe(2);
  });

  it("surfaces unexpected chain errors as networkError", async () => {
    const result = await resolve(EMPE_TESTNET_DID, () => ({
      code: 3,
      log: "internal",
      value: null,
    }));
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});

describe("decodeDidDocument", () => {
  it("rejects malformed protobuf and empty ids", () => {
    expect(decodeDidDocument(Uint8Array.from([0xff, 0xff]))).toContain(
      "malformed",
    );
    expect(decodeDidDocument(Uint8Array.from([]))).toContain("no id");
  });
});
