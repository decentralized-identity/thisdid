import { afterEach, describe, expect, it, vi } from "vitest";
import type { DIDResolutionResult } from "did-resolver";
import { ed25519 } from "@noble/curves/ed25519";
import { secp256k1 } from "@noble/curves/secp256k1";
import {
  getResolver,
  jwkThumbprint,
  parseDnsPacket,
  verifyBep44,
  zBase32Decode,
  zBase32Encode,
} from "../resolver.js";
import { PKARR_LIVE_KEY, PKARR_LIVE_PAYLOAD } from "./fixture.js";

// ── deterministic test identity (fixed seed — a TEST vector, not a secret) ──
const TEST_SEED = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const TEST_PUBKEY = ed25519.getPublicKey(TEST_SEED);
const TEST_ID = zBase32Encode(TEST_PUBKEY);
const TEST_DID = `did:dht:${TEST_ID}`;

const encoder = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Hand-encode an authoritative DNS packet of TXT answers (no compression). */
function dnsPacket(answers: { name: string; data: string }[]): Uint8Array {
  const out: number[] = [
    0,
    0,
    0x84,
    0,
    0,
    0,
    (answers.length >> 8) & 0xff,
    answers.length & 0xff,
    0,
    0,
    0,
    0,
  ];
  for (const answer of answers) {
    for (const label of answer.name.replace(/\.$/, "").split(".")) {
      out.push(label.length, ...encoder.encode(label));
    }
    out.push(0); // root
    out.push(0, 16, 0, 1, 0, 0, 0x1c, 0x20); // TXT, IN, TTL 7200
    const chunks: number[] = [];
    const bytes = encoder.encode(answer.data);
    for (let i = 0; i < bytes.length; i += 255) {
      const chunk = bytes.subarray(i, i + 255);
      chunks.push(chunk.length, ...chunk);
    }
    out.push((chunks.length >> 8) & 0xff, chunks.length & 0xff, ...chunks);
  }
  return Uint8Array.from(out);
}

/** Sign a packet as a BEP44 mutable item the way Pkarr relays serve it. */
function signedPayload(
  packet: Uint8Array,
  seq = 1724500000000000n,
): Uint8Array {
  const prefix = encoder.encode(`3:seqi${seq}e1:v${packet.length}:`);
  const message = new Uint8Array(prefix.length + packet.length);
  message.set(prefix, 0);
  message.set(packet, prefix.length);
  const signature = ed25519.sign(message, TEST_SEED);
  const out = new Uint8Array(72 + packet.length);
  out.set(signature, 0);
  for (let i = 0; i < 8; i++) {
    out[64 + i] = Number((seq >> BigInt(8 * (7 - i))) & 0xffn);
  }
  out.set(packet, 72);
  return out;
}

/** A spec-shaped record set for the test DID: identity key + secp256k1 + svc. */
const SECP_COMPRESSED = secp256k1.getPublicKey(TEST_SEED, true);

function fullRecordSet(): { name: string; data: string }[] {
  return [
    {
      name: `_did.${TEST_ID}.`,
      data: "v=0;vm=k0,k1;auth=k0,k1;asm=k0;inv=k0;del=k0;svc=s0",
    },
    { name: "_cnt._did.", data: "did:example:abcd" },
    { name: "_aka._did.", data: "did:example:efgh,did:example:ijkl" },
    { name: "_k0._did.", data: `id=0;t=0;k=${b64url(TEST_PUBKEY)}` },
    { name: "_k1._did.", data: `t=1;k=${b64url(SECP_COMPRESSED)}` },
    {
      name: "_s0._did.",
      data: "id=dwn;t=DecentralizedWebNode;se=https://example.com/dwn1,https://example.com/dwn2",
    },
    { name: "_typ._did.", data: "id=1,7" },
  ];
}

function mockRelay(body: Uint8Array | number) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (typeof body === "number") {
      return new Response("nope", { status: body });
    }
    return new Response(body.slice().buffer as ArrayBuffer, {
      headers: { "content-type": "application/pkarr.org/relays#payload" },
    });
  });
}

async function resolve(
  did: string,
  body: Uint8Array | number,
): Promise<DIDResolutionResult> {
  mockRelay(body);
  const registry = getResolver();
  return (await registry.dht(
    did,
    {} as never,
    {} as never,
    {},
  )) as DIDResolutionResult;
}

afterEach(() => vi.restoreAllMocks());

