import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DIDResolutionResult } from "did-resolver";
import {
  getResolver,
  resetChainIdCache,
  unpackDidDocument,
} from "../resolver.js";
import {
  IOTA_MAINNET_CHAIN_ID,
  IOTA_NOT_EXISTS,
  IOTA_SERVICE_DID,
  IOTA_SERVICE_OBJECT,
  IOTA_VM_DID,
  IOTA_VM_OBJECT,
} from "./fixture.js";

type RpcHandler = (method: string, params: unknown[]) => unknown;

/** Serve JSON-RPC from a handler; chain-id answered from the fixture. */
function mockRpc(handler: RpcHandler, chainId = IOTA_MAINNET_CHAIN_ID) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: unknown[];
      };
      const result =
        body.method === "iota_getChainIdentifier"
          ? chainId
          : handler(body.method, body.params);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        headers: { "content-type": "application/json" },
      });
    });
}

async function resolve(
  did: string,
  handler: RpcHandler,
  chainId?: string,
): Promise<DIDResolutionResult> {
  mockRpc(handler, chainId);
  const registry = getResolver();
  return (await registry.iota(
    did,
    { did, didUrl: did, method: "iota", id: "x", params: {} } as never,
    {} as never,
    {},
  )) as DIDResolutionResult;
}

beforeEach(() => resetChainIdCache());
afterEach(() => vi.restoreAllMocks());

