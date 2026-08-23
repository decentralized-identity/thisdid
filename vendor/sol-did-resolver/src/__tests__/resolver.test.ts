import { afterEach, describe, expect, it, vi } from "vitest";
import { getResolver } from "../resolver.js";
import {
  AUTHORITY,
  DEVNET_DID,
  KEY2_PUBKEY,
  LEGACY_ACCOUNT_B64,
  LEGACY_PDA,
  LEGACY_PROGRAM,
  MODERN_PDA,
} from "./fixture.js";

const RPC = {
  mainnet: "https://mainnet.rpc.test",
  devnet: "https://devnet.rpc.test",
};

const resolve = (did: string, rpcUrls: Record<string, string> = RPC) =>
  getResolver({ rpcUrls }).sol(did, null as never, null as never, {});

/** Mock getMultipleAccounts: [modern, legacy] per request order. */
const stubRpc = (
  accounts: ({ owner: string; b64: string } | null)[],
  expectUrl?: string,
) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      if (expectUrl) expect(String(input)).toBe(expectUrl);
      const body = JSON.parse(String(init?.body)) as {
        method: string;
        params: [string[], unknown];
      };
      expect(body.method).toBe("getMultipleAccounts");
      expect(body.params[0]).toEqual([MODERN_PDA, LEGACY_PDA]);
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: {
          value: accounts.map((account) =>
            account
              ? {
                  owner: account.owner,
                  data: [account.b64, "base64"],
                  lamports: 1,
                  executable: false,
                }
              : null,
          ),
        },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

// ── Borsh writer for synthetic modern accounts ─────────────────────────────

class Writer {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.bytes.push(v & 0xff, (v >> 8) & 0xff);
  }
  u32(v: number) {
    this.bytes.push(
      v & 0xff,
      (v >> 8) & 0xff,
      (v >> 16) & 0xff,
      (v >> 24) & 0xff,
    );
  }
  raw(data: Uint8Array | number[]) {
    this.bytes.push(...data);
  }
  str(s: string) {
    const utf8 = new TextEncoder().encode(s);
    this.u32(utf8.length);
    this.raw(utf8);
  }
  b64(): string {
    return Buffer.from(new Uint8Array(this.bytes)).toString("base64");
  }
}

const DID_SOL_PROGRAM = "didso1Dpqpm4CsiCjzP766BGY89CAdD6ZBL68cRhFPc";
const ED25519_KEY = new Uint8Array(32).fill(9);
const ETH_ADDRESS = new Uint8Array(20).fill(0xab);

function modernAccount(): string {
  const w = new Writer();
  w.raw(new Uint8Array(8)); // anchor discriminator (skipped by decoder)
  w.u8(0); // version
  w.u8(253); // bump
  w.raw(new Uint8Array(8)); // nonce u64
  // initial VM: default, CapabilityInvocation | OwnershipProof | Protected
  w.str("default");
  w.u16((1 << 3) | (1 << 6) | (1 << 7));
  w.u8(0);
  w.u32(32);
  w.raw(ED25519_KEY);
  // additional VMs: an eth key (authentication) and a hidden key
  w.u32(2);
  w.str("eth-key");
  w.u16(1 << 0);
  w.u8(1);
  w.u32(20);
  w.raw(ETH_ADDRESS);
  w.str("ghost");
  w.u16((1 << 0) | (1 << 5)); // authentication + DID_DOC_HIDDEN
  w.u8(0);
  w.u32(32);
  w.raw(ED25519_KEY);
  // services
  w.u32(1);
  w.str("site");
  w.str("LinkedDomains");
  w.str("https://sol.test");
  // native controllers
  w.u32(1);
  w.raw(new Uint8Array(32).fill(7));
  // other controllers
  w.u32(1);
  w.str("did:web:controller.example");
  return w.b64();
}

// ── Live legacy fixture ─────────────────────────────────────────────────────

