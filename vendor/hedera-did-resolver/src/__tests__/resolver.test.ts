import { afterEach, describe, expect, it, vi } from "vitest";
import { ed25519 } from "@noble/curves/ed25519";
import { getResolver } from "../resolver.js";
import { REFERENCE_DOCUMENT, TESTNET_DID, TOPIC_MESSAGES } from "./fixture.js";

const resolve = (did: string, opts = {}) =>
  getResolver(opts).hedera(did, null as never, null as never, {});

const TOPIC_PATH = "/api/v1/topics/0.0.7280148/messages?limit=100&order=asc";

const stubMirror = (
  messages: { message: string }[],
  expectBase = "https://testnet.mirrornode.hedera.com",
) => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    expect(String(input)).toBe(`${expectBase}${TOPIC_PATH}`);
    return Response.json({ messages, links: { next: null } });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

const liveMessages = () =>
  TOPIC_MESSAGES.messages.map((m) => ({ message: m.message }));

afterEach(() => vi.unstubAllGlobals());

/** Forge an envelope signed by an attacker key (topic is public!). */
function forgedEnvelope(operation: string, event: unknown): string {
  const attacker = new Uint8Array(32).fill(13);
  const message = {
    timestamp: "2026-01-01T00:00:00.000000Z",
    operation,
    did: TESTNET_DID,
    event: Buffer.from(JSON.stringify(event)).toString("base64"),
  };
  const signature = ed25519.sign(
    new TextEncoder().encode(JSON.stringify(message)),
    attacker,
  );
  return Buffer.from(
    JSON.stringify({
      message,
      signature: Buffer.from(signature).toString("base64"),
    }),
  ).toString("base64");
}

describe("did:hedera resolution (live testnet captures)", () => {
  it("reproduces the reference document from raw, signature-verified topic messages", async () => {
    stubMirror(liveMessages());
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    expect(result.didDocument).toEqual(REFERENCE_DOCUMENT);
    expect(result.didDocumentMetadata).toEqual({
      created: "2025-11-18T15:28:50.626Z",
      updated: "2025-11-18T15:28:54.734Z",
      deactivated: false,
    });
  });

  it("ignores forged messages not signed by the DID root key", async () => {
    stubMirror([
      ...liveMessages(),
      {
        message: forgedEnvelope("update", {
          VerificationMethod: {
            id: `${TESTNET_DID}#evil-key`,
            type: "Ed25519VerificationKey2018",
            controller: TESTNET_DID,
            publicKeyBase58: "9XtbXXsRqiNaJJVCMEj22YE1BCJk1mfLyk21LeT9piEr",
          },
        }),
      },
      {
        message: forgedEnvelope("delete", {}),
      },
    ]);
    const result = await resolve(TESTNET_DID);
    // The forged additions and the forged deactivation both vanish.
    expect(result.didDocument).toEqual(REFERENCE_DOCUMENT);
    expect(result.didDocumentMetadata.deactivated).toBe(false);
  });

  it("ignores junk and unsigned envelopes on the public topic", async () => {
    stubMirror([
      { message: Buffer.from("not json at all").toString("base64") },
      {
        message: Buffer.from(
          JSON.stringify({
            message: { did: TESTNET_DID, operation: "delete" },
          }),
        ).toString("base64"),
      },
      ...liveMessages(),
    ]);
    const result = await resolve(TESTNET_DID);
    expect(result.didDocument).toEqual(REFERENCE_DOCUMENT);
  });

  it("returns notFound when no validly signed DIDOwner exists", async () => {
    stubMirror([
      { message: forgedEnvelope("create", { DIDOwner: { id: TESTNET_DID } }) },
    ]);
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });

  it("maps a missing topic to notFound", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBe("notFound");
  });
});

describe("did:hedera input handling", () => {
  it("rejects malformed identifiers offline", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const did of [
      "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp", // no topic
      "did:hedera:testnet:HirM7oP_0.0.1", // no z prefix
      "did:hedera:testnet:zabc_0.0.1", // key not 32 bytes
      "did:hedera:testnet:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_topic",
      "did:hedera:zHirM7oP62rzBmw4oSbWZTSeTLzb9zrDTfQa1cdMBWCPp_0.0.1",
    ]) {
      const result = await resolve(did);
      expect(result.didResolutionMetadata.error).toBe("invalidDid");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for unknown networks", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await resolve(TESTNET_DID.replace(":testnet:", ":sidenet:"));
    expect(result.didResolutionMetadata.error).toBe("notConfigured");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("honors mirror URL overrides", async () => {
    stubMirror(liveMessages(), "https://mirror.test");
    const result = await resolve(TESTNET_DID, {
      mirrorUrls: { testnet: "https://mirror.test" },
    });
    expect(result.didResolutionMetadata.error).toBeUndefined();
  });

  it("maps mirror transport failures to networkError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 503 })),
    );
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });

  it("rejects an oversized mirror response before parsing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("[".repeat(2 * 1024 * 1024))),
    );
    const result = await resolve(TESTNET_DID);
    expect(result.didResolutionMetadata.error).toBe("networkError");
  });
});

