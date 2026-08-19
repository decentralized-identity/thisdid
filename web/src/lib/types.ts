/** Minimal W3C DID Document shape (only the fields the UI reads). */
export interface VerificationMethod {
  id: string;
  type: string;
  controller?: string;
  publicKeyMultibase?: string;
  publicKeyJwk?: {
    kty?: string;
    crv?: string;
    x?: string;
    [k: string]: unknown;
  };
  blockchainAccountId?: string;
  [k: string]: unknown;
}

export interface ServiceEndpoint {
  id: string;
  type: string | string[];
  serviceEndpoint: string | Record<string, unknown> | Array<unknown>;
}

export interface DIDDocument {
  "@context"?: unknown;
  id: string;
  controller?: string | string[];
  verificationMethod?: VerificationMethod[];
  authentication?: (string | VerificationMethod)[];
  assertionMethod?: (string | VerificationMethod)[];
  keyAgreement?: (string | VerificationMethod)[];
  capabilityInvocation?: (string | VerificationMethod)[];
  capabilityDelegation?: (string | VerificationMethod)[];
  service?: ServiceEndpoint[];
  [k: string]: unknown;
}

export interface DIDResolutionResult {
  "@context"?: unknown;
  didDocument: DIDDocument | null;
  didResolutionMetadata: {
    contentType?: string;
    error?: string;
    route?: "local" | "upstream";
    resolver?: string;
    network?: string;
    durationMs?: number;
    via?: string;
    verification?: {
      status: "match" | "mismatch" | "unverified";
      provider?: string;
      reason?: string;
    };
    [k: string]: unknown;
  };
  didDocumentMetadata: {
    created?: string;
    updated?: string;
    deactivated?: boolean;
    [k: string]: unknown;
  };
}
