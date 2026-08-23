/**
 * did:hedera resolver for the DIF `did-resolver` interface.
 *
 * A clean-room driver over Hedera's PUBLIC mirror-node REST API — no
 * `@hashgraph/sdk`, no keys, no fees. A did:hedera identifier names an
 * Ed25519 root key and an HCS topic (`did:hedera:<network>:z<base58-key>_
 * <shard.realm.num>`); the topic's messages are the DID's event log.
 *
 * HCS topics are PUBLICLY WRITABLE, so trust comes from signatures, not
 * from the topic: every message envelope carries an Ed25519 signature over
 * the serialized `message` object, and this driver verifies each one
 * against the DID root key (validated live: all captured envelopes verify
 * exactly this way) — unsigned or mis-signed messages are ignored, exactly
 * as the reference SDK ignores them. Events then fold in consensus order:
 * DIDOwner (create), VerificationMethod / VerificationRelationship /
 * Service upserts, `revoke` removals, and `delete` (deactivation).
 *
 * The composed document matches the reference driver output: the root key
 * renders as `#did-root-key` (Ed25519VerificationKey2020, multibase
 * `z6Mk…` = base58btc of 0xed01 + key) holding `authentication` and
 * `assertionMethod`; added methods/services render verbatim after shape
 * validation (see isValidEventEntry).
 *
 * Event history is BOUNDED AND FAIL-CLOSED: a topic with more messages than
 * `maxMessages` refuses to resolve (`resourceLimitExceeded`) rather than
 * composing from partial history — silent truncation would drop later
 * rotations/revocations/deletions, and on a publicly writable topic an
 * attacker could flood early positions to push signed events past any cap.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
  Service,
  VerificationMethod as DidVerificationMethod,
} from "did-resolver";
import { ed25519 } from "@noble/curves/ed25519";

export interface HederaResolverOptions {
  /** Network → mirror-node base URL. Defaults to Hedera's public mirrors. */
  mirrorUrls?: Record<string, string>;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
  /** Upper bound on topic messages folded per DID. Default 1000. */
  maxMessages?: number;
}

const DEFAULT_MIRROR_URLS: Record<string, string> = {
  mainnet: "https://mainnet-public.mirrornode.hedera.com",
  testnet: "https://testnet.mirrornode.hedera.com",
  previewnet: "https://previewnet.mirrornode.hedera.com",
};
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_MESSAGES = 1000;
const PAGE_LIMIT = 100;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TOPIC_RE = /^\d{1,10}\.\d{1,10}\.\d{1,12}$/;

const CONTEXTS = [
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/suites/ed25519-2020/v1",
  "https://w3id.org/security/suites/ed25519-2018/v1",
];

class ResolutionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

// ── encoding helpers ────────────────────────────────────────────────────────

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Decode(encoded: string): Uint8Array | undefined {
  let value = 0n;
  for (const char of encoded) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return undefined;
    value = value * 58n + BigInt(index);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes =
    hex === "0" ? [] : (hex.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16));
  let leading = 0;
  for (const char of encoded) {
    if (char === "1") leading++;
    else break;
  }
  return new Uint8Array([...new Array<number>(leading).fill(0), ...bytes]);
}

function base58Encode(bytes: Uint8Array): string {
  let value = 0n;
  for (const byte of bytes) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = BASE58_ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte === 0) out = "1" + out;
    else break;
  }
  return out || "1";
}

