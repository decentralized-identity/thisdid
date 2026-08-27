/**
 * Alchemy RPC endpoints carry the API token in the URL path, so any string
 * that embeds one (ethers error messages, upstream failure text) is a secret.
 * Truncating right after the host keeps the provider identifiable while
 * guaranteeing a token never reaches a log line or a response body — ours from
 * the driver Workers, or a third-party provider's leaking through an upstream
 * resolution result.
 */
const ALCHEMY_HOST = "alchemy.com";

export function scrubAlchemy(value: string): string {
  const at = value.toLowerCase().indexOf(ALCHEMY_HOST);
  return at === -1 ? value : value.slice(0, at + ALCHEMY_HOST.length);
}

export function scrubAlchemyDeep<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value === "string") return scrubAlchemy(value) as unknown as T;
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]" as unknown as T;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => scrubAlchemyDeep(item, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    out[scrubAlchemy(key)] = scrubAlchemyDeep(item, seen);
  }
  return out as T;
}
