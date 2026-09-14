/**
 * did:plc identifier and document validation (ThisDID).
 *
 * Two gaps this closes:
 *
 *  - The identifier was passed to the PLC directory unchecked. A did:plc is
 *    `did:plc:` followed by exactly 24 base32 characters (the atproto
 *    `@atproto/did` package enforces this, but the resolver path in
 *    `@atproto/identity` never calls it), so malformed identifiers became
 *    directory requests.
 *  - Documents were validated with the schema `@atproto/common-web` itself
 *    marks deprecated and "less spec-compliant": verification-method ids,
 *    controllers, key material and service endpoints were all accepted as
 *    arbitrary strings. A compromised or misconfigured directory could hand
 *    back a document that no consumer could safely use, and it would be
 *    reported as an authoritative resolution.
 *
 * The checks here are structural — DID Core §5 plus the did:plc profile
 * (verification methods carry `publicKeyMultibase`, `alsoKnownAs` entries are
 * URIs). Nothing judges key material or service semantics, and a syntactically
 * valid URI is accepted whatever its scheme, so consumers must still apply
 * their own policy before dereferencing a service endpoint.
 */

import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";

const DID_PLC = /^did:plc:[a-z2-7]{24}$/;
const DID_CORE_CONTEXT = "https://www.w3.org/ns/did/v1";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MATERIAL_PROPERTIES = [
  "publicKeyJwk",
  "publicKeyMultibase",
  "publicKeyBase58",
  "publicKeyHex",
  "publicKeyPem",
  "blockchainAccountId",
] as const;
/** The key types the PLC directory publishes (AT Protocol signing keys). */
const PLC_KEY_CODECS: Record<
  number,
  { name: string; length: number; check: (bytes: Uint8Array) => void }
> = {
  0xe7: {
    name: "secp256k1",
    length: 33,
    check: (bytes) => {
      secp256k1.ProjectivePoint.fromHex(bytes);
    },
  },
  0x1200: {
    name: "p256",
    length: 33,
    check: (bytes) => {
      p256.ProjectivePoint.fromHex(bytes);
    },
  },
};

function base58Decode(text: string): Uint8Array | null {
  if (!BASE58_PATTERN.test(text)) return null;
  const bytes: number[] = [0];
  for (const ch of text) {
    let carry = BASE58.indexOf(ch);
    for (let i = 0; i < bytes.length; i += 1) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const ch of text) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Uint8Array.from(bytes.reverse());
}

/**
 * A did:plc verification method's Multikey: base58btc multibase, a multicodec
 * the directory publishes, the right length, and a point on the curve.
 */
function multikeyProblem(value: unknown): string | null {
  if (typeof value !== "string" || value[0] !== "z") {
    return "must be base58btc multibase (z…)";
  }
  const decoded = base58Decode(value.slice(1));
  if (!decoded || decoded.length === 0)
    return "must be base58btc multibase (z…)";
  // unsigned-varint multicodec: terminated, minimal (no trailing zero group)
  // and followed by key bytes — one key, one encoding.
  let codec = 0;
  let length = 0;
  let terminated = false;
  for (; length < decoded.length && length < 5; length += 1) {
    codec += (decoded[length] & 0x7f) * 2 ** (7 * length);
    if ((decoded[length] & 0x80) === 0) {
      terminated = true;
      length += 1;
      break;
    }
  }
  if (!terminated) return "multicodec varint does not terminate";
  if (length > 1 && decoded[length - 1] === 0)
    return "multicodec varint is not minimal";
  const spec = PLC_KEY_CODECS[codec];
  if (!spec) {
    return `multicodec 0x${codec.toString(16)} is not a key type did:plc publishes (secp256k1, p256)`;
  }
  const key = decoded.subarray(length);
  if (key.length !== spec.length) {
    return `${spec.name} needs ${spec.length} key bytes, got ${key.length}`;
  }
  try {
    spec.check(key);
  } catch {
    return `is not a valid ${spec.name} public key`;
  }
  return null;
}

