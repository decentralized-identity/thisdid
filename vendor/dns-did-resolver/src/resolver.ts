/**
 * did:dns resolver for the DIF `did-resolver` interface.
 *
 * A clean-room implementation of the did:dns method specification
 * (https://danubetech.github.io/did-method-dns/) over DNS-over-HTTPS:
 * sequential URI records `_key1._did.<domain>`, `_key2._did.<domain>`, … each
 * holding a did:key DID whose verification material is merged into the
 * resolved document. The first method imported from `_keyN` keeps the spec's
 * `<did>#keyN` id; any further methods of the same did:key (including methods
 * embedded inside its relationship arrays, e.g. the derived X25519 key in an
 * Ed25519 did:key's `keyAgreement`) get an ordinal suffix (`<did>#keyN-1`, …)
 * so ids stay unique, and each relationship is rewritten through the
 * old-id → new-id map so every purpose points at the key that actually holds
 * it. did:key targets are resolved deterministically offline via
 * `key-did-resolver` — the only network I/O is the DoH lookup.
 */
import {
  Resolver,
  type DIDDocument,
  type DIDResolutionResult,
  type ResolverRegistry,
  type VerificationMethod,
} from "did-resolver";
import { getResolver as getKeyResolver } from "key-did-resolver";

export interface DnsResolverOptions {
  /** DNS-over-HTTPS JSON endpoint. Defaults to Cloudflare's resolver. */
  dohUrl?: string;
  /** Per-request wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
  /** Upper bound on sequential `_keyN` lookups. Default 10. */
  maxKeys?: number;
}

const DEFAULT_DOH_URL = "https://cloudflare-dns.com/dns-query";
const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_MAX_KEYS = 10;
/** DNS messages cap at 64 KiB; anything past this bound is not a DoH answer. */
const MAX_RESPONSE_BYTES = 256 * 1024;
const DOMAIN_RE =
  /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?)+$/i;

const RELATIONSHIPS = [
  "authentication",
  "assertionMethod",
  "capabilityInvocation",
  "capabilityDelegation",
  "keyAgreement",
] as const;

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

interface DohAnswer {
  type: number;
  data: string;
}

/**
 * Read at most MAX_RESPONSE_BYTES of a response body, cancelling the stream
 * the moment it exceeds the bound — the guard runs before any buffering or
 * parsing, so an oversized endpoint cannot make this worker hold it in memory.
 */
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
 * Extract the URI record target from either presentation format
 * (`100 10 "did:key:…"`) or RFC 3597 generic format
 * (`\# <len> <hex…>`, as returned by Cloudflare DoH), skipping the
 * 4 priority/weight bytes.
 */
export function uriRecordTarget(data: string): string | undefined {
  const trimmed = data.trim();
  if (trimmed.startsWith("\\#")) {
    const hex = trimmed.split(/\s+/).slice(2).join("");
    if (hex.length < 10 || hex.length % 2 !== 0) return undefined;
    const bytes = hex.match(/.{2}/g);
    if (!bytes) return undefined;
    try {
      return bytes
        .slice(4) // priority (2) + weight (2)
        .map((b) => String.fromCharCode(parseInt(b, 16)))
        .join("");
    } catch {
      return undefined;
    }
  }
  const match = trimmed.match(/^\d+\s+\d+\s+"?([^"]+)"?$/);
  return match ? match[1] : undefined;
}

export function getResolver(options?: DnsResolverOptions): ResolverRegistry {
  const dohUrl = options?.dohUrl ?? DEFAULT_DOH_URL;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxKeys = options?.maxKeys ?? DEFAULT_MAX_KEYS;
  const keyResolver = new Resolver(getKeyResolver() as ResolverRegistry);

  async function lookup(fqdn: string): Promise<string | undefined> {
    const url = `${dohUrl}?name=${encodeURIComponent(fqdn)}&type=URI`;
    const response = await fetch(url, {
      headers: { accept: "application/dns-json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`DoH HTTP ${response.status}`);
    const text = await readBounded(response);
    if (text === null) throw new Error("DoH response exceeds the size bound");
    const payload = JSON.parse(text) as {
      Status?: number;
      Answer?: DohAnswer[];
    };
    if (payload.Status !== 0 && payload.Status !== 3) {
      throw new Error(`DNS status ${payload.Status}`);
    }
    const record = (payload.Answer ?? []).find((a) => a.type === 256);
    return record ? uriRecordTarget(record.data) : undefined;
  }

  const dns = async (did: string): Promise<DIDResolutionResult> => {
    try {
      const segments = did.split(":");
      if (segments.length !== 3) return errorResult("invalidDid");
      const domain = segments[2].toLowerCase();
      if (!DOMAIN_RE.test(domain) || domain.length > 253) {
        return errorResult("invalidDid");
      }

      const contexts = new Set<string>(["https://www.w3.org/ns/did/v1"]);
      const verificationMethod: VerificationMethod[] = [];
      const relationships: Record<string, string[]> = {};

      for (let i = 1; i <= maxKeys; i++) {
        const keyId = `key${i}`;
        const target = await lookup(`_${keyId}._did.${domain}`);
        if (!target) break;
        if (!target.startsWith("did:key:")) continue; // per reference driver

        const resolved = await keyResolver.resolve(target);
        const keyDoc = resolved.didDocument;
        if (!keyDoc) continue;

        for (const ctx of Array.isArray(keyDoc["@context"])
          ? (keyDoc["@context"] as string[])
          : []) {
          if (typeof ctx === "string") contexts.add(ctx);
        }
        const idMap = new Map<string, string>();
        let imported = 0;
        const importMethod = (vm: VerificationMethod): string => {
          const known = idMap.get(vm.id);
          if (known) return known;
          const newId =
            imported === 0 ? `${did}#${keyId}` : `${did}#${keyId}-${imported}`;
          imported++;
          idMap.set(vm.id, newId);
          verificationMethod.push({ ...vm, id: newId, controller: did });
          return newId;
        };
        for (const vm of keyDoc.verificationMethod ?? []) importMethod(vm);
        for (const rel of RELATIONSHIPS) {
          const entries = keyDoc[rel] ?? [];
          if (!Array.isArray(entries)) continue;
          for (const entry of entries) {
            const mapped =
              typeof entry === "string"
                ? idMap.get(entry) // dangling references are dropped
                : importMethod(entry);
            if (!mapped) continue;
            const list = (relationships[rel] ??= []);
            if (!list.includes(mapped)) list.push(mapped);
          }
        }
      }

      if (verificationMethod.length === 0) return errorResult("notFound");

      const didDocument: DIDDocument = {
        "@context": [...contexts],
        id: did,
        verificationMethod,
        ...relationships,
      };
      return {
        didResolutionMetadata: { contentType: "application/did+ld+json" },
        didDocument,
        didDocumentMetadata: {},
      };
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { dns } as ResolverRegistry;
}