describe("did:hedera bounded-history fail-closed behavior", () => {
  it("fails closed instead of composing from a truncated history", async () => {
    stubMirror(liveMessages());
    const result = await resolve(TESTNET_DID, { maxMessages: 2 });
    expect(result.didResolutionMetadata.error).toBe("resourceLimitExceeded");
    expect(result.didDocument).toBeNull();
  });

  it("fails closed when unsigned flooding consumes the message budget", async () => {
    // The attacker needs no key: garbage messages still occupy history
    // positions, so they must exhaust the bound, never displace real events.
    const garbage = Array.from({ length: 3 }, (_, i) => ({
      message: Buffer.from(`flood ${i}`).toString("base64"),
    }));
    stubMirror([...garbage, ...liveMessages()]);
    const result = await resolve(TESTNET_DID, { maxMessages: 3 });
    expect(result.didResolutionMetadata.error).toBe("resourceLimitExceeded");
    expect(result.didDocument).toBeNull();
  });

  it("fails closed when the cap is reached with pages remaining", async () => {
    const capped = liveMessages().slice(0, 2);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          messages: capped,
          links: { next: "/api/v1/topics/0.0.7280148/messages?page=2" },
        }),
      ),
    );
    const result = await resolve(TESTNET_DID, { maxMessages: 2 });
    expect(result.didResolutionMetadata.error).toBe("resourceLimitExceeded");
    expect(result.didDocument).toBeNull();
  });
});

describe("did:hedera signed-event shape validation", () => {
  // A DID whose root key the test controls, so events can be VALIDLY signed.
  const SEED = new Uint8Array(32).fill(7);
  const PUB = ed25519.getPublicKey(SEED);
  const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const b58 = (bytes: Uint8Array): string => {
    let value = 0n;
    for (const byte of bytes) value = value * 256n + BigInt(byte);
    let out = "";
    while (value > 0n) {
      out = B58[Number(value % 58n)] + out;
      value /= 58n;
    }
    return out;
  };
  const SYNTH_DID = `did:hedera:testnet:z${b58(PUB)}_0.0.999`;

  function signedEnvelope(operation: string, event: unknown): string {
    const message = {
      timestamp: "2026-01-01T00:00:00.000000Z",
      operation,
      did: SYNTH_DID,
      event: Buffer.from(JSON.stringify(event)).toString("base64"),
    };
    const signature = ed25519.sign(
      new TextEncoder().encode(JSON.stringify(message)),
      SEED,
    );
    return Buffer.from(
      JSON.stringify({
        message,
        signature: Buffer.from(signature).toString("base64"),
      }),
    ).toString("base64");
  }

  const stubSynthTopic = (messages: { message: string }[]) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toContain("/api/v1/topics/0.0.999/messages");
        return Response.json({ messages, links: { next: null } });
      }),
    );

  const ownerEvent = {
    DIDOwner: {
      id: `${SYNTH_DID}#did-root-key`,
      controller: SYNTH_DID,
      publicKeyBase58: b58(PUB),
    },
  };

  it("never emits non-DID-Core relationship properties, even validly signed", async () => {
    stubSynthTopic([
      { message: signedEnvelope("create", ownerEvent) },
      {
        message: signedEnvelope("update", {
          VerificationRelationship: {
            id: `${SYNTH_DID}#evil`,
            relationshipType: "__proto__",
            type: "Ed25519VerificationKey2018",
            controller: SYNTH_DID,
            publicKeyBase58: b58(PUB),
          },
        }),
      },
    ]);
    const result = await resolve(SYNTH_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(doc, "__proto__")).toBe(false);
    expect(doc.authentication).toEqual([`${SYNTH_DID}#did-root-key`]);
  });

  it("ignores validly signed but structurally invalid entries", async () => {
    stubSynthTopic([
      { message: signedEnvelope("create", ownerEvent) },
      {
        // foreign-DID verification method id
        message: signedEnvelope("update", {
          VerificationMethod: {
            id: "did:hedera:testnet:zother_0.0.1#key",
            type: "Ed25519VerificationKey2018",
            controller: SYNTH_DID,
            publicKeyBase58: b58(PUB),
          },
        }),
      },
      {
        // key material missing
        message: signedEnvelope("update", {
          VerificationMethod: {
            id: `${SYNTH_DID}#keyless`,
            type: "Ed25519VerificationKey2018",
            controller: SYNTH_DID,
          },
        }),
      },
      {
        // non-string service endpoint
        message: signedEnvelope("update", {
          Service: {
            id: `${SYNTH_DID}#svc`,
            type: "LinkedDomains",
            serviceEndpoint: 42,
          },
        }),
      },
    ]);
    const result = await resolve(SYNTH_DID);
    expect(result.didResolutionMetadata.error).toBeUndefined();
    const doc = result.didDocument!;
    expect(doc.verificationMethod).toHaveLength(1);
    expect(doc.verificationMethod?.[0].id).toBe(`${SYNTH_DID}#did-root-key`);
    expect(doc.service).toBeUndefined();
  });
});
