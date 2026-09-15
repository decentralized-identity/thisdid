/**
 * Parsing, validation, and formatting of did:julia identifiers.
 *
 * Spec §5. The method-specific identifier is the base58 encoding (Bitcoin
 * alphabet, no checksum) of the DID's 32-octet singleton launcher ID.
 * Validation is by DECODING — the character count is not fixed and MUST NOT
 * be used for validation (§5.2), and a short decoding is rejected, never
 * left-padded.
 */

export const PREFIX = "did:julia:";
export const ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export const LAUNCHER_ID_SIZE = 32;

/** Longest method-specific identifier the parser will consider. 32 octets
 * encode to at most 44 base58 characters; the bound only keeps a hostile
 * identifier from driving the big-integer decode. */
const MAX_IDENTIFIER_CHARS = 64;

export class InvalidDidError extends Error {}

export function b58encode(raw: Uint8Array): string {
  let value = 0n;
  for (const byte of raw) value = value * 256n + BigInt(byte);
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  let pad = 0;
  while (pad < raw.length && raw[pad] === 0) pad += 1;
  return "1".repeat(pad) + out;
}

export function b58decode(encoded: string): Uint8Array {
  let value = 0n;
  for (const char of encoded) {
    const index = ALPHABET.indexOf(char);
    if (index < 0) {
      throw new InvalidDidError(`invalid base58 character '${char}'`);
    }
    value = value * 58n + BigInt(index);
  }
  const body: number[] = [];
  while (value > 0n) {
    body.unshift(Number(value & 0xffn));
    value >>= 8n;
  }
  let pad = 0;
  while (pad < encoded.length && encoded[pad] === "1") pad += 1;
  const out = new Uint8Array(pad + body.length);
  out.set(body, pad);
  return out;
}

/**
 * Parse a did:julia DID and return its 32-octet launcher ID.
 *
 * Throws `InvalidDidError` on any §5 violation: a missing or wrongly cased
 * prefix, characters outside the base58 alphabet, or a decoding that is not
 * exactly 32 octets.
 */
export function parseDid(did: string): Uint8Array {
  if (typeof did !== "string" || !did.startsWith(PREFIX)) {
    throw new InvalidDidError("missing case-sensitive 'did:julia:' prefix");
  }
  const identifier = did.slice(PREFIX.length);
  if (identifier.length === 0) {
    throw new InvalidDidError("empty method-specific identifier");
  }
  if (identifier.length > MAX_IDENTIFIER_CHARS) {
    throw new InvalidDidError("method-specific identifier is implausibly long");
  }
  const decoded = b58decode(identifier);
  if (decoded.length !== LAUNCHER_ID_SIZE) {
    throw new InvalidDidError(
      `decoded launcher ID is ${decoded.length} octets, must be exactly ${LAUNCHER_ID_SIZE}`,
    );
  }
  return decoded;
}

/** Format a 32-octet launcher ID as a did:julia DID. */
export function formatDid(launcherId: Uint8Array): string {
  if (launcherId.length !== LAUNCHER_ID_SIZE) {
    throw new InvalidDidError(
      `launcher ID must be ${LAUNCHER_ID_SIZE} octets, got ${launcherId.length}`,
    );
  }
  return PREFIX + b58encode(launcherId);
}

export function isValidDid(did: string): boolean {
  try {
    parseDid(did);
    return true;
  } catch {
    return false;
  }
}