function base64Decode(encoded: string): Uint8Array | undefined {
  try {
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

/** Ed25519 multibase (`z6Mk…`): base58btc of 0xed01 + the 32 key bytes. */
function ed25519Multibase(key: Uint8Array): string {
  const prefixed = new Uint8Array(2 + key.length);
  prefixed[0] = 0xed;
  prefixed[1] = 0x01;
  prefixed.set(key, 2);
  return "z" + base58Encode(prefixed);
}

/** Mirror timestamps carry microseconds; documents use millisecond Z form. */
function toMillisZ(timestamp: string): string {
  const match = timestamp.match(/^(.+?\.\d{3})\d*Z?$/);
  return match ? `${match[1]}Z` : timestamp;
}

// ── event model ─────────────────────────────────────────────────────────────

interface OwnerEvent {
  controller?: string;
  publicKeyBase58?: string;
}

/** The only relationship property names DID Core defines — a signed event
 * naming anything else (including prototype-polluting names) is ignored. */
const RELATIONSHIP_TYPES = new Set([
  "authentication",
  "assertionMethod",
  "keyAgreement",
  "capabilityInvocation",
  "capabilityDelegation",
]);

/** A DID URL fragment under the resolved DID (`<did>#...`). */
function isOwnFragmentId(value: unknown, did: string): value is string {
  return (
    typeof value === "string" &&
    value.startsWith(`${did}#`) &&
    value.length > did.length + 1
  );
}

/**
 * A signature proves the ROOT KEY authorized the event, not that the event
 * is structurally sound — validate shapes before folding into state.
 * Verification methods (and relationship entries, which carry the same
 * material) need an own-DID id, a string type and controller, and string key
 * material; services need an own-DID id, a string type, and a string
 * endpoint. Invalid entries are ignored deterministically; duplicates
 * resolve last-write-wins via Map semantics.
 */
function isValidEventEntry(
  kind: string,
  entry: Record<string, unknown>,
  did: string,
): boolean {
  if (kind === "DIDOwner") {
    return (
      entry.controller === undefined || typeof entry.controller === "string"
    );
  }
  if (!isOwnFragmentId(entry.id, did)) return false;
  if (kind === "Service") {
    return (
      typeof entry.type === "string" &&
      typeof entry.serviceEndpoint === "string"
    );
  }
  // VerificationMethod / VerificationRelationship
  const hasMaterial =
    typeof entry.publicKeyBase58 === "string" ||
    typeof entry.publicKeyMultibase === "string";
  const validRelationship =
    kind !== "VerificationRelationship" ||
    (typeof entry.relationshipType === "string" &&
      RELATIONSHIP_TYPES.has(entry.relationshipType));
  return (
    typeof entry.type === "string" &&
    typeof entry.controller === "string" &&
    hasMaterial &&
    validRelationship
  );
}

interface DidState {
  owner?: OwnerEvent;
  methods: Map<string, Record<string, unknown>>;
  relationships: Map<string, Record<string, unknown>>;
  services: Map<string, Record<string, unknown>>;
  deactivated: boolean;
  created?: string;
  updated?: string;
}

export function getResolver(options?: HederaResolverOptions): ResolverRegistry {
  const mirrorUrls = { ...DEFAULT_MIRROR_URLS, ...(options?.mirrorUrls ?? {}) };
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;

  async function readBounded(response: Response): Promise<string | null> {
    if (
      Number(response.headers.get("content-length") ?? 0) > MAX_RESPONSE_BYTES
    ) {
      return null;
    }
    if (!response.body) return "";
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  /**
   * All topic messages in consensus order (paginated, bounded, FAIL-CLOSED).
   *
   * The bound must never silently truncate: a rotation, revocation, or
   * deletion after the cap would be ignored, and — because HCS topics are
   * publicly writable — an attacker without the root key could flood the
   * early positions with garbage to push validly signed events past any
   * cap. A topic whose history exceeds `maxMessages` therefore fails the
   * whole resolution rather than composing from partial history.
   */
  async function fetchTopicMessages(
    mirrorBase: string,
    topicId: string,
  ): Promise<{ message: string }[]> {
    const messages: { message: string }[] = [];
    let path = `/api/v1/topics/${topicId}/messages?limit=${PAGE_LIMIT}&order=asc`;
    const pageCap = Math.ceil(maxMessages / PAGE_LIMIT) + 2;
    const truncated = (): ResolutionError =>
      new ResolutionError(
        "resourceLimitExceeded",
        `topic has more than ${maxMessages} messages; refusing to resolve from partial history`,
      );
    for (let page = 0; ; page++) {
      if (page >= pageCap) throw truncated();
      const response = await fetch(`${mirrorBase}${path}`, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404) {
        throw new ResolutionError("notFound", "HCS topic does not exist");
      }
      if (!response.ok) {
        throw new ResolutionError(
          "networkError",
          `mirror node HTTP ${response.status}`,
        );
      }
      const text = await readBounded(response);
      if (text === null) {
        throw new ResolutionError(
          "networkError",
          "response exceeds size bound",
        );
      }
      const body = JSON.parse(text) as {
        messages?: { message: string }[];
        links?: { next?: string | null };
      };
      messages.push(...(body.messages ?? []));
      if (messages.length > maxMessages) throw truncated();
      const next = body.links?.next;
      if (!next) break;
      if (messages.length >= maxMessages) throw truncated();
      path = next;
    }
    return messages;
  }

  /** Verify + fold one raw mirror message into the DID state. */
  function applyMessage(
    state: DidState,
    did: string,
    rootKey: Uint8Array,
    raw: { message: string },
  ): void {
    const envelopeBytes = base64Decode(raw.message);
    if (!envelopeBytes) return;
    let envelope: {
      message?: {
        timestamp?: string;
        operation?: string;
        did?: string;
        event?: string;
      };
      signature?: string;
    };
    try {
      envelope = JSON.parse(new TextDecoder().decode(envelopeBytes)) as never;
    } catch {
      return; // not a DID message — topics are public, ignore
    }
    const message = envelope.message;
    if (!message || message.did !== did) return;

    // The topic is publicly writable: only messages signed by the DID root
    // key over the serialized message object are trusted (validated live).
    const signature = envelope.signature
      ? base64Decode(envelope.signature)
      : undefined;
    if (signature?.length !== 64) return;
    const payload = new TextEncoder().encode(JSON.stringify(message));
    try {
      if (!ed25519.verify(signature, payload, rootKey)) return;
    } catch {
      return;
    }

    const timestamp = toMillisZ(String(message.timestamp ?? ""));
    const operation = message.operation;

    if (operation === "delete") {
      state.methods.clear();
      state.relationships.clear();
      state.services.clear();
      state.owner = undefined;
      state.deactivated = true;
      state.updated = timestamp;
      return;
    }

    const eventBytes = message.event ? base64Decode(message.event) : undefined;
    if (!eventBytes) return;
    let event: Record<string, Record<string, unknown>>;
    try {
      event = JSON.parse(new TextDecoder().decode(eventBytes)) as never;
    } catch {
      return;
    }

    const apply = (kind: string, entry: Record<string, unknown>): void => {
      const id = String(entry.id ?? "");
      if (operation === "revoke") {
        if (kind === "VerificationMethod") state.methods.delete(id);
        else if (kind === "VerificationRelationship")
          state.relationships.delete(id);
        else if (kind === "Service") state.services.delete(id);
        return;
      }
      if (!isValidEventEntry(kind, entry, did)) return;
      if (kind === "DIDOwner") {
        state.owner = entry as OwnerEvent;
        state.deactivated = false;
        state.created ??= timestamp;
      } else if (kind === "VerificationMethod") {
        state.methods.set(id, entry);
      } else if (kind === "VerificationRelationship") {
        state.relationships.set(id, entry);
      } else if (kind === "Service") {
        state.services.set(id, entry);
      }
    };
    for (const [kind, entry] of Object.entries(event)) {
      if (entry && typeof entry === "object") apply(kind, entry);
    }
    state.updated = timestamp;
  }

  const hedera = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (
        segments.length !== 4 ||
        segments[0] !== "did" ||
        segments[1] !== "hedera"
      ) {
        return errorResult("invalidDid");
      }
      const network = segments[2];
      const [idString, topicId, ...rest] = segments[3].split("_");
      if (
        rest.length > 0 ||
        !idString?.startsWith("z") ||
        !topicId ||
        !TOPIC_RE.test(topicId)
      ) {
        return errorResult(
          "invalidDid",
          "expected did:hedera:<network>:z<base58-key>_<shard.realm.num>",
        );
      }
      const rootKey = base58Decode(idString.slice(1));
      if (rootKey?.length !== 32) {
        return errorResult(
          "invalidDid",
          "identifier is not a base58 Ed25519 public key",
        );
      }
      const mirrorBase = mirrorUrls[network]?.replace(/\/+$/, "");
      if (!mirrorBase) {
        return errorResult(
          "notConfigured",
          `no mirror node configured for network \`${network}\``,
        );
      }

      const rawMessages = await fetchTopicMessages(mirrorBase, topicId);
      const state: DidState = {
        methods: new Map(),
        relationships: new Map(),
        services: new Map(),
        deactivated: false,
      };
      for (const raw of rawMessages) applyMessage(state, did, rootKey, raw);

      if (state.deactivated) {
        return {
          didResolutionMetadata: { contentType: "application/did+ld+json" },
          didDocument: { id: did },
          didDocumentMetadata: {
            deactivated: true,
            ...(state.created ? { created: state.created } : {}),
            ...(state.updated ? { updated: state.updated } : {}),
          },
        };
      }
      if (!state.owner) {
        return errorResult(
          "notFound",
          "no validly signed DIDOwner event on the topic",
        );
      }

      const rootKeyId = `${did}#did-root-key`;
      const verificationMethod: DidVerificationMethod[] = [
        {
          id: rootKeyId,
          controller: state.owner.controller ?? did,
          type: "Ed25519VerificationKey2020",
          publicKeyMultibase: ed25519Multibase(rootKey),
        },
        ...[...state.methods.values()].map(
          (m) => m as unknown as DidVerificationMethod,
        ),
      ];
      const relationships: Record<string, string[]> = {
        authentication: [rootKeyId],
        assertionMethod: [rootKeyId],
      };
      for (const entry of state.relationships.values()) {
        const type = String(entry.relationshipType ?? "");
        const id = String(entry.id ?? "");
        // Entries were validated at fold time; re-check the whitelist here so
        // composition can never emit a non-DID-Core relationship property.
        if (!RELATIONSHIP_TYPES.has(type) || !id) continue;
        (relationships[type] ??= []).push(id);
        // relationship events carry the key material too — surface it once.
        if (!state.methods.has(id)) {
          const { relationshipType: _dropped, ...method } = entry;
          verificationMethod.push(method as unknown as DidVerificationMethod);
        }
      }

      const service = [...state.services.values()] as unknown as Service[];
      const didDocument: DIDDocument = {
        "@context": CONTEXTS as never,
        id: did,
        controller: state.owner.controller ?? did,
        verificationMethod,
        ...(service.length ? { service } : {}),
        ...relationships,
      };
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument,
        didDocumentMetadata: {
          ...(state.created ? { created: state.created } : {}),
          ...(state.updated ? { updated: state.updated } : {}),
          deactivated: false,
        },
      };
    } catch (cause) {
      if (cause instanceof ResolutionError) {
        return errorResult(cause.code, cause.message);
      }
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { hedera } as ResolverRegistry;
}
