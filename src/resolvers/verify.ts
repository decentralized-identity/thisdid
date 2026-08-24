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
 *     A provider that is silent on purposes yields `incomparable`, never a
 *     full match: matching key material alone does not prove authorization,
 *   - root DID controllers, alsoKnownAs assertions, and service definitions,
 *   - complete absolute verification-method/reference identity (relative
 *     fragments are resolved against the subject; foreign DID URLs remain
 *     foreign),
 *   - deactivation status.
 *
 * Representation-only differences (`@context`, property order, whether a
 * relationship embeds its method or references it, extra non-core metadata)
 * are not mismatches. A core mismatch is served conservatively from the
 * vetted upstream and logged with both documents for adjudication.
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

function validPublicJwk(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const jwk = value as Record<string, unknown>;
  if (jwk.d !== undefined || typeof jwk.kty !== "string") return false;
  if (jwk.kty === "OKP") {
    return typeof jwk.crv === "string" && typeof jwk.x === "string";
  }
  if (jwk.kty === "EC") {
    return (
      typeof jwk.crv === "string" &&
      typeof jwk.x === "string" &&
      typeof jwk.y === "string"
    );
  }
  if (jwk.kty === "RSA") {
    return typeof jwk.n === "string" && typeof jwk.e === "string";
  }
  return false;
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
/**
 * Tezos account-anchored verification method types: in did:tz the CAIP-10
 * address IS the key commitment (a BLAKE2b-20 digest of the public key),
 * and providers legitimately differ in whether they ALSO enrich the method
 * with the revealed key (ThisDID's driver does, after re-deriving the
 * address from it; didkit-based upstreams serve the bare derivation).
 * Inside a did:tz document these types compare on the account anchor so an
 * enriched document and a bare derivation of the same account match.
 *
 * DELIBERATELY SCOPED to did:tz documents: `EcdsaSecp256k1RecoveryMethod2020`
 * also appears in other methods (ethr and friends), where supplied key
 * material must keep being compared as key material — an account-id
 * coincidence there must never mask differing keys.
 */
const TZ_ACCOUNT_ANCHORED_VM_TYPES = new Set([
  "Ed25519PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
  "EcdsaSecp256k1RecoveryMethod2020",
  "P256PublicKeyBLAKE2BDigestSize20Base58CheckEncoded2021",
]);

function keyMaterial(
  vm: Record<string, unknown>,
  tezosDocument: boolean,
): string | undefined {
  if (vm.type === "Iden3StateInfo2023") return iden3StateMaterial(vm);
  if (
    tezosDocument &&
    TZ_ACCOUNT_ANCHORED_VM_TYPES.has(vm.type as string) &&
    typeof vm.blockchainAccountId === "string"
  ) {
    return `caip10:${vm.blockchainAccountId}`;
  }
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

function hasValidMaterial(
  vm: Record<string, unknown>,
  tezosDocument: boolean,
): boolean {
  if (vm.type === "Iden3StateInfo2023") return true;
  if (tezosDocument && TZ_ACCOUNT_ANCHORED_VM_TYPES.has(vm.type as string)) {
    return typeof vm.blockchainAccountId === "string";
  }
  const cryptographic = [
    typeof vm.publicKeyMultibase === "string",
    typeof vm.publicKeyBase58 === "string",
    vm.publicKeyJwk !== undefined,
  ].filter(Boolean).length;
  const account = typeof vm.blockchainAccountId === "string";
  return (
    cryptographic <= 1 &&
    (cryptographic === 1 || account) &&
    (vm.publicKeyJwk === undefined || validPublicJwk(vm.publicKeyJwk))
  );
}

const RELATIONSHIPS = [
  "authentication",
  "assertionMethod",
  "keyAgreement",
  "capabilityInvocation",
  "capabilityDelegation",
] as const;
type Relationship = (typeof RELATIONSHIPS)[number];

/** Resolve a relative fragment against the subject; preserve foreign DID URLs. */
function normalizeMethodId(id: unknown, docId: string): string | undefined {
  if (typeof id !== "string" || !id) return undefined;
  if (id.startsWith("#")) return `${docId}${id}`;
  return id.startsWith("did:") ? id : undefined;
}

/** Verification-method controller is REQUIRED by DID Core. */
function controllerOf(
  vm: Record<string, unknown>,
  docId: string,
): string | undefined {
  const controller = vm.controller;
  if (typeof controller === "string") {
    return controller === docId ? "self" : controller;
  }
  return undefined;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function normalizedStringSet(value: unknown): string | undefined {
  if (value === undefined) return "[]";
  const entries = typeof value === "string" ? [value] : value;
  if (!Array.isArray(entries) || entries.some((v) => typeof v !== "string")) {
    return undefined;
  }
  return stableJson([...new Set(entries)].sort());
}

function normalizedServices(value: unknown, docId: string): string | undefined {
  if (value === undefined) return "[]";
  if (!Array.isArray(value)) return undefined;
  const ids = new Set<string>();
  const services: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return undefined;
    }
    const service = entry as Record<string, unknown>;
    const serviceId = normalizeMethodId(service.id, docId);
    if (
      !serviceId ||
      typeof service.type !== "string" ||
      !service.type ||
      service.serviceEndpoint === undefined ||
      ids.has(serviceId)
    ) {
      return undefined;
    }
    ids.add(serviceId);
    services.push(stableJson({ ...service, id: serviceId }));
  }
  return stableJson(services.sort());
}

interface SecurityCore {
  /** `controller|material` → occurrence count across verification methods. */
  keys: Map<string, number>;
  /** Per relationship: the set of key values it authorizes. */
  relationships: Record<Relationship, Set<string>>;
  /** True when any verification method carried no comparable material. */
  opaque: boolean;
  /** True when the DID document is structurally unsafe to compare. */
  invalid: boolean;
  rootController: string;
  alsoKnownAs: string;
  services: string;
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
  const tezosDocument =
    typeof docId === "string" && docId.startsWith("did:tz:");
  const materialByFragment = new Map<string, string>();
  const registeredById = new Map<string, string>();
  const seen = new Set<string>();
  const keys = new Map<string, number>();
  let opaque = false;
  let invalid = false;

  const register = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const vm = value as Record<string, unknown>;
    const methodId = normalizeMethodId(vm.id, docId);
    const controller = controllerOf(vm, docId);
    if (
      !methodId ||
      !controller ||
      typeof vm.type !== "string" ||
      !vm.type ||
      !hasValidMaterial(vm, tezosDocument)
    ) {
      invalid = true;
      return;
    }
    const recognized = keyMaterial(vm, tezosDocument);
    if (recognized === undefined) opaque = true;
    const material = recognized ?? `opaque:${methodId}`;
    const signature = `${controller}|${material}`;
    const prior = registeredById.get(methodId);
    if (prior) {
      if (prior !== signature) invalid = true;
      return;
    }
    registeredById.set(methodId, signature);
    materialByFragment.set(methodId, material);
    const identity = `${methodId}|${controller}|${material}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    const pair = `${methodId}|${controller}|${material}`;
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
      const methodId = normalizeMethodId(
        typeof entry === "string" ? entry : entry.id,
        docId,
      );
      if (!methodId) {
        invalid = true;
        continue;
      }
      authorized.add(materialByFragment.get(methodId) ?? `ref:${methodId}`);
    }
    relationships[rel] = authorized;
  }
  const rootController = normalizedStringSet(doc.controller);
  const alsoKnownAs = normalizedStringSet(doc.alsoKnownAs);
  const services = normalizedServices(doc.service, docId);
  if (
    rootController === undefined ||
    alsoKnownAs === undefined ||
    services === undefined
  ) {
    invalid = true;
  }
  return {
    keys,
    relationships,
    opaque,
    invalid,
    rootController: rootController ?? "invalid",
    alsoKnownAs: alsoKnownAs ?? "invalid",
    services: services ?? "invalid",
  };
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
  const localDeactivated = deactivatedOf(local);
  const upstreamDeactivated = deactivatedOf(upstream);
  if (localDeactivated !== upstreamDeactivated) return "mismatch";
  if (localDeactivated && upstreamDeactivated) return "match";
  if (!localDoc || !upstreamDoc) return "mismatch";
  if (localDoc.id !== upstreamDoc.id) return "mismatch";

  const localCore = securityCore(localDoc);
  const upstreamCore = securityCore(upstreamDoc);
  if (
    localCore.invalid ||
    upstreamCore.invalid ||
    localCore.opaque ||
    upstreamCore.opaque ||
    localCore.keys.size === 0 ||
    upstreamCore.keys.size === 0
  ) {
    return "incomparable";
  }
  if (
    localCore.rootController !== upstreamCore.rootController ||
    localCore.alsoKnownAs !== upstreamCore.alsoKnownAs ||
    localCore.services !== upstreamCore.services
  ) {
    return "mismatch";
  }
  if (localCore.keys.size !== upstreamCore.keys.size) return "mismatch";
  for (const [pair, count] of localCore.keys) {
    if (upstreamCore.keys.get(pair) !== count) return "mismatch";
  }
  // Matching key material is not proof of matching authorization. When only
  // one provider expresses verification relationships, the result is partial
  // and therefore incomparable rather than a full match.
  if (expressesPurposes(localDoc) !== expressesPurposes(upstreamDoc)) {
    return "incomparable";
  }
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
