/**
 * Raw `ledger_entry` responses captured live on 23 August 2026 from the
 * public XRPL JSON-RPC endpoints (xrplcluster.com, s.altnet.rippletest.net,
 * s.devnet.rippletest.net). Byte-for-byte as returned — the tests replay
 * these to prove composition against real ledger state.
 */

/** Mainnet DID with ipfs URI + attestation Data, no DIDDocument blob. */
export const MAINNET_DID = "did:xrpl:0:r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE";
export const MAINNET_RESPONSE = {
  result: {
    index: "146461286F33D5ACFA64E8C29CF76921A251016B98E8E01BFE183B75668887E8",
    ledger_hash:
      "67E9F9608E1BE1D169FA522125220F14E8965B0A344304CF6A79BE90ED85E867",
    ledger_index: 106486103,
    node: {
      Account: "r9BUM9z14j7bLFzQHRfurWNdNKYSABdGtE",
      Data: "697066733A2F2F6261666B72656961726C7774376B6B3766777A6B6473716B6B667873743270766132326779703579656F6B646135746B657A7233687A677437786D",
      Flags: 0,
      LedgerEntryType: "DID",
      OwnerNode: "3",
      PreviousTxnID:
        "37AB12A3A0F7857BDD6CB9680B065FFAF52A5BEED4BCBFD5DA73606459E27439",
      PreviousTxnLgrSeq: 94030601,
      URI: "697066733A2F2F6261666B72656967756D35727A6C6F6A6237656961676269696D6D6A336D686275696964776976696B32623277646E72637A7A6B72356975796A79",
      index: "146461286F33D5ACFA64E8C29CF76921A251016B98E8E01BFE183B75668887E8",
    },
    status: "success",
    validated: true,
  },
};

/** Mainnet account with NO DID entry (the spec's own example account). */
export const NOTFOUND_ADDRESS = "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh";
export const NOTFOUND_PUBKEY =
  "0330E7FC9D56BB25D6893BA3F317AE5BCF33B3291BD63DB32654A313222F7FD020";
export const NOTFOUND_RESPONSE = {
  result: {
    error: "entryNotFound",
    error_code: 98,
    error_message: "Entry not found.",
    index: "5D71AD4469C5444C5FBAAFCF6DAE6E625D32F74995098F4FEF3E0B0F7B36B8F9",
    ledger_hash:
      "67E9F9608E1BE1D169FA522125220F14E8965B0A344304CF6A79BE90ED85E867",
    ledger_index: 106486103,
    request: {
      command: "ledger_entry",
      did: "rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh",
      ledger_index: "validated",
    },
    status: "error",
    validated: true,
  },
};

/** Testnet DID whose on-ledger DIDDocument blob is an authored JSON doc. */
export const TESTNET_DID = "did:xrpl:1:rHsr6TjYRgXfVH69AZgKhfCVG3cQUFz3on";
export const TESTNET_RESPONSE = {
  result: {
    index: "002A1BB035A7665561C4A43487EF2A54C25AE55CEA07DEBEDC389148F1F424B2",
    ledger_hash:
      "53AA1D9CA693C7590A4ABFA09650379536690D09E2156BBE960C11586590EE81",
    ledger_index: 20148484,
    node: {
      Account: "rHsr6TjYRgXfVH69AZgKhfCVG3cQUFz3on",
      DIDDocument:
        "7B2240636F6E74657874223A2268747470733A2F2F7777772E77332E6F72672F6E732F6469642F7631222C226964223A226469643A6578616D706C653A313233227D",
      Data: "6469643A6578616D706C653A313233236B65792D31",
      Flags: 0,
      LedgerEntryType: "DID",
      OwnerNode: "0",
      PreviousTxnID:
        "0C53C8DD3F8F1FB9D4586C16AA630933BE583BEBB8918061311973EFB3E70111",
      PreviousTxnLgrSeq: 15046041,
      URI: "68747470733A2F2F7872706C636C75737465722E636F6D",
      index: "002A1BB035A7665561C4A43487EF2A54C25AE55CEA07DEBEDC389148F1F424B2",
    },
    status: "success",
    validated: true,
  },
};

/** Devnet DID whose blobs are all the non-UTF-8 junk bytes 0xA1 0xB1. */
export const DEVNET_DID = "did:xrpl:2:rfhcRtTbDSyVwCNALUsVMdfabSJMQXyUbm";
export const DEVNET_RESPONSE = {
  result: {
    index: "00004CC584353D958ED9E9FB4818EA26D0EE29C71247C069A620070DC35249E0",
    ledger_hash:
      "7D95C1486C329CA02459AA673FA79E8016A4E272586D920A86BBE2AE6CB36F4A",
    ledger_index: 4709149,
    node: {
      Account: "rfhcRtTbDSyVwCNALUsVMdfabSJMQXyUbm",
      DIDDocument: "A1B1",
      Data: "A1B1",
      Flags: 0,
      LedgerEntryType: "DID",
      OwnerNode: "0",
      PreviousTxnID:
        "3EBF4C2975189AAB028CF6130721FB61E9A4E20D9E8AC8E91E6FD5346A397E10",
      PreviousTxnLgrSeq: 216901,
      URI: "A1B1",
      index: "00004CC584353D958ED9E9FB4818EA26D0EE29C71247C069A620070DC35249E0",
    },
    status: "success",
    validated: true,
  },
};

/** The document the mainnet fixture must compose to, byte-for-byte. */
export const MAINNET_REFERENCE_DOCUMENT = {
  "@context": "https://www.w3.org/ns/did/v1",
  id: MAINNET_DID,
  service: [
    {
      id: `${MAINNET_DID}#uri`,
      type: "LinkedResource",
      serviceEndpoint:
        "ipfs://bafkreigum5rzlojb7eiagbiimmj3mhbuiidwivik2b2wdnrczzkr5iuyjy",
    },
  ],
};