describe("did:iota resolution", () => {
  it("resolves a live mainnet Identity with a verification method", async () => {
    const result = await resolve(IOTA_VM_DID, () => IOTA_VM_OBJECT);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument!;
    expect(doc.id).toBe(IOTA_VM_DID);
    expect(doc["@context"]).toBe("https://www.w3.org/ns/did/v1");
    const vm = doc.verificationMethod![0];
    expect(vm.id).toBe(
      `${IOTA_VM_DID}#9zwCeRtPnbwJOxkWG51yoP4oEcMjkQIA0G9R7uqL6zw`,
    );
    expect(vm.controller).toBe(IOTA_VM_DID);
    expect(vm.type).toBe("JsonWebKey2020");
    expect(vm.publicKeyJwk?.crv).toBe("Ed25519");
    expect(doc.service?.[0].type).toBe("LinkedDomains");
    expect(result.didDocumentMetadata).toMatchObject({
      network: "iota",
      deactivated: false,
      created: "2025-12-16T03:03:56Z",
    });
  });

  it("resolves a service-only Identity and substitutes every placeholder", async () => {
    const result = await resolve(IOTA_SERVICE_DID, () => IOTA_SERVICE_OBJECT);
    const doc = result.didDocument!;
    expect(doc.id).toBe(IOTA_SERVICE_DID);
    expect(doc.service?.[0].id).toBe(`${IOTA_SERVICE_DID}#digital-checkbook`);
    expect(JSON.stringify(doc)).not.toContain("did:0:0");
  });

  it("answers notFound for an id that names no object", async () => {
    const result = await resolve(
      "did:iota:0x" + "1".repeat(64),
      () => IOTA_NOT_EXISTS,
    );
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("normalizes a chain-id network segment to its alias", async () => {
    const did = `did:iota:${IOTA_MAINNET_CHAIN_ID}:${IOTA_VM_DID.split(":")[2]}`;
    const result = await resolve(did, () => IOTA_VM_OBJECT);
    expect(result.didDocument!.id).toBe(IOTA_VM_DID);
    expect(result.didDocumentMetadata.canonicalId).toBe(IOTA_VM_DID);
  });

  it("rejects malformed DIDs without any network call", async () => {
    const spy = mockRpc(() => IOTA_VM_OBJECT);
    const registry = getResolver();
    for (const bad of [
      "did:iota:0x1234",
      "did:iota:mainnet:extra:0x" + "a".repeat(64),
      "did:iota:not-hex!!:0x" + "a".repeat(64),
      "did:iota:0x" + "g".repeat(64),
    ]) {
      const result = (await registry.iota(
        bad,
        {} as never,
        {} as never,
        {},
      )) as DIDResolutionResult;
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("reports notConfigured for an unknown network with no endpoint", async () => {
    const result = await resolve(
      "did:iota:customnet:0x" + "a".repeat(64),
      () => IOTA_VM_OBJECT,
    );
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
  });

  it("refuses an endpoint serving the wrong chain", async () => {
    const result = await resolve(IOTA_VM_DID, () => IOTA_VM_OBJECT, "deadbeef");
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("deadbeef");
  });

  it("rejects an object outside the published identity packages", async () => {
    const forged = JSON.parse(JSON.stringify(IOTA_VM_OBJECT)) as {
      data: { type: string };
    };
    forged.data.type = `0x${"9".repeat(64)}::identity::Identity`;
    const result = await resolve(IOTA_VM_DID, () => forged);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("rejects a non-Identity Move object", async () => {
    const forged = JSON.parse(JSON.stringify(IOTA_VM_OBJECT)) as {
      data: { type: string };
    };
    forged.data.type = `0x${"9".repeat(64)}::coin::Coin`;
    const result = await resolve(IOTA_VM_DID, () => forged);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("reports a deleted_did Identity as deactivated with no document", async () => {
    const deleted = JSON.parse(JSON.stringify(IOTA_VM_OBJECT)) as {
      data: { content: { fields: Record<string, unknown> } };
    };
    deleted.data.content.fields.deleted_did = true;
    const result = await resolve(IOTA_VM_DID, () => deleted);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("falls through transport failures to the next endpoint", async () => {
    let calls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      calls++;
      if (String(input).includes("first.example")) {
        return new Response("busy", { status: 503 });
      }
      const body = JSON.parse(String(init?.body)) as { method: string };
      const result =
        body.method === "iota_getChainIdentifier"
          ? IOTA_MAINNET_CHAIN_ID
          : IOTA_VM_OBJECT;
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    const registry = getResolver({
      rpcUrls: { iota: ["https://first.example", "https://second.example"] },
    });
    const result = (await registry.iota(
      IOTA_VM_DID,
      {} as never,
      {} as never,
      {},
    )) as DIDResolutionResult;
    expect(result.didDocument!.id).toBe(IOTA_VM_DID);
    expect(calls).toBeGreaterThan(1);
  });
});

describe("unpackDidDocument", () => {
  const pack = (payload: string, header?: number[]): Uint8Array => {
    const body = new TextEncoder().encode(payload);
    const head = header ?? [
      0x44,
      0x49,
      0x44,
      1,
      0,
      body.length & 0xff,
      body.length >> 8,
    ];
    return Uint8Array.from([...head, ...body]);
  };

  it("unpacks a well-formed payload", () => {
    const unpacked = unpackDidDocument(
      pack(
        '{"doc":{"id":"did:0:0"},"meta":{"created":"2026-01-01T00:00:00Z"}}',
      ),
    );
    expect(unpacked).toMatchObject({
      doc: { id: "did:0:0" },
      meta: { created: "2026-01-01T00:00:00Z" },
    });
  });

  it("rejects bad magic, version, encoding, and length", () => {
    expect(unpackDidDocument(Uint8Array.from([1, 2]))).toContain("too short");
    expect(
      unpackDidDocument(pack('{"doc":{}}', [0x58, 0x49, 0x44, 1, 0, 10, 0])),
    ).toContain("magic");
    expect(
      unpackDidDocument(pack('{"doc":{}}', [0x44, 0x49, 0x44, 2, 0, 10, 0])),
    ).toContain("version");
    expect(
      unpackDidDocument(pack('{"doc":{}}', [0x44, 0x49, 0x44, 1, 9, 10, 0])),
    ).toContain("encoding");
    expect(
      unpackDidDocument(pack('{"doc":{}}', [0x44, 0x49, 0x44, 1, 0, 99, 0])),
    ).toContain("length");
    expect(unpackDidDocument(pack("not json"))).toContain("JSON");
    expect(unpackDidDocument(pack('{"nodoc":1}'))).toContain("no document");
  });
});
