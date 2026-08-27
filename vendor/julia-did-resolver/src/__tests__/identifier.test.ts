import { describe, expect, it } from "vitest";
import {
  InvalidDidError,
  b58decode,
  b58encode,
  formatDid,
  isValidDid,
  parseDid,
} from "../identifier.js";
import { fromHex, toHex } from "../clvm.js";
import { ALIAS_DID, ORG_DID } from "./fixtures.js";

/** Ported from tests/test_identifier.py — spec §5.2. */
describe("did:julia identifiers", () => {
  it("parses the 44-character alias DID to its launcher ID", () => {
    expect(toHex(parseDid(ALIAS_DID))).toBe(
      "92543c68190662dc0e22ecc1d5315024a946dc572b253630d7983ac373249502",
    );
  });

  it("parses a 43-character identifier — length is never validation", () => {
    // ~5.7% of launcher IDs encode to 43 characters (any value below 58^43,
    // e.g. one with a small leading octet); spec §5.2 forbids length-based
    // validation, so this MUST parse. Ported from test_43_character_identifier.
    const launcher = fromHex(
      `01${"92543c68190662dc0e22ecc1d5315024a946dc572b253630d7983ac373249502".slice(2)}`,
    );
    const did = formatDid(launcher);
    expect(did.slice("did:julia:".length)).toHaveLength(43);
    expect(toHex(parseDid(did))).toBe(toHex(launcher));
  });

  it("parses the organization DID", () => {
    expect(toHex(parseDid(ORG_DID))).toBe(
      "a0f4a15e758595bf2560ffe1db390a3ef27924cba4ed07a288a6693d46566b2f",
    );
  });

  it("round-trips every launcher ID through format and parse", () => {
    for (const hex of [
      "92543c68190662dc0e22ecc1d5315024a946dc572b253630d7983ac373249502",
      "a0f4a15e758595bf2560ffe1db390a3ef27924cba4ed07a288a6693d46566b2f",
      "00".repeat(32),
      "ff".repeat(32),
      `00${"11".repeat(31)}`,
    ]) {
      const launcher = fromHex(hex);
      expect(toHex(parseDid(formatDid(launcher)))).toBe(hex);
    }
  });

  it("rejects a short decoding rather than left-padding it", () => {
    const short = b58encode(fromHex("11".repeat(31)));
    expect(() => parseDid(`did:julia:${short}`)).toThrow(InvalidDidError);
    expect(() => parseDid(`did:julia:${short}`)).toThrow(/31 octets/);
  });

  it("rejects a long decoding", () => {
    const long = b58encode(fromHex("11".repeat(33)));
    expect(() => parseDid(`did:julia:${long}`)).toThrow(/33 octets/);
  });

  it("rejects characters outside the Bitcoin base58 alphabet", () => {
    for (const bad of ["0", "O", "I", "l", "+", "/", "="]) {
      expect(isValidDid(ALIAS_DID.slice(0, -1) + bad)).toBe(false);
    }
  });

  it("requires the case-sensitive prefix", () => {
    const identifier = ALIAS_DID.slice("did:julia:".length);
    for (const prefix of [
      "DID:julia:",
      "did:Julia:",
      "did:jul:",
      "julia:",
      "",
    ]) {
      expect(isValidDid(prefix + identifier)).toBe(false);
    }
  });

  it("rejects an empty method-specific identifier", () => {
    expect(() => parseDid("did:julia:")).toThrow(/empty/);
  });

  it("encodes leading zero octets as leading '1' characters", () => {
    const launcher = fromHex(`0000${"22".repeat(30)}`);
    const did = formatDid(launcher);
    expect(did.slice("did:julia:".length).startsWith("11")).toBe(true);
    expect(toHex(parseDid(did))).toBe(toHex(launcher));
  });

  it("decodes and encodes as exact inverses", () => {
    const raw = fromHex(
      "92543c68190662dc0e22ecc1d5315024a946dc572b253630d7983ac373249502",
    );
    expect(toHex(b58decode(b58encode(raw)))).toBe(toHex(raw));
  });
});
