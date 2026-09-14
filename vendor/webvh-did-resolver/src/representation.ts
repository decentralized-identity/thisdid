/**
 * DID Core representation negotiation for a driver result (ThisDID).
 *
 * `accept` names the representation the caller wants. `application/did+json`
 * strips the JSON-LD context; `application/did+ld+json` keeps it, adding the
 * DID Core context to a plain-JSON document as DID Core's JSON → JSON-LD
 * production rule defines. Anything else is `representationNotSupported`.
 * Errors and empty results pass through untouched, and an absent `accept`
 * leaves the driver's own choice — previously every request succeeded with
 * that choice whatever the caller asked for.
 */
import type { DIDResolutionResult } from "did-resolver";

export const DID_JSON = "application/did+json";
export const DID_LD_JSON = "application/did+ld+json";
export const DID_CORE_CONTEXT = "https://www.w3.org/ns/did/v1";

type Document = NonNullable<DIDResolutionResult["didDocument"]>;

export function applyRepresentation(
  result: DIDResolutionResult,
  accept: unknown,
): DIDResolutionResult {
  if (
    accept === undefined ||
    result.didResolutionMetadata.error !== undefined ||
    result.didDocument === null
  ) {
    return result;
  }
  if (typeof accept !== "string") return unsupported(result);
  const wanted = accept.split(";")[0].trim().toLowerCase();
  const document = result.didDocument as unknown as Record<string, unknown>;
  if (wanted === DID_JSON) {
    const plain: Record<string, unknown> = { ...document };
    delete plain["@context"];
    return {
      ...result,
      didDocument: plain as unknown as Document,
      didResolutionMetadata: {
        ...result.didResolutionMetadata,
        contentType: DID_JSON,
      },
    };
  }
  if (wanted === DID_LD_JSON) {
    const linked =
      document["@context"] === undefined
        ? { "@context": DID_CORE_CONTEXT, ...document }
        : document;
    return {
      ...result,
      didDocument: linked as unknown as Document,
      didResolutionMetadata: {
        ...result.didResolutionMetadata,
        contentType: DID_LD_JSON,
      },
    };
  }
  return unsupported(result);
}

function unsupported(result: DIDResolutionResult): DIDResolutionResult {
  const metadata: Record<string, unknown> = { ...result.didResolutionMetadata };
  delete metadata.contentType;
  return {
    didResolutionMetadata: { ...metadata, error: "representationNotSupported" },
    didDocument: null,
    // DID Resolution: an unsuccessful resolution carries no document metadata.
    didDocumentMetadata: {},
  };
}
