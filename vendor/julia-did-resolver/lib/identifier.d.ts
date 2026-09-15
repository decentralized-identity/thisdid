/**
 * Parsing, validation, and formatting of did:julia identifiers.
 *
 * Spec §5. The method-specific identifier is the base58 encoding (Bitcoin
 * alphabet, no checksum) of the DID's 32-octet singleton launcher ID.
 * Validation is by DECODING — the character count is not fixed and MUST NOT
 * be used for validation (§5.2), and a short decoding is rejected, never
 * left-padded.
 */
export declare const PREFIX = "did:julia:";
export declare const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
export declare const LAUNCHER_ID_SIZE = 32;
export declare class InvalidDidError extends Error {
}
export declare function b58encode(raw: Uint8Array): string;
export declare function b58decode(encoded: string): Uint8Array;
/**
 * Parse a did:julia DID and return its 32-octet launcher ID.
 *
 * Throws `InvalidDidError` on any §5 violation: a missing or wrongly cased
 * prefix, characters outside the base58 alphabet, or a decoding that is not
 * exactly 32 octets.
 */
export declare function parseDid(did: string): Uint8Array;
/** Format a 32-octet launcher ID as a did:julia DID. */
export declare function formatDid(launcherId: Uint8Array): string;
export declare function isValidDid(did: string): boolean;
//# sourceMappingURL=identifier.d.ts.map