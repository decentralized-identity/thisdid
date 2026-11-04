/**
 * The canonical form of a DID (or of the DID in a DID URL), under which
 * analytics records a resolution, so that logically equivalent forms of one
 * DID count as one entity.
 *
 * DID Core 1.0 §7.1.3 (`canonicalId`): "A DID method can define different
 * forms of a DID that are logically equivalent." Only a method's own
 * definition decides what is equivalent; a method without a rule here is
 * recorded exactly as requested (DIDs are case-sensitive, §3.1).
 *
 * did:algo (GoPlausible, the method's owner, 2026-09-23 — algo-worker
 * README and `normalizeDidAlgo`): Algorand addresses and transaction ids are
 * upper-case base32 and are accepted in either case, and the resolver names
 * the upper-case DID as `canonicalId`; the network and kind segments are
 * lower-case. Application, asset and uuid identifiers are kept as they are
 * (uuids are stored keys and case-sensitive).
 */

/** An Algorand address: 58 base32 characters (either case). */
const ALGORAND_ADDRESS = /^[A-Za-z2-7]{58}$/;
const ALGO_SCOPED = /^(mainnet|testnet):(uuid|addr|asa|app|txn):(.*)$/i;

function canonicalAlgo(msid: string): string {
  const scoped = ALGO_SCOPED.exec(msid);
  if (scoped) {
    const [, network, kind, id] = scoped;
    const k = kind.toLowerCase();
    const canonicalId = k === "addr" || k === "txn" ? id.toUpperCase() : id;
    return `${network.toLowerCase()}:${k}:${canonicalId}`;
  }
  // A bare did:algo is an account only when it is an address.
  return ALGORAND_ADDRESS.test(msid) ? msid.toUpperCase() : msid;
}

/** Method name → that method's canonical method-specific id. */
const CANONICAL_FORMS: Readonly<Record<string, (msid: string) => string>> = {
  algo: canonicalAlgo,
};

/**
 * `input` with its DID in the method's canonical form; the path, query and
 * fragment of a DID URL are kept as they are. Anything without a rule is
 * returned unchanged.
 */
export function canonicalDid(input: string): string {
  const m = /^did:([a-z0-9]+):([^/?#]*)(.*)$/s.exec(input);
  if (!m) return input;
  const [, method, msid, rest] = m;
  const rule = CANONICAL_FORMS[method];
  return rule ? `did:${method}:${rule(msid)}${rest}` : input;
}