/**
 * DID Core §6.3.1: a JSON-LD @context is the DID Core context, or a non-empty
 * array whose first item is that context and whose remaining items are context
 * URIs or embedded context objects. did:plc documents are always JSON-LD, so
 * it is required here.
 */
function contextProblem(context: unknown): string | null {
  if (context === undefined) return "@context is required";
  if (typeof context === "string") {
    return context === DID_CORE_CONTEXT
      ? null
      : `@context must be ${DID_CORE_CONTEXT}`;
  }
  if (!Array.isArray(context) || context.length === 0) {
    return `@context must be ${DID_CORE_CONTEXT} or a non-empty array starting with it`;
  }
  if (context[0] !== DID_CORE_CONTEXT)
    return `@context[0] must be ${DID_CORE_CONTEXT}`;
  for (let i = 1; i < context.length; i += 1) {
    const item = context[i];
    if (typeof item === "string" ? !isUri(item) : !isPlainObject(item)) {
      return `@context[${i}] must be a context URI or a context object`;
    }
  }
  return null;
}
const DID_PATTERN = /^did:[a-z0-9]+:[A-Za-z0-9._%:-]*[A-Za-z0-9._%-]$/;
const DID_URL_PATTERN = /^did:[a-z0-9]+:[^\s]+$/;
// DID Core §3.2.1: ids may be relative DID URLs resolved against the subject.
// The PLC directory publishes its service entries that way ("#atproto_pds").
const RELATIVE_REF = /^[#?/][^\s]*$/;

export class InvalidPlcDid extends Error {}
export class InvalidPlcDocument extends Error {}

/** True for a syntactically valid did:plc identifier. */
export function isDidPlc(did: string): boolean {
  return DID_PLC.test(did);
}

/** Throw unless `did` is a syntactically valid did:plc identifier. */
export function assertDidPlc(did: string): void {
  if (!isDidPlc(did)) {
    throw new InvalidPlcDid(
      `'${did}' is not a did:plc identifier (did:plc: followed by 24 base32 characters)`,
    );
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUri(value: string): boolean {
  if (value.length === 0) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function fail(detail: string): never {
  throw new InvalidPlcDocument(detail);
}

/** An id in a document: an absolute URI, or a relative DID URL resolved against `did`. */
function absoluteId(value: unknown, did: string): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (RELATIVE_REF.test(value)) return did + value;
  return isUri(value) ? value : null;
}

const RELATIONSHIPS = [
  "authentication",
  "assertionMethod",
  "keyAgreement",
  "capabilityInvocation",
  "capabilityDelegation",
] as const;

/** Validate a document returned by the directory. Throws on the first violation. */
export function assertValidPlcDocument(document: unknown, did: string): void {
  if (!isPlainObject(document)) fail("document must be a JSON object");
  if (document.id !== did) {
    fail(
      `document id '${String(document.id)}' does not match the requested did`,
    );
  }

  const context = contextProblem(document["@context"]);
  if (context !== null) fail(context);

  if (document.alsoKnownAs !== undefined) {
    if (!Array.isArray(document.alsoKnownAs))
      fail("alsoKnownAs must be an array");
    document.alsoKnownAs.forEach((handle, i) => {
      if (typeof handle !== "string" || !isUri(handle)) {
        fail(`alsoKnownAs[${i}] must be a URI`);
      }
    });
  }

  const ids = new Set<string>();
  const claim = (id: string, where: string) => {
    if (ids.has(id)) fail(`duplicate id '${id}' (${where})`);
    ids.add(id);
  };

  const methodIds = new Set<string>();
  const checkMethod = (vm: unknown, place: string) => {
    if (!isPlainObject(vm)) fail(`${place} must be an object`);
    const vmId = absoluteId(vm.id, did);
    if (vmId === null || !DID_URL_PATTERN.test(vmId)) {
      fail(`${place}.id must be a DID URL`);
    }
    if (typeof vm.type !== "string" || vm.type.length === 0) {
      fail(`${place}.type must be a string`);
    }
    if (typeof vm.controller !== "string" || !DID_PATTERN.test(vm.controller)) {
      fail(`${place}.controller must be a DID`);
    }
    // DID Core §5.2.1: exactly one verification-material property, and for
    // did:plc it is the Multikey the directory publishes, decoded fully.
    const present = MATERIAL_PROPERTIES.filter(
      (name) => vm[name] !== undefined,
    );
    if (present.length === 0) fail(`${place} has no verification material`);
    if (present.length > 1) {
      fail(
        `${place} has more than one verification material property (${present.join(", ")})`,
      );
    }
    if (present[0] !== "publicKeyMultibase") {
      fail(
        `${place} must carry publicKeyMultibase (did:plc publishes Multikey material)`,
      );
    }
    const keyProblem = multikeyProblem(vm.publicKeyMultibase);
    if (keyProblem !== null) fail(`${place}.publicKeyMultibase ${keyProblem}`);
    claim(vmId, place);
    methodIds.add(vmId);
  };

  if (document.verificationMethod !== undefined) {
    if (!Array.isArray(document.verificationMethod)) {
      fail("verificationMethod must be an array");
    }
    document.verificationMethod.forEach((vm, i) =>
      checkMethod(vm, `verificationMethod[${i}]`),
    );
  }

  // DID Core §5.3: a relationship entry is a method embedded there or a reference to a method defined
  // anywhere in the document — including one embedded under another relationship — so every method is
  // collected first (and validated like any other) and references are checked in a second pass,
  // whatever the order of the properties.
  const references: Array<{ place: string; id: string }> = [];
  for (const relationship of RELATIONSHIPS) {
    const value = document[relationship];
    if (value === undefined) continue;
    if (!Array.isArray(value)) fail(`${relationship} must be an array`);
    value.forEach((entry, i) => {
      if (typeof entry === "string") {
        const absolute = absoluteId(entry, did);
        if (absolute === null || !DID_URL_PATTERN.test(absolute)) {
          fail(`${relationship}[${i}] must be a DID URL`);
        }
        references.push({ place: `${relationship}[${i}]`, id: absolute });
        return;
      }
      if (!isPlainObject(entry)) {
        fail(
          `${relationship}[${i}] must be a DID URL or a verification method`,
        );
      }
      checkMethod(entry, `${relationship}[${i}]`);
    });
  }
  for (const { place, id } of references) {
    if (id.startsWith(did + "#") && !methodIds.has(id)) {
      fail(`${place} references undefined verification method '${id}'`);
    }
  }
  if (document.service !== undefined) {
    if (!Array.isArray(document.service)) fail("service must be an array");
    document.service.forEach((entry, i) => {
      if (!isPlainObject(entry)) fail(`service[${i}] must be a service object`);
      const serviceId = absoluteId(entry.id, did);
      if (serviceId === null) {
        fail(`service[${i}].id must be a URI or a relative DID URL`);
      }
      claim(serviceId, "service");
      const typeOk =
        (typeof entry.type === "string" && entry.type.length > 0) ||
        (Array.isArray(entry.type) &&
          entry.type.length > 0 &&
          entry.type.every((t) => typeof t === "string" && t.length > 0));
      if (!typeOk) {
        fail(
          `service[${i}].type must be a string or a non-empty array of strings`,
        );
      }
      const endpointOk = (value: unknown) =>
        (typeof value === "string" && isUri(value)) || isPlainObject(value);
      const endpoints = Array.isArray(entry.serviceEndpoint)
        ? entry.serviceEndpoint
        : [entry.serviceEndpoint];
      if (
        entry.serviceEndpoint === undefined ||
        endpoints.length === 0 ||
        !endpoints.every(endpointOk)
      ) {
        fail(
          `service[${i}].serviceEndpoint must be a URI, a map, or a non-empty set of them`,
        );
      }
    });
  }
}
