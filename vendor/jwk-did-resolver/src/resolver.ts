/**
 * did:jwk resolver for the DIF `did-resolver` interface.
 *
 * A clean-room implementation of the did:jwk method specification
 * (https://github.com/quartzjer/did-jwk/blob/main/spec.md): the identifier is
 * a base64url-encoded JSON Web Key, and resolution is a deterministic, fully
 * offline transformation of that key into a DID document. Zero runtime
 * dependencies.
 *
 * Security posture (stricter than the letter of the spec, per ThisDID's
 * driver acceptance checklist):
 *  - any private/symmetric JWK member (`d`, `p`, `q`, `dp`, `dq`, `qi`,
 *    `oth`, `k`) rejects the DID rather than being stripped — a published
 *    private key is a compromised key and must not be laundered into a
 *    "valid" document;
 *  - only public-capable key types (`EC`, `OKP`, `RSA`) with their required
 *    public members are accepted, and only known curves: P-256, P-384,
 *    P-521, secp256k1 (EC) and Ed25519, Ed448, X25519, X448 (OKP);
 *  - key material must be valid base64url and decode to the exact
 *    coordinate length its curve requires; RSA moduli must be 2048–8192
 *    bits with no leading zero octet, and the public exponent must be an
 *    odd integer ≥ 3 of at most 8 octets (point-on-curve validation would
 *    need a crypto library and is intentionally out of scope);
 *  - verification relationships follow what the key can actually do, a
 *    deliberate deviation from the spec's use-based mapping: signing-only
 *    keys (Ed25519/Ed448, RSA, or any key with `use: "sig"`) never get
 *    `keyAgreement`, agreement-only curves (X25519/X448) get only
 *    `keyAgreement`, and contradictory combinations (`use: "sig"` on X25519,
 *    `use: "enc"` on Ed25519 or RSA) are rejected;
 *  - the encoded identifier is size-bounded before decoding and parsing.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  ResolverRegistry,
  VerificationMethod,
} from "did-resolver";

/** Bound the encoded JWK before any decode/parse work. */
const MAX_ENCODED_CHARS = 4096;

const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

/** JWK members that carry private or symmetric key material. */
const PRIVATE_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "oth", "k"];

/** Public members required per key type (RFC 7518). */
const REQUIRED_MEMBERS: Record<string, string[]> = {
  EC: ["crv", "x", "y"],
  OKP: ["crv", "x"],
  RSA: ["n", "e"],
};

/** Supported EC curves and their decoded coordinate length in octets. */
const EC_CURVES: Record<string, number> = {
  "P-256": 32,
  "P-384": 48,
  "P-521": 66,
  secp256k1: 32,
};

/** Supported OKP curves: decoded key length and the capability class. */
const OKP_CURVES: Record<
  string,
  { length: number; capability: "sig" | "enc" }
> = {
  Ed25519: { length: 32, capability: "sig" },
  Ed448: { length: 57, capability: "sig" },
  X25519: { length: 32, capability: "enc" },
  X448: { length: 56, capability: "enc" },
};

/** RSA modulus bounds in octets: 2048-bit minimum, 8192-bit ceiling. */
const RSA_MODULUS_MIN_OCTETS = 256;
const RSA_MODULUS_MAX_OCTETS = 1024;

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

