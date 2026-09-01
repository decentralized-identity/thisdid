/**
 * Live real-world corpus — resolves actual did:oyd identifiers over the
 * network through this driver and compares to the reference resolver
 * (resolver.ownyourdata.eu). OPT-IN: gated on `OYD_LIVE` so the offline
 * golden-vector suite stays deterministic and network-free.
 *
 *   OYD_LIVE=1 pnpm test        # or: pnpm run test:live
 *
 * The identifiers were discovered in OwnYourData's repos + method spec and
 * each verified live on 2026-08-30 (see OYD-DID-CORPUS.md). This is also the
 * regression guard for the log-fetch fix: the non-default-location DID
 * (…%40did2.data-container.net) fetches its log by the document's log-hash,
 * not the DID hash. Every DID listed here is expected to pass — one real DID
 * is deliberately excluded (OYD-DID-CORPUS.md §"Excluded"); its binding is covered
 * offline in resolver.test.ts instead.
 */
import { describe, expect, it } from "vitest";
import { Resolver } from "did-resolver";
import { getResolver } from "../resolver.js";

const LIVE = process.env["OYD_LIVE"] === "1";
const REF = "https://resolver.ownyourdata.eu/1.0/identifiers/";

const resolver = () => new Resolver(getResolver());
const clone = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
async function reference(did: string): Promise<{
  didDocument: unknown;
  didDocumentMetadata: Record<string, unknown>;
  didResolutionMetadata: Record<string, unknown>;
}> {
  return (await fetch(REF + encodeURIComponent(did))).json();
}

/** Real DIDs this driver resolves identically to the reference. */
const PARITY = [
  "did:oyd:zQmaBZTghndXTgxNwfbdpVLWdFf6faYE4oeuN2zzXdQt1kh", // single-version canary
  "did:oyd:zQmdXNRiMWEYTiYF58a9BaiUkfB2xWUgL7G7ozyCCNPqjKV", // updated DID, original id
  "did:oyd:zQmeArtmfxJ1JB6CXvoFdcQCyxPcYii5DUTBR44g4xYpCLR", // updated DID, updated id
  "did:oyd:zQmYhESMRSvN9BkrCf7YcBfxNzigVphyBUbFMfJpEm1fdPF", // spec verification example
  "did:oyd:zQmTxrzHj3vJ4SmWm9a2gB6q3JdshvBLbxmU9j1Z4y9tPP2",
  "did:oyd:zQmYSydHP5A1nRuqMcAoxpb971mfJrKJxpGJPEsxc5mw5Wt",
  "did:oyd:zQmNauTUUdkpi5TcrTZ2524SKM8dJAzuuw4xfW13iHrtY1W%40did2.data-container.net", // non-default location
  "did:oyd:zQmSE1hzumtZ7AoK1qhHf4t5kiKsujMsJSHqoXtWrdd7K7W", // updated DPP DID, varint-framed keys — original id
  "did:oyd:zQmfEb3KgYZjZUPLTHPmFPdcV6peF5itB5NmJ9N6gaxxE8K", // same chain — updated id
];

/** Real DIDs that resolve to a deactivated (revoked) state. */
const DEACTIVATED = ["did:oyd:zQmQMvhHrccgcP2XzE2rM4E8MDx9P8D5FWPdDF1DTPikF4F"];

// One real DID — did:oyd:z6MkrJVn… — was DELIBERATELY EXCLUDED from this live
// corpus: a pubkey-form identifier whose embedded key is in no document
// version of its own DID (verified raw), which only repository trust resolves.
// It is documented in full in OYD-DID-CORPUS.md §"Excluded", and its binding
// behaviour is covered deterministically offline instead — a bound
// pubkey-form DID resolves and the unbound (z6MkrJVn) shape is rejected — in
// resolver.test.ts "pubkey-form identifiers (spec §3.2.4 binding)". Keeping it
// out of the network corpus means every live DID here is expected to pass.

describe.skipIf(!LIVE)("live real-world did:oyd corpus (OYD_LIVE=1)", () => {
  it.each(PARITY)("resolves and matches the reference: %s", async (did) => {
    const ours = await resolver().resolve(did);
    const ref = await reference(did);
    expect(ours.didResolutionMetadata.error).toBeUndefined();
    expect(clone(ours.didDocument)).toEqual(ref.didDocument);
    expect(clone(ours.didDocumentMetadata)).toEqual(ref.didDocumentMetadata);
  });

  it.each(DEACTIVATED)(
    "reports deactivated (matches reference): %s",
    async (did) => {
      const ours = await resolver().resolve(did);
      expect(ours.didDocument).toBeNull();
      expect(ours.didDocumentMetadata.deactivated).toBe(true);
      const ref = await reference(did);
      expect(ref.didDocumentMetadata.deactivated).toBe(true);
    },
  );
});
