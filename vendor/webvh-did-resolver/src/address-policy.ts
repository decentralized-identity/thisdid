/**
 * Destination classification for the fetch policy (fetch-policy.ts).
 *
 * A destination is acceptable only when it is a globally routable unicast
 * address. This is a positive classification, not a denylist: everything the
 * IANA special-purpose registries reserve is refused — IPv4 "this network",
 * private, shared address space (CGNAT, 100.64/10), loopback, link-local,
 * IETF protocol assignments, documentation, deprecated 6to4 relay,
 * benchmarking (198.18/15), multicast and reserved/broadcast; IPv6 anything
 * outside 2000::/3 (unspecified, loopback, IPv4-compatible, discard,
 * local-use NAT64, unique-local, link-local, site-local, multicast) plus the
 * transition and documentation prefixes inside it (Teredo, benchmarking,
 * documentation, ORCHID, 6to4, 3fff::/20, SRv6). IPv4-mapped (::ffff:0:0/96)
 * and NAT64 (64:ff9b::/96) forms are judged by the IPv4 address they embed.
 * Anything that fails to parse is refused too.
 *
 * Applied to literal hostnames before every hop (fetch-policy.ts) and, on
 * Node, to every address a name resolves to (node-guard.ts).
 */

export type ParsedAddress = { family: 4 | 6; bytes: Uint8Array };

const V4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

function parseV4(text: string): Uint8Array | null {
  const m = V4.exec(text);
  if (!m) return null;
  const bytes = new Uint8Array(4);
  for (let i = 0; i < 4; i += 1) {
    const part = m[i + 1];
    if (part.length > 1 && part.startsWith("0")) return null; // no octal / zero-padded forms
    const value = Number(part);
    if (value > 255) return null;
    bytes[i] = value;
  }
  return bytes;
}

function parseV6(text: string): Uint8Array | null {
  const zone = text.indexOf("%");
  const address = zone === -1 ? text : text.slice(0, zone);
  if (address.length === 0 || address.includes(":::")) return null;
  const halves = address.split("::");
  if (halves.length > 2) return null;
  const groups = (part: string): number[] | null => {
    if (part === "") return [];
    const out: number[] = [];
    const items = part.split(":");
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (i === items.length - 1 && item.includes(".")) {
        const v4 = parseV4(item);
        if (!v4) return null;
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
        continue;
      }
      if (!HEXTET.test(item)) return null;
      out.push(parseInt(item, 16));
    }
    return out;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const hextets = [...head, ...new Array<number>(missing).fill(0), ...tail];
  const bytes = new Uint8Array(16);
  hextets.forEach((h, i) => {
    bytes[2 * i] = h >> 8;
    bytes[2 * i + 1] = h & 0xff;
  });
  return bytes;
}

/** Parse a dotted-quad IPv4 or an RFC 4291 IPv6 literal (brackets and zone id tolerated). */
export function parseIpAddress(text: string): ParsedAddress | null {
  const literal = text
    .trim()
    .replace(/^\[|\]$/g, "")
    .toLowerCase();
  if (literal.includes(":")) {
    const bytes = parseV6(literal);
    return bytes ? { family: 6, bytes } : null;
  }
  const bytes = parseV4(literal);
  return bytes ? { family: 4, bytes } : null;
}

type Prefix = { bytes: Uint8Array; length: number };

function prefix(text: string, length: number): Prefix {
  const parsed = parseIpAddress(text);
  if (!parsed) throw new Error(`bad prefix ${text}`);
  return { bytes: parsed.bytes, length };
}

function within(address: Uint8Array, p: Prefix): boolean {
  const fullBytes = p.length >> 3;
  for (let i = 0; i < fullBytes; i += 1)
    if (address[i] !== p.bytes[i]) return false;
  const rest = p.length & 7;
  if (rest === 0) return true;
  const mask = 0xff << (8 - rest);
  return (address[fullBytes] & mask) === (p.bytes[fullBytes] & mask);
}

/** IANA IPv4 special-purpose ranges plus multicast and reserved space. */
const NON_GLOBAL_V4: Prefix[] = [
  prefix("0.0.0.0", 8), // "this network"
  prefix("10.0.0.0", 8), // private
  prefix("100.64.0.0", 10), // shared address space (CGNAT)
  prefix("127.0.0.0", 8), // loopback
  prefix("169.254.0.0", 16), // link-local
  prefix("172.16.0.0", 12), // private
  prefix("192.0.0.0", 24), // IETF protocol assignments
  prefix("192.0.2.0", 24), // TEST-NET-1
  prefix("192.88.99.0", 24), // deprecated 6to4 relay anycast
  prefix("192.168.0.0", 16), // private
  prefix("198.18.0.0", 15), // benchmarking
  prefix("198.51.100.0", 24), // TEST-NET-2
  prefix("203.0.113.0", 24), // TEST-NET-3
  prefix("224.0.0.0", 4), // multicast
  prefix("240.0.0.0", 4), // reserved, incl. limited broadcast
];

/** Special-purpose prefixes that sit inside the 2000::/3 global unicast block. */
const NON_GLOBAL_WITHIN_2000: Prefix[] = [
  prefix("2001::", 32), // Teredo
  prefix("2001:2::", 48), // benchmarking
  prefix("2001:10::", 28), // ORCHID
  prefix("2001:20::", 28), // ORCHIDv2
  prefix("2001:db8::", 32), // documentation
  prefix("2002::", 16), // 6to4
  prefix("3fff::", 20), // documentation
  prefix("5f00::", 16), // SRv6 SIDs
];

const MAPPED_V4 = prefix("::ffff:0:0", 96);
const NAT64_WELL_KNOWN = prefix("64:ff9b::", 96);
const GLOBAL_UNICAST_V6 = prefix("2000::", 3);

function isGlobalV4(bytes: Uint8Array): boolean {
  return !NON_GLOBAL_V4.some((p) => within(bytes, p));
}

function isGlobalV6(bytes: Uint8Array): boolean {
  if (within(bytes, MAPPED_V4) || within(bytes, NAT64_WELL_KNOWN)) {
    return isGlobalV4(bytes.subarray(12));
  }
  if (!within(bytes, GLOBAL_UNICAST_V6)) return false;
  return !NON_GLOBAL_WITHIN_2000.some((p) => within(bytes, p));
}

/** True only for a globally routable unicast IPv4 or IPv6 address. */
export function isGlobalUnicastAddress(text: string): boolean {
  const parsed = parseIpAddress(text);
  if (!parsed) return false;
  return parsed.family === 4
    ? isGlobalV4(parsed.bytes)
    : isGlobalV6(parsed.bytes);
}

const IP_LIKE = /^[0-9.]+$|:/;

/**
 * True when `hostname` must not be contacted: a localhost name, or an IP
 * literal that is not a globally routable unicast address (including
 * literals that do not parse). Names are not resolved here; on Node the
 * connect-time guard applies the same classification to every address a name
 * resolves to.
 */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .trim()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return true;
  if (IP_LIKE.test(host)) return !isGlobalUnicastAddress(host);
  return false;
}
