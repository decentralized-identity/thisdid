/**
 * DID Document construction (spec §8) and the resolution result envelope.
 *
 * The default DID Document is a pure projection of on-chain singleton state.
 * Verification-method enumeration follows the rule in spec §8.2: a key is
 * listed only when its membership in the CURRENT authentication Merkle root is
 * proven by on-chain data. This version proves membership for single-key
 * configurations — the dominant personal-DID case — using the tree shape the
 * production drivers build and which is verified against mainnet: the key tree
 * is `((K . K) . 0)`, so the root is `pair_hash(class, nil_hash)` where the
 * class is the key paired with itself. Candidate keys come from the
 * prelauncher reveal (the genesis key) and from keys revealed in the most
 * recent spend's solution. Multi-key Merkle-path replay is not implemented (a
 * documented v1 limitation shared with the Python reference); the
 * authentication commitment itself is always published.
 */
import type {
  DIDDocument,
  DIDResolutionResult,
  VerificationMethod,
} from "did-resolver";
import { b58encode, formatDid } from "./identifier.js";
import { type JuliaDidState, singleLeafRoot } from "./state.js";
import { bytesEqual, toHex } from "./clvm.js";

/**
 * The DID context is v1, not v1.1: as of 2026-08 the
 * `https://www.w3.org/ns/did/v1.1` URL does not dereference (W3C returns 300
 * even under JSON-LD content negotiation), so documents citing it fail JSON-LD
 * expansion. Every term this resolver emits is defined in the v1 context.
 * Spec §8.1.
 */
export const CONTEXTS = [
  "https://www.w3.org/ns/did/v1",
  "https://w3id.org/security/multikey/v1",
  "https://not.bot/ns/did-julia/v1",
] as const;

/** multicodec `bls12_381-g1-pub` (0xea), varint-encoded, per spec §8.2. */
const MULTICODEC_BLS_G1 = Uint8Array.of(0xea, 0x01);

/** Multibase base58-btc Multikey encoding of a BLS12-381 G1 public key. */
export function multikey(publicKey: Uint8Array): string {
  const prefixed = new Uint8Array(MULTICODEC_BLS_G1.length + publicKey.length);
  prefixed.set(MULTICODEC_BLS_G1, 0);
  prefixed.set(publicKey, MULTICODEC_BLS_G1.length);
  return "z" + b58encode(prefixed);
}

/**
 * Merkle root of the single-key authentication tree `((K . K) . 0)`, the
 * construction the production drivers build (verified against mainnet).
 */
export function singleKeyRoot(publicKey: Uint8Array): Uint8Array {
  return singleLeafRoot(publicKey);
}

/** Spec §8.2 enumeration rule, single-key case. */
function keyProvablyCurrent(
  state: JuliaDidState,
  publicKey: Uint8Array,
): boolean {
  if (state.authentication === null) return false;
  return bytesEqual(state.authentication.merkleRoot, singleKeyRoot(publicKey));
}

/** A DID Document plus the method-specific properties spec §8.3 defines. */
type JuliaDidDocument = DIDDocument & Record<string, unknown>;

export function buildDocument(
  state: JuliaDidState,
  candidateKeys: Uint8Array[] = [],
): JuliaDidDocument {
  const did = formatDid(state.launcherId);

  if (state.deactivated) {
    return { "@context": [CONTEXTS[0]], id: did } as JuliaDidDocument;
  }

  const doc: JuliaDidDocument = {
    "@context": [...CONTEXTS],
    id: did,
  } as JuliaDidDocument;

  const verificationMethod: VerificationMethod[] = [];
  const seen = new Set<string>();
  for (const key of candidateKeys) {
    const fingerprint = toHex(key);
    if (seen.has(fingerprint) || !keyProvablyCurrent(state, key)) continue;
    seen.add(fingerprint);
    const encoded = multikey(key);
    verificationMethod.push({
      id: `${did}#${encoded}`,
      type: "Multikey",
      controller: did,
      publicKeyMultibase: encoded,
    });
  }
  if (verificationMethod.length > 0) {
    const references = verificationMethod.map((method) => method.id);
    doc.verificationMethod = verificationMethod;
    doc.authentication = references;
    doc.assertionMethod = references;
  }

  if (state.authentication !== null) {
    doc.juliaAuthentication = {
      ...(state.authentication.disabled ? { disabled: true } : {}),
      merkleRoot: `0x${toHex(state.authentication.merkleRoot)}`,
      classDepth: state.authentication.classDepth,
      requiredClasses: state.authentication.requiredClasses,
      classes: state.authentication.classes.map((keyClass) => ({
        classId: `0x${toHex(keyClass.classId)}`,
        requiredMembers: keyClass.requiredMembers,
      })),
    };
  }

  doc.juliaCustodians = state.custodians.map((launcher) => formatDid(launcher));

  if (state.recovery === null) {
    doc.juliaRecovery = { configured: false };
  } else if (!state.recovery.parsed) {
    doc.juliaRecovery = { configured: true };
  } else {
    doc.juliaRecovery = {
      configured: true,
      recoveryAgents: state.recovery.agentsConfigured,
      delayBlocks: state.recovery.delayBlocks,
      ...(state.recovery.prerotation !== null
        ? { prerotation: state.recovery.prerotation }
        : {}),
    };
  }

  if (state.recoveryPending) doc.juliaRecoveryPending = true;
  if (state.documentPointer !== null) {
    doc.juliaDocumentPointer = `0x${toHex(state.documentPointer)}`;
  }
  return doc;
}

/** `YYYY-MM-DDTHH:MM:SSZ`, matching the reference resolver's formatting. */
function isoSeconds(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export interface ResolutionInputs {
  state: JuliaDidState;
  document: JuliaDidDocument;
  versionCoinId: Uint8Array;
  confirmedTimestamp: number;
  verified: boolean;
  currentPuzzle: boolean;
}

/** Document, document metadata (§8.5), and resolution metadata. */
export function resolutionResult(
  inputs: ResolutionInputs,
): DIDResolutionResult {
  const documentMetadata: Record<string, unknown> = {
    versionId: `0x${toHex(inputs.versionCoinId)}`,
  };
  if (inputs.confirmedTimestamp) {
    documentMetadata.updated = isoSeconds(inputs.confirmedTimestamp);
  }
  if (inputs.state.deactivated) documentMetadata.deactivated = true;

  return {
    didDocument: inputs.document,
    didDocumentMetadata: documentMetadata,
    didResolutionMetadata: {
      contentType: "application/did+ld+json",
      "did:julia:stateVerified": inputs.verified,
      "did:julia:currentPuzzle": inputs.currentPuzzle,
    },
  };
}

export function errorResult(
  error: string,
  message?: string,
): DIDResolutionResult {
  return {
    didDocument: null,
    didDocumentMetadata: {},
    didResolutionMetadata: {
      error,
      ...(message ? { errorMessage: message } : {}),
    },
  };
}
