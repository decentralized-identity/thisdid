import { afterEach, describe, expect, it, vi } from "vitest";
import type { DIDResolutionResult } from "did-resolver";
import { getResolver, keyMatchesAddress } from "../resolver.js";
import {
  TZ4_ADDRESS,
  TZ_KT1_ADDRESS,
  TZ_MAINNET_CHAIN_ID,
  TZ_REVEALED,
  TZ_SECOND_TZ1,
  TZ_UNREVEALED,
} from "./fixture.js";

function mockTzkt(body: unknown, status = 200) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () => new Response(JSON.stringify(body), { status }),
    );
}

async function resolve(
  did: string,
  body: unknown = { publicKey: null, revealed: false },
  status = 200,
): Promise<DIDResolutionResult> {
  mockTzkt(body, status);
  const registry = getResolver();
  return (await registry.tz(
    did,
    {} as never,
    {} as never,
    {},
  )) as DIDResolutionResult;
}

afterEach(() => vi.restoreAllMocks());

const VM_TYPES: Record<string, string> = {
  tz1: "Ed25519PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
  tz2: "EcdsaSecp256k1RecoveryMethod2020",
  tz3: "P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
};

describe("did:tz resolution", () => {
  for (const prefix of ["tz1", "tz2", "tz3"] as const) {
    it(`derives and key-enriches a live revealed ${prefix} account`, async () => {
      const { address, publicKey } = TZ_REVEALED[prefix];
      const did = `did:tz:${address}`;
      const result = await resolve(did, { publicKey, revealed: true });
      expect(result.didResolutionMetadata.error).toBeUndefined();
      const doc = result.didDocument!;
      expect(doc.id).toBe(did);
      const vm = doc.verificationMethod![0] as Record<string, unknown>;
      expect(vm.id).toBe(`${did}#blockchainAccountId`);
      expect(vm.type).toBe(VM_TYPES[prefix]);
      expect(vm.controller).toBe(did);
      expect(vm.blockchainAccountId).toBe(
        `tezos:${TZ_MAINNET_CHAIN_ID}:${address}`,
      );
      // The revealed key re-derives the address, so it is included.
      expect(vm.publicKeyBase58).toBe(publicKey);
      expect(doc.authentication).toEqual([`${did}#blockchainAccountId`]);
      expect(doc.assertionMethod).toEqual([`${did}#blockchainAccountId`]);
      expect(result.didDocumentMetadata).toMatchObject({
        network: "mainnet",
        implicit: true,
        keyDiscovery: "verified",
      });
    });
  }

  it("serves the offline document for an unrevealed account", async () => {
    const did = `did:tz:${TZ_UNREVEALED.address}`;
    const result = await resolve(did, TZ_UNREVEALED);
    const vm = result.didDocument!.verificationMethod![0] as Record<
      string,
      unknown
    >;
    expect(vm.publicKeyBase58).toBeUndefined();
    expect(result.didDocumentMetadata.keyDiscovery).toBe("unrevealed");
  });

  it("refuses a planted key that does not hash to the address", async () => {
    const did = `did:tz:${TZ_REVEALED.tz1.address}`;
    // A real revealed key — but for a DIFFERENT tz1 address.
    const result = await resolve(did, {
      publicKey: TZ_SECOND_TZ1.publicKey,
      revealed: true,
    });
    const vm = result.didDocument!.verificationMethod![0] as Record<
      string,
      unknown
    >;
    expect(vm.publicKeyBase58).toBeUndefined();
    expect(result.didDocumentMetadata.keyDiscovery).toBe("mismatch");
  });

  it("degrades to the offline document when TzKT is unreachable", async () => {
    const did = `did:tz:${TZ_REVEALED.tz1.address}`;
    const result = await resolve(did, "oops", 503);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument!.id).toBe(did);
    expect(result.didDocumentMetadata.keyDiscovery).toBe("unavailable");
  });

  it("resolves shadownet DIDs with the shadownet chain id", async () => {
    const did = `did:tz:shadownet:${TZ_REVEALED.tz1.address}`;
    const result = await resolve(did);
    const vm = result.didDocument!.verificationMethod![0] as Record<
      string,
      unknown
    >;
    expect(vm.blockchainAccountId).toBe(
      `tezos:NetXsqzbfFenSTS:${TZ_REVEALED.tz1.address}`,
    );
  });

  it("reports notConfigured for KT1 contracts and unknown networks", async () => {
    const kt1 = await resolve(`did:tz:${TZ_KT1_ADDRESS}`);
    expect(kt1.didResolutionMetadata.error).toBe("notConfigured");
    const net = await resolve(`did:tz:granadanet:${TZ_REVEALED.tz1.address}`);
    expect(net.didResolutionMetadata.error).toBe("notConfigured");
  });

  it("rejects tz4 and malformed addresses without any network call", async () => {
    const spy = mockTzkt({});
    const registry = getResolver();
    const cases: [string, string][] = [
      [`did:tz:${TZ4_ADDRESS}`, "tz4"],
      ["did:tz:tz1short", "36-char"],
      [`did:tz:${TZ_REVEALED.tz1.address.slice(0, 35)}X`, "checksum"],
      ["did:tz:a:b:c:d", "expected"],
    ];
    for (const [bad, needle] of cases) {
      const result = (await registry.tz(
        bad,
        {} as never,
        {} as never,
        {},
      )) as DIDResolutionResult;
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
      expect(result.didResolutionMetadata.message).toContain(needle);
    }
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("keyMatchesAddress", () => {
  it("verifies all three live reveal relationships", () => {
    for (const prefix of ["tz1", "tz2", "tz3"] as const) {
      const { address, publicKey } = TZ_REVEALED[prefix];
      expect(keyMatchesAddress(publicKey, address)).toBe(true);
    }
  });

  it("rejects cross-curve and cross-address pairs", () => {
    expect(
      keyMatchesAddress(TZ_REVEALED.tz1.publicKey, TZ_REVEALED.tz2.address),
    ).toBe(false);
    expect(
      keyMatchesAddress(TZ_REVEALED.tz2.publicKey, TZ_REVEALED.tz3.address),
    ).toBe(false);
  });
});