function base64urlDecode(encoded: string): Uint8Array {
  const base64 =
    encoded.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Parse and validate the encoded JWK; returns the JWK or an error message. */
function decodeJwk(
  encoded: string,
): { jwk: Record<string, unknown> } | { invalid: string } {
  if (encoded.length > MAX_ENCODED_CHARS) {
    return { invalid: "encoded JWK exceeds the size bound" };
  }
  if (!BASE64URL_RE.test(encoded)) {
    return { invalid: "identifier is not base64url" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(base64urlDecode(encoded)));
  } catch {
    return { invalid: "identifier does not decode to a JSON object" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { invalid: "decoded value is not a JWK object" };
  }
  const jwk = parsed as Record<string, unknown>;

  for (const member of PRIVATE_MEMBERS) {
    if (member in jwk) {
      return {
        invalid: `JWK contains private key material (\`${member}\`); did:jwk must embed a public key only`,
      };
    }
  }
  const kty = jwk.kty;
  if (typeof kty !== "string" || !(kty in REQUIRED_MEMBERS)) {
    return { invalid: "JWK `kty` must be one of EC, OKP, RSA" };
  }
  for (const member of REQUIRED_MEMBERS[kty]) {
    if (typeof jwk[member] !== "string" || jwk[member] === "") {
      return { invalid: `JWK is missing required \`${member}\` for ${kty}` };
    }
  }
  if ("use" in jwk && jwk.use !== "sig" && jwk.use !== "enc") {
    return { invalid: "JWK `use` must be `sig` or `enc` when present" };
  }
  const material = validateMaterial(jwk);
  if (material) return { invalid: material };
  return { jwk };
}

/** Validate curve support, base64url encoding, and decoded key lengths. */
function validateMaterial(jwk: Record<string, unknown>): string | undefined {
  const decode = (member: string): Uint8Array | undefined => {
    const value = jwk[member] as string;
    if (!BASE64URL_RE.test(value)) return undefined;
    try {
      return base64urlDecode(value);
    } catch {
      return undefined;
    }
  };
  if (jwk.kty === "EC") {
    const crv = jwk.crv as string;
    const length = EC_CURVES[crv];
    if (!length) return `unsupported EC curve \`${crv}\``;
    for (const member of ["x", "y"]) {
      const bytes = decode(member);
      if (!bytes) return `JWK \`${member}\` is not valid base64url`;
      if (bytes.length !== length) {
        return `JWK \`${member}\` must decode to ${length} octets for ${crv}`;
      }
    }
    return undefined;
  }
  if (jwk.kty === "OKP") {
    const crv = jwk.crv as string;
    const curve = OKP_CURVES[crv];
    if (!curve) return `unsupported OKP curve \`${crv}\``;
    const bytes = decode("x");
    if (!bytes) return "JWK `x` is not valid base64url";
    if (bytes.length !== curve.length) {
      return `JWK \`x\` must decode to ${curve.length} octets for ${crv}`;
    }
    if (jwk.use === "sig" && curve.capability === "enc") {
      return `${crv} is an agreement-only curve and cannot carry \`use: "sig"\``;
    }
    if (jwk.use === "enc" && curve.capability === "sig") {
      return `${crv} is a signing-only curve and cannot carry \`use: "enc"\``;
    }
    return undefined;
  }
  // RSA (RFC 7518 §6.3: unsigned big-endian octets, no leading zeros).
  const n = decode("n");
  if (!n) return "JWK `n` is not valid base64url";
  if (n.length < RSA_MODULUS_MIN_OCTETS) {
    return "RSA modulus must be at least 2048 bits";
  }
  if (n.length > RSA_MODULUS_MAX_OCTETS) {
    return "RSA modulus must be at most 8192 bits";
  }
  if (n[0] === 0) return "RSA modulus has a leading zero octet";
  const e = decode("e");
  if (!e) return "JWK `e` is not valid base64url";
  if (e.length === 0 || e.length > 8) {
    return "RSA public exponent must be 1-8 octets";
  }
  if (e.length > 1 && e[0] === 0) {
    return "RSA public exponent has a leading zero octet";
  }
  if ((e[e.length - 1] & 1) === 0 || (e.length === 1 && e[0] < 3)) {
    return "RSA public exponent must be an odd integer of at least 3";
  }
  if (jwk.use === "enc") {
    return 'RSA cannot perform key agreement; `use: "enc"` is not representable as a DID verification relationship';
  }
  return undefined;
}

function buildDocument(did: string, jwk: Record<string, unknown>): DIDDocument {
  const keyId = `${did}#0`;
  const signing = {
    assertionMethod: [keyId],
    authentication: [keyId],
    capabilityInvocation: [keyId],
    capabilityDelegation: [keyId],
  };
  // Relationships follow the key's actual capability (see the header):
  // agreement-only curves get only keyAgreement; signing-only key types
  // (Ed*, RSA) never get it; ECDH-capable EC keys keep the spec's use-based
  // mapping. Contradictory `use` values were rejected during validation.
  const okp = jwk.kty === "OKP" ? OKP_CURVES[jwk.crv as string] : undefined;
  const relationships = okp
    ? okp.capability === "enc"
      ? { keyAgreement: [keyId] }
      : signing
    : jwk.use === "enc"
      ? { keyAgreement: [keyId] }
      : jwk.kty === "RSA" || jwk.use === "sig"
        ? signing
        : { ...signing, keyAgreement: [keyId] };
  return {
    "@context": [
      "https://www.w3.org/ns/did/v1",
      "https://w3id.org/security/suites/jws-2020/v1",
    ],
    id: did,
    verificationMethod: [
      {
        id: keyId,
        type: "JsonWebKey2020",
        controller: did,
        publicKeyJwk: jwk as VerificationMethod["publicKeyJwk"],
      },
    ],
    ...relationships,
  };
}

export function getResolver(): ResolverRegistry {
  const jwkResolver = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (segments.length !== 3 || segments[0] !== "did") {
        return errorResult("invalidDid");
      }
      const decoded = decodeJwk(segments[2]);
      if ("invalid" in decoded) {
        return errorResult("invalidDid", decoded.invalid);
      }
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument: buildDocument(did, decoded.jwk),
        didDocumentMetadata: {},
      };
    } catch (error) {
      return errorResult(
        "internalError",
        error instanceof Error ? error.message.slice(0, 200) : undefined,
      );
    }
  };
  return { jwk: jwkResolver };
}
