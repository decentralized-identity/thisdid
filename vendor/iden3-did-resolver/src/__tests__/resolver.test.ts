import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";
import {
  AMOY_DID,
  POLYGONID_MAIN_DID,
  RAW_GIST_PROOF_RETURN,
  RAW_ROOT_INFO_RETURN,
  RAW_STATE_RETURN,
  REFERENCE_DOCUMENT,
} from "./fixture.js";

const NETWORKS = {
  "polygon:amoy": { rpcUrl: "https://amoy.rpc.test" },
  "polygon:main": { rpcUrl: "https://polygon.rpc.test" },
};

const registry = () => getResolver({ networks: NETWORKS });
const resolve = (did: string, reg = registry()) => {
  const method = did.split(":")[1] as "iden3" | "polygonid";
  return reg[method](did, null as never, null as never, {});
};

/** Two round-trips: batch [stateInfo, gistProof], then [rootInfo]. */
const stubChain = (
  overrides: {
    stateError?: string;
    expectUrl?: string;
  } = {},
) => {
  let call = 0;
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (overrides.expectUrl) expect(String(input)).toBe(overrides.expectUrl);
      const batch = JSON.parse(String(init?.body)) as { id: number }[];
      call++;
      if (call === 1) {
        expect(batch).toHaveLength(2);
        return Response.json([
          overrides.stateError
            ? {
                jsonrpc: "2.0",
                id: 0,
                error: { message: overrides.stateError },
              }
            : { jsonrpc: "2.0", id: 0, result: RAW_STATE_RETURN },
          { jsonrpc: "2.0", id: 1, result: RAW_GIST_PROOF_RETURN },
        ]);
      }
      expect(batch).toHaveLength(1);
      return Response.json([
        { jsonrpc: "2.0", id: 0, result: RAW_ROOT_INFO_RETURN },
      ]);
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe("did:iden3 resolution (live Amoy captures)", () => {
  it("composes the reference document exactly from raw eth_call returns", async () => {
    stubChain({ expectUrl: "https://amoy.rpc.test" });
    const result = await resolve(AMOY_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(REFERENCE_DOCUMENT);
  });

  it("treats an unpublished identity as published: false, never an error", async () => {
    stubChain({ stateError: "execution reverted: Identity does not exist" });
    const result = await resolve(AMOY_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const vm = result.didDocument?.verificationMethod?.[0] as Record<
      string,
      unknown
    >;
    expect(vm.published).toBe(false);
    expect(vm.info).toBeUndefined();
    expect(vm.global).toBeDefined();
  });

  it("surfaces other state-contract reverts as networkError", async () => {
    stubChain({ stateError: "execution reverted: something else" });
    const result = await resolve(AMOY_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});

describe("did:polygonid via the same engine", () => {
  it("resolves the Privado mainnet example (unpublished) with polygonid ids throughout", async () => {
    stubChain({
      stateError: "execution reverted: Identity does not exist",
      expectUrl: "https://polygon.rpc.test",
    });
    const result = await resolve(POLYGONID_MAIN_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.id).toBe(POLYGONID_MAIN_DID);
    const vm = doc?.verificationMethod?.[0] as Record<string, unknown>;
    expect(vm.id).toBe(`${POLYGONID_MAIN_DID}#state-info`);
    expect(vm.published).toBe(false);
    expect(vm.info).toBeUndefined();
    expect(vm.stateContractAddress).toBe(
      "137:0x624ce98D2d27b20b8f8d521723Df8fC4db71D79D",
    );
  });

  it("rejects method/ID type-byte mismatches in both directions", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const reg = registry();
    // iden3-typed ID (0x01) presented as did:polygonid
    const asPolygonid = await reg.polygonid(
      AMOY_DID.replace("did:iden3:", "did:polygonid:"),
      null as never,
      null as never,
      {},
    );
    expect(asPolygonid.didResolutionMetadata.error).toBe("invalidDid");
    expect(asPolygonid.didResolutionMetadata.message).toContain("type byte");
    // polygonid-typed ID (0x02) presented as did:iden3
    const asIden3 = await reg.iden3(
      POLYGONID_MAIN_DID.replace("did:polygonid:", "did:iden3:"),
      null as never,
      null as never,
      {},
    );
    expect(asIden3.didResolutionMetadata.error).toBe("invalidDid");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects an ID whose network byte disagrees with the DID network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // The amoy-typed ID (network byte 0x13) claimed as polygon:main (0x11).
    const wrongNetwork = await resolve(
      AMOY_DID.replace(":polygon:amoy:", ":polygon:main:"),
    );
    expect(wrongNetwork.didResolutionMetadata.error).toBe("invalidDid");
    expect(wrongNetwork.didResolutionMetadata.message).toContain(
      "network byte",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("did:iden3 input handling", () => {
  it("rejects malformed identifiers offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const idPart = AMOY_DID.split(":")[4];
    const corrupted = idPart.slice(0, -1) + (idPart.endsWith("w") ? "x" : "w"); // breaks checksum
    for (const did of [
      `did:iden3:polygon:amoy:${corrupted}`,
      "did:iden3:polygon:amoy:!!!",
      "did:iden3:polygon:amoy:abc",
      "did:iden3:tooFewParts",
      `did:iden3:polygon:amoy:extra:${idPart}`,
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for unconfigured networks", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // An unmapped blockchain:network pair skips the byte check and must then
    // fail closed on missing RPC configuration.
    const result = await resolve(
      AMOY_DID.replace(":polygon:amoy:", ":polygon:testnet:"),
    );
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps RPC transport failures to networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const result = await resolve(AMOY_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("rejects an oversized RPC response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(2 * 1024 * 1024))),
    );
    const result = await resolve(AMOY_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});
