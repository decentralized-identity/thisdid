import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";

const NETWORKS = {
  networks: [
    { networkId: "mainnet", rpcUrl: "https://rpc.main.test" },
    {
      networkId: "testnet",
      rpcUrl: "https://rpc.test.test",
      contractId: "registry.testnet",
    },
  ],
};

const IMPLICIT_HEX =
  "98793cd91a3f870fb126f66285808c7e094afcfc4eda8a970f6648cdf0dbd6de";

function rpcResponse(payload: unknown): Response {
  return Response.json({
    jsonrpc: "2.0",
    id: "near-did-resolver",
    ...(payload as object),
  });
}

function resolverFor(options = NETWORKS) {
  const registry = getResolver(options);
  return registry.near;
}

afterEach(() => vi.unstubAllGlobals());

describe("did:near resolver", () => {
  it("resolves an implicit account offline (no RPC call)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const did = `did:near:${IMPLICIT_HEX}`;
    const result = await resolverFor()(did, null as never, null as never, {});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.didDocument?.id).toBe(did);
    const vm = result.didDocument?.verificationMethod?.[0];
    expect(vm?.type).toBe("Ed25519VerificationKey2018");
    expect(vm?.publicKeyBase58).toBe(
      "BGCCDDHfysuuVnaNVtEhhqeT4k9Muyem3Kpgq2U1m9HX",
    );
  });

  it("resolves a named account through view_access_key_list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body)) as {
          params: Record<string, unknown>;
        };
        expect(body.params.request_type).toBe("view_access_key_list");
        expect(body.params.account_id).toBe("alice.near");
        return rpcResponse({
          result: {
            keys: [
              {
                public_key: "ed25519:AliceKeyOne",
                access_key: { permission: "FullAccess" },
              },
              {
                public_key: "ed25519:LimitedKey",
                access_key: { permission: { FunctionCall: {} } },
              },
              {
                public_key: "secp256k1:WrongCurveKey",
                access_key: { permission: "FullAccess" },
              },
              {
                public_key: "ed25519:AliceKeyTwo",
                access_key: { permission: "FullAccess" },
              },
            ],
          },
        });
      }),
    );
    const did = "did:near:alice.near";
    const result = await resolverFor()(did, null as never, null as never, {});
    const doc = result.didDocument;
    expect(doc?.verificationMethod).toHaveLength(2);
    expect(doc?.verificationMethod?.map((m) => m.publicKeyBase58)).toEqual([
      "AliceKeyOne",
      "AliceKeyTwo",
    ]);
    // Unique ids per key, all wired into the relationships.
    expect(doc?.verificationMethod?.map((m) => m.id)).toEqual([
      `${did}#owner`,
      `${did}#owner-2`,
    ]);
    expect(doc?.authentication).toEqual([`${did}#owner`, `${did}#owner-2`]);
  });

  it("maps UNKNOWN_ACCOUNT to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        rpcResponse({
          error: {
            cause: { name: "UNKNOWN_ACCOUNT" },
            message: "account nobody.near does not exist",
          },
        }),
      ),
    );
    const result = await resolverFor()(
      "did:near:nobody.near",
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("notFound");
    expect(result.didDocument).toBeNull();
  });

  it("resolves a registry identifier through identity_owner", async () => {
    const base58Id = "3".repeat(44);
    const did = `did:near:testnet:${base58Id}`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        expect(String(url)).toBe("https://rpc.test.test");
        const body = JSON.parse(String(init?.body)) as {
          params: Record<string, unknown>;
        };
        expect(body.params.request_type).toBe("call_function");
        expect(body.params.account_id).toBe("registry.testnet");
        expect(body.params.method_name).toBe("identity_owner");
        const owner = JSON.stringify("did:near:OwnerKeyBase58Value");
        return rpcResponse({
          result: { result: Array.from(new TextEncoder().encode(owner)) },
        });
      }),
    );
    const result = await resolverFor()(did, null as never, null as never, {});
    expect(result.didDocument?.verificationMethod?.[0]?.publicKeyBase58).toBe(
      "OwnerKeyBase58Value",
    );
  });

  it("requires a registry contract for base58 identifiers", async () => {
    const result = await resolverFor()(
      `did:near:${"2".repeat(44)}`, // mainnet default has no contractId
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
  });

  it("rejects malformed identifiers without calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:near:UPPER.near!",
      "did:near:a",
      "did:near:mainnet:extra:alice.near",
    ]) {
      const result = await resolverFor()(did, null as never, null as never, {});
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns notConfigured when no networks are given", async () => {
    const result = await resolverFor({ networks: [] })(
      "did:near:alice.near",
      null as never,
      null as never,
      {},
    );
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
  });
});
