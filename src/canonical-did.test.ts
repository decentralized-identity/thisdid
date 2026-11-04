import { describe, expect, it } from "vitest";
import { canonicalDid } from "./canonical-did";

const LOWER =
  "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i";
const UPPER =
  "did:algo:UTI7PAASILRDA3ISHY5M7J7LNRX2AIVQJWI7ZKCCGKVLMFD3VPR5PWSZ4I";

describe("canonicalDid", () => {
  it("records every case of a did:algo account as the upper-case DID", () => {
    // GoPlausible answers LOWER with didDocumentMetadata.canonicalId = UPPER
    // (verified live 2026-09-24).
    expect(canonicalDid(LOWER)).toBe(UPPER);
    expect(canonicalDid(UPPER)).toBe(UPPER);
    expect(
      canonicalDid(
        "did:algo:Uti7PaasilrdA3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
      ),
    ).toBe(UPPER);
  });

  it("upper-cases addr and txn ids and lower-cases network and kind", () => {
    expect(
      canonicalDid(
        "did:algo:mainnet:addr:suvddkmnu7ecjcxwrxyr2nd4wd63ffnv7xzsod7i4loemt7qtsgvqsq7em",
      ),
    ).toBe(
      "did:algo:mainnet:addr:SUVDDKMNU7ECJCXWRXYR2ND4WD63FFNV7XZSOD7I4LOEMT7QTSGVQSQ7EM",
    );
    expect(
      canonicalDid(
        "did:algo:TESTNET:TXN:a5zjfb4i4pr2i3evi2i4xeymidhxcxjfsitrt5nl4alnng6lcaea",
      ),
    ).toBe(
      "did:algo:testnet:txn:A5ZJFB4I4PR2I3EVI2I4XEYMIDHXCXJFSITRT5NL4ALNNG6LCAEA",
    );
  });

  it("keeps uuid, asa and app identifiers as they are", () => {
    for (const did of [
      "did:algo:mainnet:uuid:14118c16-93ab-4c04-9eaa-609ded8b810e",
      "did:algo:mainnet:asa:31566704",
      "did:algo:testnet:app:1234",
    ]) {
      expect(canonicalDid(did)).toBe(did);
    }
  });

  it("leaves a bare did:algo that is not an address unchanged", () => {
    for (const did of [
      "did:algo:K7DHI5HA...XNVOPPVM",
      "did:algo:nfd:name.algo",
      "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4", // 57
    ]) {
      expect(canonicalDid(did)).toBe(did);
    }
  });

  it("keeps a DID URL's path, query and fragment", () => {
    expect(canonicalDid(`${LOWER}#key-1`)).toBe(`${UPPER}#key-1`);
    expect(canonicalDid(`${LOWER}/path?Q=a#Frag`)).toBe(
      `${UPPER}/path?Q=a#Frag`,
    );
  });

  it("records methods without a rule exactly as requested", () => {
    for (const did of [
      "did:nfd:name.algo",
      "did:nfd:UTI7PAASILRDA3ISHY5M7J7LNRX2AIVQJWI7ZKCCGKVLMFD3VPR5PWSZ4I",
      "did:web:Example.com",
      "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
      "did:pkh:eip155:1:0xAbC0000000000000000000000000000000000000",
      "not a did",
    ]) {
      expect(canonicalDid(did)).toBe(did);
    }
  });
});
