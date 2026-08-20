import { afterEach, describe, expect, it, vi } from "vitest";
import { CID } from "multiformats/cid";
import * as jsonCodec from "multiformats/codecs/json";
import { sha256 as cidHasher } from "multiformats/hashes/sha2";
import { secp256k1 } from "@noble/curves/secp256k1";
import { sha256 } from "@noble/hashes/sha256";
import { getResolver } from "../resolver.js";
import { ARCHON_NODE_DID, FIXTURE } from "./fixture.js";

const GATEKEEPER = "https://gatekeeper.test/api/v1";

const resolve = (did: string) =>
  getResolver({ gatekeeperUrl: GATEKEEPER }).cid(
    did,
    null as never,
    null as never,
    {},
  );

/** Mock the export endpoint: one chain per DID, DIF batching shape. */
const stubExport = (chains: Record<string, unknown[]>) => {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe(`${GATEKEEPER}/dids/export`);
      const { dids } = JSON.parse(String(init?.body)) as { dids: string[] };
      return Response.json(dids.map((d) => chains[d] ?? []));
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const liveEvents = () => clone(FIXTURE.events) as Record<string, unknown>[];

afterEach(() => vi.unstubAllGlobals());

// ── Synthetic chain builder (we hold the keys, so we can sign) ─────────────

type Op = Record<string, unknown>;

function jcs(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(jcs).join(",") + "]";
  const record = value as Record<string, unknown>;
  return (
    "{" +
    Object.keys(record)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + jcs(record[k]))
      .join(",") +
    "}"
  );
}

const b64u = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url");

async function opCid(op: Op): Promise<string> {
  const digest = await cidHasher.digest(new TextEncoder().encode(jcs(op)));
  return CID.createV1(jsonCodec.code, digest).toString();
}

function jwkFor(priv: Uint8Array): Record<string, string> {
  const pub = secp256k1.getPublicKey(priv, false);
  return {
    crv: "secp256k1",
    kty: "EC",
    x: b64u(pub.slice(1, 33)),
    y: b64u(pub.slice(33, 65)),
  };
}

function signed(op: Op, priv: Uint8Array, verificationMethod: string): Op {
  const msgHash = sha256(new TextEncoder().encode(jcs(op)));
  return {
    ...op,
    proof: {
      created: "2026-02-01T00:00:00.000Z",
      proofPurpose: "authentication",
      proofValue: b64u(secp256k1.sign(msgHash, priv).toCompactRawBytes()),
      type: "EcdsaSecp256k1Signature2019",
      verificationMethod,
    },
  };
}

const event = (operation: Op, time: string) => ({
  registry: "hyperswarm",
  time,
  operation,
});

const KEY_A = new Uint8Array(32).fill(7);
const KEY_B = new Uint8Array(32).fill(9);

async function agentGenesis(
  priv: Uint8Array,
): Promise<{ did: string; op: Op }> {
  const op = signed(
    {
      created: "2026-02-01T00:00:00.000Z",
      publicJwk: jwkFor(priv),
      registration: { registry: "hyperswarm", type: "agent", version: 1 },
      type: "create",
    },
    priv,
    "#key-1",
  );
  return { did: `did:cid:${await opCid(op)}`, op };
}

// ── Live-chain regression ───────────────────────────────────────────────────

