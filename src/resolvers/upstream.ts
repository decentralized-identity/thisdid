/**
 * Upstream routing — resolve a DID against a named Universal Resolver deployment
 * (godiddy / archon). Returns a resolution result on success, or null when the
 * upstream errored, was unreachable, or found nothing — so the caller can fall
 * through to the next step in the routing chain.
 */
import type { DIDResolutionResult } from 'did-resolver'

export async function fetchUpstream(did: string, base: string, token?: string): Promise<DIDResolutionResult | null> {
  if (!base) return null
  const url = `${base.replace(/\/+$/, '')}/${encodeURIComponent(did)}`
  const headers: Record<string, string> = {
    accept: 'application/ld+json;profile="https://w3id.org/did-resolution"',
  }
  if (token) headers.authorization = `Bearer ${token}`
  try {
    const res = await fetch(url, { headers })
    const body = (await res.json()) as Partial<DIDResolutionResult> & Record<string, unknown>

    // Accept either a full DID Resolution Result or a bare DID document.
    const didDocument =
      (body.didDocument as DIDResolutionResult['didDocument']) ??
      (body['id'] ? (body as unknown as DIDResolutionResult['didDocument']) : null)

    const error = body.didResolutionMetadata?.error
    if (!didDocument || error) return null

    return {
      didResolutionMetadata: { contentType: 'application/did+ld+json', ...body.didResolutionMetadata },
      didDocument,
      didDocumentMetadata: body.didDocumentMetadata ?? {},
    }
  } catch {
    return null
  }
}