describe("did:dht resolution", () => {
  it("reconstructs a full spec-shaped document, signature-verified", async () => {
    const payload = signedPayload(dnsPacket(fullRecordSet()));
    const result = await resolve(TEST_DID, payload);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument!;
    expect(doc.id).toBe(TEST_DID);
    expect(doc.controller).toBe("did:example:abcd");
    expect(doc.alsoKnownAs).toEqual(["did:example:efgh", "did:example:ijkl"]);

    const [identity, secondary] = doc.verificationMethod!;
    expect(identity.id).toBe(`${TEST_DID}#0`);
    expect(identity.type).toBe("JsonWebKey");
    expect(identity.controller).toBe(TEST_DID);
    expect(identity.publicKeyJwk).toMatchObject({
      kty: "OKP",
      crv: "Ed25519",
      alg: "EdDSA",
      kid: "0",
      x: b64url(TEST_PUBKEY),
    });
    // Unnamed key → RFC 7638 thumbprint id, compressed point decompressed.
    const jwk = secondary.publicKeyJwk as Record<string, string>;
    expect(jwk).toMatchObject({ kty: "EC", crv: "secp256k1", alg: "ES256K" });
    const uncompressed = secp256k1.getPublicKey(TEST_SEED, false);
    expect(jwk.x).toBe(b64url(uncompressed.subarray(1, 33)));
    expect(jwk.y).toBe(b64url(uncompressed.subarray(33, 65)));
    expect(secondary.id).toBe(`${TEST_DID}#${jwkThumbprint(jwk)}`);

    expect(doc.authentication).toEqual([`${TEST_DID}#0`, secondary.id]);
    expect(doc.assertionMethod).toEqual([`${TEST_DID}#0`]);
    expect(doc.service).toEqual([
      {
        id: `${TEST_DID}#dwn`,
        type: "DecentralizedWebNode",
        serviceEndpoint: [
          "https://example.com/dwn1",
          "https://example.com/dwn2",
        ],
      },
    ]);
    expect(result.didDocumentMetadata).toMatchObject({
      network: "mainline",
      deactivated: false,
      signatureVerified: true,
      typeIndex: [1, 7],
    });
  });

  it("verifies the LIVE relay capture and attributes its non-DID packet", async () => {
    const key = zBase32Decode(PKARR_LIVE_KEY)!;
    const signature = PKARR_LIVE_PAYLOAD.subarray(0, 64);
    let seq = 0n;
    for (let i = 64; i < 72; i++) {
      seq = (seq << 8n) | BigInt(PKARR_LIVE_PAYLOAD[i]);
    }
    const value = PKARR_LIVE_PAYLOAD.subarray(72);
    expect(verifyBep44(key, signature, seq, value)).toBe(true);
    expect(parseDnsPacket(value)).not.toBeNull();

    const result = await resolve(
      `did:dht:${PKARR_LIVE_KEY}`,
      PKARR_LIVE_PAYLOAD,
    );
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("root record");
  });

  it("rejects a forged payload signed by another key", async () => {
    const packet = dnsPacket(fullRecordSet());
    const payload = signedPayload(packet);
    payload[5] ^= 0xff; // corrupt the signature
    const result = await resolve(TEST_DID, payload);
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("signature");
  });

  it("rejects an identity key record that is not the DID's key", async () => {
    const records = fullRecordSet();
    records[3].data = `id=0;t=0;k=${b64url(ed25519.getPublicKey(new Uint8Array(32).fill(9)))}`;
    const result = await resolve(TEST_DID, signedPayload(dnsPacket(records)));
    expect(result.didResolutionMetadata.error).toBe("invalidDidDocument");
    expect(result.didResolutionMetadata.message).toContain("identity key");
  });

  it("treats a relay 404 as the DHT's notFound answer", async () => {
    const result = await resolve(TEST_DID, 404);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("reports a `deactivated` root record as deactivated", async () => {
    const payload = signedPayload(
      dnsPacket([{ name: `_did.${TEST_ID}.`, data: "deactivated" }]),
    );
    const result = await resolve(TEST_DID, payload);
    expect(result.didDocument).toBeNull();
    expect(result.didDocumentMetadata.deactivated).toBe(true);
  });

  it("rejects malformed DIDs without any network call", async () => {
    const spy = mockRelay(404);
    const registry = getResolver();
    for (const bad of [
      "did:dht:tooshort",
      "did:dht:" + "l".repeat(52), // l is not in z-base-32
      "did:dht:a:b",
    ]) {
      const result = (await registry.dht(
        bad,
        {} as never,
        {} as never,
        {},
      )) as DIDResolutionResult;
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it("falls through relay transport failures but never a 404", async () => {
    let calls = 0;
    const payload = signedPayload(dnsPacket(fullRecordSet()));
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      calls++;
      if (String(input).includes("first.example")) {
        return new Response("busy", { status: 503 });
      }
      return new Response(payload.slice().buffer as ArrayBuffer);
    });
    const registry = getResolver({
      relayUrls: ["https://first.example", "https://second.example"],
    });
    const result = (await registry.dht(
      TEST_DID,
      {} as never,
      {} as never,
      {},
    )) as DIDResolutionResult;
    expect(result.didDocument!.id).toBe(TEST_DID);
    expect(calls).toBe(2);
  });
});

describe("z-base-32", () => {
  it("round-trips the test key and the live key", () => {
    expect(zBase32Encode(zBase32Decode(TEST_ID)!)).toBe(TEST_ID);
    expect(zBase32Encode(zBase32Decode(PKARR_LIVE_KEY)!)).toBe(PKARR_LIVE_KEY);
  });
});

describe("parseDnsPacket", () => {
  it("follows compression pointers and rejects pointer loops", () => {
    // Question holds the literal name `_did.`; the answer's name is an
    // RFC1035 §4.1.4 pointer back to it (offset 12).
    const name = encoder.encode("_did");
    const packet = Uint8Array.from([
      0,
      0,
      0x84,
      0,
      0,
      1,
      0,
      1,
      0,
      0,
      0,
      0,
      // question at offset 12: `_did.` TXT IN
      name.length,
      ...name,
      0,
      0,
      16,
      0,
      1,
      // answer: name = pointer to offset 12, TXT "v=0"
      0xc0,
      12,
      0,
      16,
      0,
      1,
      0,
      0,
      0,
      60,
      0,
      4,
      3,
      118,
      61,
      48,
    ]);
    const records = parseDnsPacket(packet);
    expect(records).toEqual([{ name: "_did.", type: 16, data: "v=0" }]);

    const loop = Uint8Array.from([
      0,
      0,
      0x84,
      0,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      0,
      0xc0,
      12, // pointer to itself
      0,
      16,
      0,
      1,
      0,
      0,
      0,
      60,
      0,
      0,
    ]);
    expect(parseDnsPacket(loop)).toBeNull();
  });
});
