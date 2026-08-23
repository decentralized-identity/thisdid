/**
 * Probation verification — the guarantee mechanism for newly added local
 * drivers. While a method is in PROBATION_METHODS (src/methods.ts), the
 * orchestrator resolves it through the local driver AND one redundant upstream
 * in parallel, then compares the two documents' security core:
 *
 *   - document `id` equality,
 *   - the MULTISET of (controller, public key value) pairs across all
 *     verification methods — two distinct methods carrying the same key stay
 *     two entries, and a controller change is a core change,
 *   - each verification relationship (`authentication`, `assertionMethod`,
 *     `keyAgreement`, `capabilityInvocation`, `capabilityDelegation`) as the
 *     set of key values it authorizes — references and embedded methods are
 *     resolved to the same form, so a key that is authentication-capable on
 *     one side but only keyAgreement-capable on the other is a mismatch.
 *     Purposes are compared ONLY when the upstream document expresses at
 *     least one relationship property: some upstream drivers (e.g. Godiddy's
 *     Transmute-based did:jwk driver) emit bare `verificationMethod` with no
 *     relationships at all, and a verifier that is silent on purposes has no
 *     opinion to disagree with — key material, controllers, id, and
 *     deactivation are still fully verified,
 *   - deactivation status.
 *
 * Cosmetic differences (`@context`, property order, fragment naming, whether
 * a relationship embeds its method or references it, extra metadata) are not
 * mismatches. A core mismatch is served conservatively from the upstream and
 * logged loudly with both documents for adjudication — the upstream is the
 * safe default while the new driver is unproven, not ground truth.
 *
 * Comparison is intentionally value-based per key-material field; a provider
 * expressing the same key in a different (non-normalized) encoding reads as a
 * mismatch, which fails in the conservative direction and surfaces in the
 * mismatch log.
 */
import type { DIDDocument, DIDResolutionResult } from "did-resolver";

export type VerificationStatus = "match" | "mismatch" | "unverified";

export interface VerificationMeta {
  status: VerificationStatus;
  /** Analytics tag of the verifying upstream (e.g. `godiddy`). */
  provider?: string;
  /** mismatch: `coreMismatch`; unverified: `upstreamUnavailable` | `upstreamRateLimited` | `upstreamUnsupported` | `unverifiableMaterial` | `upstream:<error>`. */
  reason?: string;
}

export interface MismatchRecord {
  did: string;
  method: string;
  provider: string;
  reason: string;
  localDocument: DIDDocument | null;
  upstreamDocument: DIDDocument | null;
  upstreamError?: string;
}

export interface ResolveHooks {
  /** Fired on every probation core mismatch, with both documents as evidence. */
  onMismatch?(record: MismatchRecord): void;
}

/** NEAR implicit accounts are deterministic and unresolvable upstream — nothing to compare. */
export function isVerificationExempt(method: string, did: string): boolean {
  return method === "near" && /^did:near:[0-9a-f]{64}$/.test(did);
}

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Ed25519 material is at most 34 bytes (0xed01 multicodec + 32 key bytes):
 * ~47 base58 chars as multibase, 44 as bare base58, 43 as JWK base64url `x`.
 * Anything longer cannot be an Ed25519 key and must never reach the O(n²)
 * BigInt base58 decoder — a bounded-but-large document could otherwise burn
 * CPU on a near-1 MiB `publicKeyMultibase` before the length check rejects it.
 */
const MAX_ED25519_ENCODED_CHARS = 64;

function base58Decode(encoded: string): Uint8Array | undefined {
  let value = 0n;
  for (const char of encoded) {
    const index = BASE58_ALPHABET.indexOf(char);
    if (index < 0) return undefined;
    value = value * 58n + BigInt(index);
  }
  let hex = value.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  const bytes = hex.match(/.{2}/g)?.map((b) => parseInt(b, 16)) ?? [];
  let leading = 0;
  for (const char of encoded) {
    if (char === "1") leading++;
    else break;
  }
  return new Uint8Array([...new Array<number>(leading).fill(0), ...bytes]);
}

function base64urlDecode(encoded: string): Uint8Array | undefined {
  try {
    const base64 =
      encoded.replace(/-/g, "+").replace(/_/g, "/") +
      "=".repeat((4 - (encoded.length % 4)) % 4);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return undefined;
  }
}