describe("did:cid resolution-only gatekeeper — live chain", () => {
  it("independently verifies the 18-event archon.technology chain", async () => {
    stubExport({ [ARCHON_NODE_DID]: liveEvents() });
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(FIXTURE.expected.didDocument);
    expect(result.didDocumentMetadata).toEqual(
      FIXTURE.expected.didDocumentMetadata,
    );
  });

  it("rejects a chain whose genesis does not hash to the DID", async () => {
    const events = liveEvents();
    (events[0].operation as Op).created = "2027-01-01T00:00:00.000Z";
    stubExport({ [ARCHON_NODE_DID]: events });
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("genesis");
  });

  it("rejects a tampered update operation (broken signature)", async () => {
    const events = liveEvents();
    ((events[5].operation as Op).doc as Op).didDocumentData = { forged: true };
    stubExport({ [ARCHON_NODE_DID]: events });
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("signature");
  });

  it("rejects a reordered chain (broken previd link)", async () => {
    const events = liveEvents();
    [events[3], events[4]] = [events[4], events[3]];
    stubExport({ [ARCHON_NODE_DID]: events });
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("rejects a withheld genesis (chain starting mid-way)", async () => {
    stubExport({ [ARCHON_NODE_DID]: liveEvents().slice(1) });
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
  });
});

// ── Synthetic chains: rotation, deletion, assets ────────────────────────────

describe("did:cid resolution-only gatekeeper — synthetic chains", () => {
  it("honors key rotation: later updates verify against the rotated key", async () => {
    const { did, op: genesis } = await agentGenesis(KEY_A);
    const rotatedDoc = {
      "@context": ["https://www.w3.org/ns/did/v1"],
      id: did,
      verificationMethod: [
        {
          id: "#key-2",
          controller: did,
          type: "EcdsaSecp256k1VerificationKey2019",
          publicKeyJwk: jwkFor(KEY_B),
        },
      ],
      authentication: ["#key-2"],
      assertionMethod: ["#key-2"],
    };
    const rotate = signed(
      {
        did,
        doc: { didDocument: rotatedDoc },
        previd: await opCid(genesis),
        type: "update",
      },
      KEY_A, // authorized by the then-current key
      `${did}#key-1`,
    );
    const afterRotate = signed(
      {
        did,
        doc: { didDocumentData: { note: "signed by the new key" } },
        previd: await opCid(rotate),
        type: "update",
      },
      KEY_B, // must verify against the ROTATED key
      `${did}#key-2`,
    );
    stubExport({
      [did]: [
        event(genesis, "2026-02-01T00:00:00.000Z"),
        event(rotate, "2026-02-02T00:00:00.000Z"),
        event(afterRotate, "2026-02-03T00:00:00.000Z"),
      ],
    });
    const result = await resolve(did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.verificationMethod?.[0]?.id).toBe("#key-2");
    expect(result.didDocumentMetadata.versionSequence).toBe("3");

    // The OLD key must no longer authorize updates.
    const forged = signed(
      {
        did,
        doc: { didDocumentData: { forged: true } },
        previd: await opCid(afterRotate),
        type: "update",
      },
      KEY_A,
      `${did}#key-1`,
    );
    stubExport({
      [did]: [
        event(genesis, "2026-02-01T00:00:00.000Z"),
        event(rotate, "2026-02-02T00:00:00.000Z"),
        event(afterRotate, "2026-02-03T00:00:00.000Z"),
        event(forged, "2026-02-04T00:00:00.000Z"),
      ],
    });
    const rejected = await resolve(did);
    expect(rejected.didResolutionMetadata.error).toBe("invalidDidDocument");
  });

  it("resolves a delete operation to a deactivated tombstone", async () => {
    const { did, op: genesis } = await agentGenesis(KEY_A);
    const remove = signed(
      { did, previd: await opCid(genesis), type: "delete" },
      KEY_A,
      `${did}#key-1`,
    );
    stubExport({
      [did]: [
        event(genesis, "2026-02-01T00:00:00.000Z"),
        event(remove, "2026-02-05T12:00:00.000Z"),
      ],
    });
    const result = await resolve(did);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
    expect(result.didDocumentMetadata.deleted).toBe("2026-02-05T12:00:00Z");
    expect(result.didDocument).toEqual({ id: did });
  });

  it("resolves an asset DID by verifying against its controller's chain", async () => {
    const { did: controllerDid, op: controllerGenesis } =
      await agentGenesis(KEY_A);
    const assetOp = signed(
      {
        controller: controllerDid,
        created: "2026-02-02T00:00:00.000Z",
        data: { title: "verifiable asset" },
        registration: { registry: "hyperswarm", type: "asset", version: 1 },
        type: "create",
      },
      KEY_A,
      `${controllerDid}#key-1`,
    );
    const assetDid = `did:cid:${await opCid(assetOp)}`;
    stubExport({
      [controllerDid]: [event(controllerGenesis, "2026-02-01T00:00:00.000Z")],
      [assetDid]: [event(assetOp, "2026-02-02T00:00:00.000Z")],
    });
    const result = await resolve(assetDid);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument?.id).toBe(assetDid);
    expect(result.didDocument?.controller).toBe(controllerDid);
  });
});

// ── Transport & input handling ──────────────────────────────────────────────

describe("did:cid resolution-only gatekeeper — transport and input", () => {
  it("rejects malformed identifiers offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:cid:not-a-cid!",
      "did:cid:" + "b".repeat(200),
      "did:cid:abc:extra",
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps an empty export to notFound", async () => {
    stubExport({});
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("maps gatekeeper transport failures to networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("rejects an oversized export before parsing it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(3 * 1024 * 1024))),
    );
    const result = await resolve(ARCHON_NODE_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
    expect(result.didResolutionMetadata.message).toContain("size bound");
  });
});