describe("did:sol legacy-program resolution (live devnet fixture)", () => {
  it("decodes the captured account into the reference document semantics", async () => {
    stubRpc(
      [null, { owner: LEGACY_PROGRAM, b64: LEGACY_ACCOUNT_B64 }],
      RPC.devnet,
    );
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.id).toBe(DEVNET_DID);
    expect(doc?.["@context"]).toEqual([
      "https://w3id.org/did/v1.0",
      "https://w3id.org/sol/v1",
    ]);
    expect(doc?.verificationMethod).toEqual([
      {
        id: `${DEVNET_DID}#default`,
        type: "Ed25519VerificationKey2018",
        controller: DEVNET_DID,
        publicKeyBase58: AUTHORITY,
      },
      {
        id: `${DEVNET_DID}#key2`,
        type: "Ed25519VerificationKey2018",
        controller: DEVNET_DID,
        publicKeyBase58: KEY2_PUBKEY,
      },
    ]);
    // capabilityInvocation was rotated to key2 only — default holds nothing.
    expect(doc?.capabilityInvocation).toEqual([`${DEVNET_DID}#key2`]);
    expect(doc?.authentication).toBeUndefined();
    expect(doc?.service).toBeUndefined();
  });

  it("rejects a legacy account whose stored authority mismatches", async () => {
    const bytes = Buffer.from(LEGACY_ACCOUNT_B64, "base64");
    bytes[5] ^= 0xff; // corrupt the stored authority
    stubRpc([null, { owner: LEGACY_PROGRAM, b64: bytes.toString("base64") }]);
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("authority");
  });
});

// ── Modern program ──────────────────────────────────────────────────────────

describe("did:sol modern-program resolution", () => {
  it("decodes an Anchor DidAccount with flags, hidden keys, and controllers", async () => {
    stubRpc([{ owner: DID_SOL_PROGRAM, b64: modernAccount() }, null]);
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.["@context"]).toEqual([
      "https://w3id.org/did/v1.0",
      "https://w3id.org/sol/v2.0",
    ]);
    // Hidden key omitted; ownership/protected flags not surfaced.
    expect(doc?.verificationMethod?.map((vm) => vm.id)).toEqual([
      `${DEVNET_DID}#default`,
      `${DEVNET_DID}#eth-key`,
    ]);
    expect(doc?.capabilityInvocation).toEqual([`${DEVNET_DID}#default`]);
    expect(doc?.authentication).toEqual([`${DEVNET_DID}#eth-key`]);
    const eth = doc?.verificationMethod?.[1] as Record<string, unknown>;
    expect(eth.type).toBe("EcdsaSecp256k1RecoveryMethod2020");
    expect(String(eth.ethereumAddress)).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(doc?.service).toEqual([
      {
        id: `${DEVNET_DID}#site`,
        type: "LinkedDomains",
        serviceEndpoint: "https://sol.test",
      },
    ]);
    expect(doc?.controller).toEqual([
      `did:sol:devnet:${
        (doc?.controller as string[])[0].split(":").pop() as string
      }`,
      "did:web:controller.example",
    ]);
  });
});

// ── Generative ──────────────────────────────────────────────────────────────

describe("did:sol generative resolution", () => {
  it("serves the default document when no account exists on either program", async () => {
    stubRpc([null, null]);
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument;
    expect(doc?.verificationMethod).toEqual([
      {
        id: `${DEVNET_DID}#default`,
        type: "Ed25519VerificationKey2018",
        controller: DEVNET_DID,
        publicKeyBase58: AUTHORITY,
      },
    ]);
    expect(doc?.capabilityInvocation).toEqual([`${DEVNET_DID}#default`]);
    expect(doc?.authentication).toBeUndefined();
  });

  it("keeps resolving generatively over a system-owned lamport stub", async () => {
    // Anyone can create a zero-data system account at any PDA by sending
    // lamports — that is dust, not DID state, and must not block resolution.
    stubRpc([{ owner: "11111111111111111111111111111111", b64: "" }, null]);
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(DEVNET_DID);
  });

  it("fails closed on a data-bearing DID PDA owned by an unexpected program", async () => {
    stubRpc([
      {
        owner: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        b64: Buffer.from([1, 2, 3]).toString("base64"),
      },
      null,
    ]);
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didDocument).toBeNull();
  });

  it("routes mainnet DIDs to the mainnet endpoint", async () => {
    stubRpc([null, null], RPC.mainnet);
    const result = await resolve(`did:sol:${AUTHORITY}`);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(`did:sol:${AUTHORITY}`);
  });
});

// ── Input handling & fail-closed ────────────────────────────────────────────

describe("did:sol input handling", () => {
  it("rejects malformed identifiers offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:sol:notbase58!!!",
      "did:sol:abc", // too short to be 32 bytes
      "did:sol:nowhere:" + AUTHORITY, // unknown cluster
      "did:sol:devnet:extra:" + AUTHORITY,
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed when the cluster has no configured RPC endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve(DEVNET_DID, {});
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps RPC failures to networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("rejects an oversized RPC response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(2 * 1024 * 1024))),
    );
    const result = await resolve(DEVNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});