const toHex = (bytes: Uint8Array): string =>
  [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Providers legitimately express the same Ed25519 key as `publicKeyMultibase`
 * (z6Mk… = base58btc of 0xed01 + 32 bytes), `publicKeyJwk` (OKP `x` =
 * base64url of the 32 bytes), or bare `publicKeyBase58`. Normalize all three
 * to the raw key bytes so an encoding difference never reads as a mismatch.
 */
function ed25519Canonical(
  material: Record<string, unknown>,
): string | undefined {
  const multibase = material.publicKeyMultibase;
  if (
    typeof multibase === "string" &&
    multibase.startsWith("z6Mk") &&
    multibase.length <= MAX_ED25519_ENCODED_CHARS
  ) {
    const bytes = base58Decode(multibase.slice(1));
    if (bytes?.length === 34 && bytes[0] === 0xed && bytes[1] === 0x01) {
      return `ed25519:${toHex(bytes.subarray(2))}`;
    }
  }
  const jwk = material.publicKeyJwk as Record<string, unknown> | undefined;
  if (
    jwk?.kty === "OKP" &&
    jwk?.crv === "Ed25519" &&
    typeof jwk.x === "string" &&
    jwk.x.length <= MAX_ED25519_ENCODED_CHARS
  ) {
    const bytes = base64urlDecode(jwk.x);
    if (bytes?.length === 32) return `ed25519:${toHex(bytes)}`;
  }
  const base58 = material.publicKeyBase58;
  if (
    typeof base58 === "string" &&
    base58.length <= MAX_ED25519_ENCODED_CHARS &&
    typeof material.type === "string" &&
    material.type.includes("Ed25519")
  ) {
    const bytes = base58Decode(base58);
    if (bytes?.length === 32) return `ed25519:${toHex(bytes)}`;
  }
  return undefined;
}

/** Canonical JSON of a JWK's public members (sorted keys, public params only). */
function canonicalJwk(jwk: Record<string, unknown>): string {
  const publicMembers = ["kty", "crv", "x", "y", "e", "n"] as const;
  const entries = publicMembers
    .filter((k) => typeof jwk[k] === "string")
    .map((k) => `${k}:${jwk[k] as string}`);
  return entries.join("|");
}

/**
 * Iden3StateInfo2023 carries NO public key — its security material is the
 * on-chain identity state itself. Canonicalize the state-bearing fields so
 * two iden3/polygonid documents with different states, roots, contracts, or
 * proofs can never read as a match. Lifecycle timestamps/blocks are
 * legitimately read-time-dependent and are deliberately excluded.
 */
function iden3StateMaterial(vm: Record<string, unknown>): string {
  const str = (value: unknown): string =>
    typeof value === "string" || typeof value === "number" ? String(value) : "";
  const bool = (value: unknown): string =>
    typeof value === "boolean" ? String(value) : "";
  const info = (vm.info ?? {}) as Record<string, unknown>;
  const global = (vm.global ?? {}) as Record<string, unknown>;
  const proof = (global.proof ?? {}) as Record<string, unknown>;
  const siblings = Array.isArray(proof.siblings)
    ? proof.siblings.map(str).join(",")
    : "";
  return [
    "iden3state",
    `contract:${str(vm.stateContractAddress).toLowerCase()}`,
    `published:${bool(vm.published)}`,
    `state:${str(info.state).toLowerCase()}`,
    `replaced:${str(info.replacedByState).toLowerCase()}`,
    `root:${str(global.root).toLowerCase()}`,
    `rootReplaced:${str(global.replacedByRoot).toLowerCase()}`,
    `existence:${bool(proof.existence)}`,
    `siblings:${siblings}`,
  ].join("|");
}

/**
 * Normalized value of one verification method's key material, or undefined
 * when the method carries NOTHING this comparator understands — an opaque
 * method makes the whole document non-comparable (unverified), because
 * comparing opaque methods by fragment alone would let two documents with
 * different security state read as a match.
 */
function keyMaterial(vm: Record<string, unknown>): string | undefined {
  if (vm.type === "Iden3StateInfo2023") return iden3StateMaterial(vm);
  const ed25519 = ed25519Canonical(vm);
  if (ed25519) return ed25519;
  if (typeof vm.publicKeyMultibase === "string") {
    return `multibase:${vm.publicKeyMultibase}`;
  }
  if (typeof vm.publicKeyBase58 === "string") {
    return `base58:${vm.publicKeyBase58}`;
  }
  if (vm.publicKeyJwk && typeof vm.publicKeyJwk === "object") {
    return `jwk:${canonicalJwk(vm.publicKeyJwk as Record<string, unknown>)}`;
  }
  if (typeof vm.blockchainAccountId === "string") {
    return `caip10:${vm.blockchainAccountId}`;
  }
  return undefined;
}

const RELATIONSHIPS = [
  "authentication",
  "assertionMethod",
  "keyAgreement",
  "capabilityInvocation",
  "capabilityDelegation",
] as const;
type Relationship = (typeof RELATIONSHIPS)[number];

/** Fragment of a DID URL — providers agree on fragments, not always on form. */
function fragmentOf(id: unknown): string {
  if (typeof id !== "string") return "";
  const hash = id.indexOf("#");
  return hash >= 0 ? id.slice(hash + 1) : id;
}

/** Controller relative to the subject, so `controller: <doc id>` ≡ omitted. */
function controllerOf(vm: Record<string, unknown>, docId: string): string {
  const controller = vm.controller;
  if (typeof controller === "string") {
    return controller === docId ? "self" : controller;
  }
  if (Array.isArray(controller)) {
    return controller
      .map((c) => (c === docId ? "self" : String(c)))
      .sort()
      .join(",");
  }
  return "self";
}

interface SecurityCore {
  /** `controller|material` → occurrence count across verification methods. */
  keys: Map<string, number>;
  /** Per relationship: the set of key values it authorizes. */
  relationships: Record<Relationship, Set<string>>;
  /** True when any verification method carried no comparable material. */
  opaque: boolean;
}

function relationshipEntries(
  doc: DIDDocument,
  rel: Relationship,
): (string | Record<string, unknown>)[] {
  const value = doc[rel];
  return Array.isArray(value)
    ? (value as (string | Record<string, unknown>)[])
    : [];
}

/**
 * The comparable security core of a document. Methods embedded inside
 * relationship arrays count as verification methods too, so a provider that
 * embeds a method and one that lists + references it read identically. An
 * exact duplicate (same fragment, controller, and material — e.g. a method
 * both listed and embedded) counts once; two distinct methods carrying the
 * same key stay two entries.
 */
function securityCore(doc: DIDDocument): SecurityCore {
  const docId = doc.id;
  const materialByFragment = new Map<string, string>();
  const seen = new Set<string>();
  const keys = new Map<string, number>();
  let opaque = false;

  const register = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const vm = value as Record<string, unknown>;
    const fragment = fragmentOf(vm.id);
    const recognized = keyMaterial(vm);
    if (recognized === undefined) opaque = true;
    const material = recognized ?? `opaque:${fragment}`;
    materialByFragment.set(fragment, material);
    const controller = controllerOf(vm, docId);
    const identity = `${fragment}|${controller}|${material}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    const pair = `${controller}|${material}`;
    keys.set(pair, (keys.get(pair) ?? 0) + 1);
  };

  for (const vm of doc.verificationMethod ?? []) register(vm);
  for (const rel of RELATIONSHIPS) {
    for (const entry of relationshipEntries(doc, rel)) {
      if (typeof entry !== "string") register(entry);
    }
  }

  const relationships = {} as SecurityCore["relationships"];
  for (const rel of RELATIONSHIPS) {
    const authorized = new Set<string>();
    for (const entry of relationshipEntries(doc, rel)) {
      const fragment =
        typeof entry === "string" ? fragmentOf(entry) : fragmentOf(entry.id);
      // A dangling reference keeps its fragment so both sides must dangle
      // identically to match.
      authorized.add(materialByFragment.get(fragment) ?? `ref:${fragment}`);
    }
    relationships[rel] = authorized;
  }
  return { keys, relationships, opaque };
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

/** Whether the document expresses any relationship property at all (even empty). */
function expressesPurposes(doc: DIDDocument): boolean {
  return RELATIONSHIPS.some((rel) => Array.isArray(doc[rel]));
}

function deactivatedOf(result: DIDResolutionResult): boolean {
  return result.didDocumentMetadata?.deactivated === true;
}

/**
 * Compare the security cores of a local and an upstream resolution.
 * `incomparable` means a document carried a verification method whose
 * material this comparator does not understand — the guarantee cannot be
 * given, so the caller reports `unverified`, never a false `match`.
 */
export function compareCores(
  local: DIDResolutionResult,
  upstream: DIDResolutionResult,
): "match" | "mismatch" | "incomparable" {
  const localDoc = local.didDocument;
  const upstreamDoc = upstream.didDocument;
  if (!localDoc || !upstreamDoc) return "mismatch";
  if (localDoc.id !== upstreamDoc.id) return "mismatch";
  if (deactivatedOf(local) !== deactivatedOf(upstream)) return "mismatch";

  const localCore = securityCore(localDoc);
  const upstreamCore = securityCore(upstreamDoc);
  if (localCore.opaque || upstreamCore.opaque) return "incomparable";
  if (localCore.keys.size !== upstreamCore.keys.size) return "mismatch";
  for (const [pair, count] of localCore.keys) {
    if (upstreamCore.keys.get(pair) !== count) return "mismatch";
  }
  // Purposes are compared only when the verifier has an opinion on them: an
  // upstream driver that emits no relationship properties at all (e.g.
  // Godiddy's Transmute-based did:jwk) is silent on purposes, not in
  // disagreement — the reverse (local silent, upstream expressing) still
  // mismatches through the empty-vs-non-empty set comparison below.
  if (expressesPurposes(upstreamDoc)) {
    for (const rel of RELATIONSHIPS) {
      if (
        !setsEqual(
          localCore.relationships[rel],
          upstreamCore.relationships[rel],
        )
      ) {
        return "mismatch";
      }
    }
  }
  return "match";
}
