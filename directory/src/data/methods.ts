/**
 * The curated half of every method profile — the research that used to live
 * only in maintainer notes, now public. Editing this file is a PR, which is
 * the right governance for public claims about third-party projects.
 *
 * Statuses are DERIVED from the engine's own config wherever possible
 * (LOCAL_DRIVER_METHODS, PROBATION_METHODS, ROUTE_CHAINS); curated entries
 * only carry what config cannot: research bodies, links, and disposition
 * overrides for parked / no-go / bench / excluded methods.
 */
import {
  ALL_METHODS,
  FEATURED_METHODS,
  LOCAL_DRIVER_METHODS,
  PROBATION_METHODS,
} from "../../../src/methods";
import {
  chainFor,
  providerTag,
  upstreamSupports,
} from "../../../src/resolvers/registry";
import type { CuratedMethod, DifRegistry, MethodProfile } from "../types";

const REPO = "https://github.com/decentralized-identity/thisdid";
const W3C_EXTENSIONS = {
  label: "W3C DID Extensions registry",
  url: "https://www.w3.org/TR/did-extensions/",
};

export const CURATED: Record<string, CuratedMethod> = {
  // ── Tier-1 edge drivers ───────────────────────────────────────────────────
  web: {
    summary: "Domain-anchored DIDs resolved from /.well-known over HTTPS.",
    research:
      "The workhorse of the DID ecosystem: the identifier is a domain, the document a file the domain serves. ThisDID runs the standard published driver in an isolated edge Worker.",
    links: [
      {
        label: "did:web method spec",
        url: "https://w3c-ccg.github.io/did-method-web/",
      },
      {
        label: "web-did-resolver",
        url: "https://github.com/decentralized-identity/web-did-resolver",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  key: {
    summary: "Deterministic, fully offline DIDs derived from a public key.",
    research:
      "No network, no registry: the identifier IS the key, multicodec-encoded. Resolution is pure computation at the edge.",
    links: [
      {
        label: "did:key method spec",
        url: "https://w3c-ccg.github.io/did-key-spec/",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  pkh: {
    summary:
      "CAIP-10 blockchain-account DIDs — one identifier per on-chain account.",
    research:
      "Wraps any CAIP-10 account (Ethereum, Solana, Tezos, Bitcoin, …) as a deterministic DID. Offline resolution at the edge.",
    links: [
      {
        label: "did:pkh method spec",
        url: "https://github.com/w3c-ccg/did-pkh",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  peer: {
    summary: "Deterministic peer-to-peer DIDComm identities, no ledger.",
    links: [
      {
        label: "did:peer method spec",
        url: "https://identity.foundation/peer-did-method-spec/",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  ethr: {
    summary: "ERC-1056 Ethereum registry DIDs, read over EVM RPC.",
    research:
      "The canonical uPort/Veramo lineage method. ThisDID runs the official resolver against keyed mainnet/Sepolia RPC; a DIF Recommended method.",
    links: [
      {
        label: "ethr-did-resolver",
        url: "https://github.com/decentralized-identity/ethr-did-resolver",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  webvh: {
    summary: "did:web hardened with a verifiable, hash-linked key history.",
    research:
      "Each document version is entry-hashed and proof-signed in a did.jsonl log; the ThisDID wrapper adds a WebCrypto Ed25519 proof verifier so history is verified at the edge, not trusted. A DIF Recommended method.",
    links: [
      { label: "did:webvh spec", url: "https://identity.foundation/didwebvh/" },
      {
        label: "vendored wrapper",
        url: `${REPO}/tree/main/vendor/webvh-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  plc: {
    summary:
      "AT Protocol / Bluesky ledger identities from the public PLC directory.",
    research:
      "The identity layer under Bluesky. The ThisDID wrapper keeps @atproto/identity as the implementation and adds a workerd-safe directory fetch.",
    links: [
      {
        label: "did:plc spec",
        url: "https://web.plc.directory/spec/v0.1/did-plc",
      },
      {
        label: "vendored wrapper",
        url: `${REPO}/tree/main/vendor/plc-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  ebsi: {
    summary: "EU EBSI legal-entity identifiers from the pilot registry.",
    links: [{ label: "EBSI DID docs", url: "https://hub.ebsi.eu/" }],
    lastReviewed: "2026-08-23",
  },
  near: {
    summary: "NEAR accounts, named and implicit, over NEAR JSON-RPC.",
    research:
      "A clean-room fetch-native package: the prior ecosystem resolver's dependency chain carried the unpatched elliptic CVE-2025-14505 and a native addon, so ThisDID reimplemented resolution directly against NEAR RPC.",
    links: [
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/near-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  jwk: {
    summary: "A single JSON Web Key as a DID — deterministic and offline.",
    research:
      "Clean-room, dependency-free implementation of the deterministic did:jwk spec. Probation verification against Godiddy surfaced a real interop nuance: purpose-silent upstream documents are treated as having no opinion on relationships rather than as disagreeing.",
    links: [
      {
        label: "did:jwk spec",
        url: "https://github.com/quartzjer/did-jwk/blob/main/spec.md",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/jwk-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  cheqd: {
    summary: "cheqd network identity ledger, via cheqd's official resolver.",
    research:
      "cheqd has become the landing zone for migrating SSI ecosystems (Dock and much of the former Sovrin world now issue did:cheqd).",
    links: [
      {
        label: "cheqd DID docs",
        url: "https://docs.cheqd.io/product/architecture/adr-list/adr-001-cheqd-did-method",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  dns: {
    summary: "Domain keys published as DNS URI records, read over DoH.",
    links: [
      {
        label: "did:dns draft spec",
        url: "https://danubetech.github.io/did-method-dns/",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/dns-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  ens: {
    summary: "Ethereum Name Service identities over Ethereum JSON-RPC.",
    links: [
      { label: "ENS", url: "https://ens.domains/" },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/ens-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  cid: {
    summary: "Content-addressed Archon identities, chain-verified at the edge.",
    research:
      "A resolution-only Gatekeeper: instead of trusting a resolver's answer, the driver fetches the DID's full signed operation chain and re-verifies every operation (CIDv1 linkage + secp256k1 signatures) before composing the document — the Gatekeeper is a courier, not an authority. A DIF Recommended method.",
    links: [
      { label: "Archon", url: "https://archon.technology/" },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/cid-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  sol: {
    summary: "Solana on-chain identities, read from BOTH sol-did programs.",
    research:
      "One getMultipleAccounts round-trip checks the current Anchor program and the legacy program — live verification during the build proved real-world did:sol population still lives on the legacy program. Legacy state maps to modern flag semantics exactly as the on-chain migrate() does; no account on either program resolves generatively per the spec.",
    links: [
      {
        label: "Identity.com sol-did",
        url: "https://github.com/identity-com/sol-did",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/sol-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  iden3: {
    summary:
      "Iden3 identity states, read straight from the on-chain State contract.",
    research:
      "Three eth_calls against the State contract replace a 21 MB SDK path. Every encoding rule was validated live before implementation — iden3 IDs convert to uint256 little-endian, and state hashes render little-endian too (an apparent upstream mismatch during the build turned out to be byte order). The probation comparator compares the actual identity state, GIST root, contract, and proof — not just key sets.",
    links: [
      {
        label: "iden3 State contracts",
        url: "https://github.com/iden3/contracts",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/iden3-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  polygonid: {
    summary: "Privado ID identities on the same iden3 State-contract engine.",
    research:
      "Rides the iden3 clean-room package with ID type-byte enforcement (go-iden3-core DIDMethodByte: iden3 0x01, polygonid 0x02) — an identifier whose typing disagrees with its method or network is invalidDid. No upstream resolver anywhere serves did:polygonid (verified live), making ThisDID the only public route; results are honestly stamped unverified.",
    links: [{ label: "Privado ID", url: "https://www.privado.id/" }],
    lastReviewed: "2026-08-23",
  },
  hedera: {
    summary:
      "Hedera Consensus Service DID topics, signature-verified event by event.",
    research:
      "HCS topics are publicly writable, so trust comes from signatures, not the topic: every message envelope is Ed25519-verified against the DID root key before folding, and the event history is bounded AND fail-closed — a topic exceeding the bound refuses to resolve rather than serving potentially stale state, because silent truncation would be floodable by an attacker without the key. A DIF Recommended method.",
    links: [
      {
        label: "Hedera DID method",
        url: "https://github.com/hashgraph/did-method",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/hedera-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },
  xrpl: {
    summary:
      "Native XLS-40 DIDs, read from the XRP Ledger's own consensus state.",
    research:
      "The XRP Ledger stores DID objects at the protocol level (XLS-40, live on mainnet since October 2024). Resolution is one ledger_entry call; authored on-ledger documents pass a strict usability validation (own-DID ids, resolved references, exactly one encoding-validated public key per method, private JWK members rejected) before being served. To our knowledge this is the first published resolver for XLS-40 — no upstream anywhere serves it, so results are honestly stamped unverified.",
    links: [
      {
        label: "XLS-40 specification",
        url: "https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0040-decentralized-identity",
      },
      {
        label: "XRPL DID docs",
        url: "https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/did",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/xrpl-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },

  // ── Parked ────────────────────────────────────────────────────────────────
  ion: {
    status: "parked",
    statusReason:
      "Driver built and tested; unbound until a non-resolver short-form endpoint exists.",
    summary:
      "Sidetree on Bitcoin — long-form DIDs verifiable offline, network dormant.",
    research:
      "ThisDID's driver verifies long-form did:ion entirely offline (suffix and delta hashes over canonicalized create data — no network needed), but short-form resolution requires a Sidetree node, and the public ION network has been dormant since 2023 (the reference repo untouched since August 2023; Microsoft and TBD both exited). Self-hosting an ION node against hosted Bitcoin RPC is the only real path to short-form support, so the driver is parked and did:ion serves via upstream routing meanwhile.",
    links: [
      {
        label: "ION repo (dormant)",
        url: "https://github.com/decentralized-identity/ion",
      },
      {
        label: "parked driver",
        url: `${REPO}/tree/main/vendor/ion-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-23",
  },

  // ── Maintainer-excluded (served elsewhere) ────────────────────────────────
  algo: {
    status: "excluded",
    statusReason:
      "Served natively by the GoPlausible resolver (goplausible-first chain).",
    summary:
      "Algorand address DIDs, resolved by the Algorand-native GoPlausible route.",
    lastReviewed: "2026-08-23",
  },
  nfd: {
    status: "excluded",
    statusReason:
      "Served natively by the GoPlausible resolver (goplausible-first chain).",
    summary: "Algorand NFDomains name DIDs, resolved by the GoPlausible route.",
    links: [{ label: "NFDomains", url: "https://app.nf.domains/" }],
    lastReviewed: "2026-08-23",
  },

  // ── NO-GO: researched, evidence-backed ────────────────────────────────────
  kilt: {
    status: "no-go",
    statusReason: "Spiritnet parachain unreachable; lease expired May 2026.",
    summary:
      "KILT Protocol DIDs — the chain they resolve against is no longer publicly reachable.",
    research:
      "Gate-checked live on 23 August 2026 and failed decisively. Every Spiritnet RPC hostname is NXDOMAIN — KILT's own spiritnet.kilt.io and peregrine.kilt.io, plus the third-party providers (Dwellir, OnFinality, IBP, Dotters) — and even docs.kilt.io no longer resolves. The parachain lease-swap referendum granted block production only until May 2026, now expired; polkadot-js apps disabled the last provider after its December 2025 nightly endpoint check failed; Subscan removed the Spiritnet network. Development froze earlier: kilt-node's last release is 1.16.3 (July 2025) and sdk-js's last real commit is March 2025, while the token migrated to an ERC-20 on Base in mid-2025 and Kraken delisted. No upstream resolves it either — Godiddy answers 501 methodNotSupported, Archon 500s. With no ledger endpoint and no upstream, resolution is impossible for anyone. Revisit only if the KILT Foundation ships a new publicly queryable identity ledger.",
    links: [
      {
        label: "Lease-swap referendum (block production until May 2026)",
        url: "https://kilt.polkassembly.network/referendum/38",
      },
      {
        label: "kilt-node releases (last: July 2025)",
        url: "https://github.com/KILTprotocol/kilt-node/releases",
      },
      {
        label: "Token migration to Base",
        url: "https://medium.com/kilt-protocol/kilt-token-migration-guide-4ae8a5b686d6",
      },
      {
        label: "polkadot-js endpoint removal",
        url: "https://github.com/polkadot-js/apps/issues/12076",
      },
    ],
    lastReviewed: "2026-08-23",
  },
  indy: {
    status: "no-go",
    statusReason:
      "Sovrin MainNet shut down 31 March 2025; Foundation dissolved.",
    summary:
      "Hyperledger Indy ledger DIDs — the flagship Sovrin network is gone.",
    research:
      "Sovrin MainNet shut down on 31 March 2025 and the Sovrin Foundation dissolved on 21 May 2025; the ledger survives only as a read-only archive with the write keys destroyed. The ecosystem largely migrated to cheqd (which ThisDID serves with a local driver). Indy tooling is additionally worker-hostile (ZMQ ledger transport).",
    links: [{ label: "Sovrin Foundation", url: "https://sovrin.org/" }],
    lastReviewed: "2026-08-21",
  },
  sov: {
    status: "no-go",
    statusReason: "The Sovrin ledger behind did:sov is shut down.",
    summary:
      "Sovrin ledger DIDs — the one DIF-catalog method ThisDID deliberately does not advertise.",
    research:
      "did:sov resolved against Sovrin MainNet, which shut down 31 March 2025 with the write keys destroyed. The method remains in the DIF Universal Resolver compose catalog but is intentionally absent from ThisDID's advertised catalog.",
    lastReviewed: "2026-08-23",
  },
  dock: {
    status: "no-go",
    statusReason: "Dock chain sunset mid-2025; migrated onto cheqd.",
    summary:
      "Dock chain DIDs — a tombstone whose successor (did:cheqd) ThisDID already serves.",
    research:
      "The Dock chain was sunset in mid-2025 and its credential business migrated onto cheqd; Dock itself now issues did:cheqd.",
    lastReviewed: "2026-08-21",
  },
  jolo: {
    status: "no-go",
    statusReason: "Jolocom GmbH insolvent since April 2023.",
    summary:
      "Jolocom DIDs — the company behind the method entered insolvency in 2023.",
    lastReviewed: "2026-08-21",
  },
  factom: {
    status: "no-go",
    statusReason: "Factom Inc. bankrupt (2020); protocol defunct.",
    summary:
      "Factom protocol DIDs — defunct since the operating company's 2020 bankruptcy.",
    lastReviewed: "2026-08-21",
  },
  evan: {
    status: "no-go",
    statusReason: "evan.network discontinued.",
    summary:
      "evan.network DIDs — the network was discontinued; drivers hang on real DIDs.",
    lastReviewed: "2026-08-21",
  },
  elem: {
    status: "no-go",
    statusReason:
      "Transmute's Sidetree-on-Ethereum experiment, abandoned years ago.",
    summary: "Element (Sidetree on Ethereum) DIDs — long abandoned.",
    lastReviewed: "2026-08-21",
  },
  github: {
    status: "no-go",
    statusReason: "Abandoned by Transmute years ago.",
    summary: "GitHub-profile DIDs — an early experiment, long abandoned.",
    lastReviewed: "2026-08-21",
  },
  orb: {
    status: "no-go",
    statusReason: "Orphaned after SecureKey's acquisition by Avast.",
    summary:
      "SecureKey's federated Sidetree method — orphaned; failing on all configured upstreams.",
    lastReviewed: "2026-08-21",
  },

  // ── Bench: candidates, not promoted ───────────────────────────────────────
  empe: {
    status: "bench",
    statusReason: "Real DIF v4 package, but niche and bundles node-fetch.",
    summary:
      "Empeiria chain DIDs — a real resolver package exists; adoption is niche.",
    lastReviewed: "2026-08-21",
  },
  iota: {
    status: "bench",
    statusReason:
      "WASM-heavy bindings; post-Rebase plain-RPC read path unproven.",
    summary:
      "IOTA Identity DIDs — actively developed with EU-ecosystem adoption, judged too risky for a wave slot.",
    research:
      "IOTA Identity is alive and has EU-ecosystem traction, but the official bindings are WASM-heavy for the Workers runtime and the post-Rebase plain-RPC read path is unproven. Revisit if IOTA ships a light resolution path.",
    links: [
      { label: "IOTA Identity", url: "https://github.com/iotaledger/identity" },
    ],
    lastReviewed: "2026-08-21",
  },
  dht: {
    status: "bench",
    statusReason:
      "Substrate alive (Pkarr), but method adoption collapsed with TBD's shutdown.",
    summary:
      "BitTorrent-DHT DIDs — technically the easiest driver on the board, with no measurable adoption.",
    research:
      "Self-certifying ed25519 keys plus one relay GET — the easiest possible driver. The Pkarr substrate remains alive (Pubky/Synonym), but adoption of the did:dht METHOD itself collapsed with TBD's shutdown. Promoted only on evidence of real usage.",
    links: [{ label: "did:dht spec", url: "https://did-dht.com/" }],
    lastReviewed: "2026-08-21",
  },
  tz: {
    status: "bench",
    statusReason:
      "Solid Spruce implementation; lower current ecosystem activity.",
    summary:
      "Tezos DIDs via Spruce's did-tezos — implementable, awaiting an activity signal.",
    lastReviewed: "2026-08-21",
  },

  // ── Long tail (upstream-routed) ───────────────────────────────────────────
  btcr: {
    summary:
      "Bitcoin transaction-reference DIDs — the original ledger DID experiment.",
  },
  btcr2: {
    summary:
      "The modern successor to did:btcr, anchored in Bitcoin transactions.",
  },
  v1: { summary: "Veres One ledger DIDs (Digital Bazaar)." },
  stack: { summary: "Blockstack/Stacks naming-system DIDs." },
  eosio: {
    summary: "EOSIO chain account DIDs with weighted-threshold key conditions.",
  },
  hcr: { summary: "Hashcard registry DIDs." },
  ccp: { summary: "China Cloud Park chain DIDs." },
  ont: { summary: "Ontology chain DIDs." },
  io: { summary: "IoTeX chain DIDs." },
  bba: { summary: "Blobaa attestation DIDs on Ardor." },
  schema: { summary: "Schema-registry DIDs (evan/IPFS-hosted JSON schemas)." },
  ace: { summary: "Aceblock DIDs." },
  gatc: { summary: "Gataca identity platform DIDs." },
  icon: { summary: "ICON chain DIDs." },
  vaa: { summary: "VAA chain DIDs." },
  unisot: { summary: "UNISOT (Bitcoin SV) supply-chain DIDs." },
  lit: { summary: "LEDGIS chain DIDs." },
  ling: { summary: "Lingchuang chain DIDs." },
  emtrust: { summary: "Halialabs EmTrust DIDs." },
  meta: { summary: "Metadium chain DIDs." },
  kit: { summary: "Keyp toolkit DIDs." },
  oyd: { summary: "OwnYourData decentralized-container DIDs." },
  moncon: { summary: "Moncon content-commerce DIDs." },
  mydata: { summary: "MyData operator DIDs." },
  everscale: { summary: "Everscale chain DIDs." },
  ala: { summary: "Alastria network DIDs (Quorum redT)." },
  com: { summary: "Commercio.network chain DIDs." },
  dyne: { summary: "Dyne.org / Zenroom DIDs." },
  kscirc: { summary: "KS Chain (KSCIRC) DIDs." },
  iscc: { summary: "International Standard Content Code DIDs." },
  ev: { summary: "Everis/NTT Data DIDs." },
  iid: { summary: "Interchain identifier DIDs." },
  bid: { summary: "Bif/China BSN BID DIDs." },
  pdc: { summary: "Public Data Chain DIDs." },
  tys: { summary: "TYS chain DIDs." },
  evrc: { summary: "Everycred credential DIDs." },
  keri: {
    summary: "KERI autonomic identifiers — ledger-independent key event logs.",
  },
  webs: { summary: "did:web secured with KERI key event logs (did:webs)." },
  prism: { summary: "Cardano PRISM DIDs (Atala/Hyperledger Identus)." },
  cndid: { summary: "CNDID chain DIDs." },
  tgrid: { summary: "TrustGrid DIDs." },
  bluchain: { summary: "Bluchain DIDs." },
  webplus: {
    summary:
      "did:web hardened with verifiable history (webplus) — a DIF Recommended method.",
  },
};

/** Directory-only ids (not in the routing catalog) that still get profiles. */
const EXTRA_IDS = ["sov", "iota", "dht", "tz"];

const FEATURED = new Map(FEATURED_METHODS.map((m) => [m.id, m]));
const LOCAL = new Set<string>(LOCAL_DRIVER_METHODS);

/** Assemble every profile: curated + engine config + the DIF sync. */
export function buildProfiles(registry: DifRegistry): MethodProfile[] {
  const ids = [...new Set([...ALL_METHODS, ...EXTRA_IDS])].sort();
  const recommended = new Map(registry.recommended.map((r) => [r.id, r.url]));
  const endorsed = new Map(registry.endorsed.map((r) => [r.id, r.url]));
  const compose = new Set(registry.composeMethods);

  return ids.map((id) => {
    const curated = CURATED[id];
    const featured = FEATURED.get(id);
    const inCatalog = ALL_METHODS.includes(id);
    const status = curated?.status ?? (LOCAL.has(id) ? "edge" : "upstream");
    const probation = PROBATION_METHODS.has(id);
    const probationVerifiers = probation
      ? chainFor(id)
          .filter((step) => step !== "local" && upstreamSupports(step, id))
          .map(providerTag)
      : undefined;
    // Catalog members keep their real routing chain regardless of status —
    // even no-go methods stay upstream-routed (a dim chip costs nothing).
    const chain = inCatalog ? chainFor(id).map(providerTag) : [];
    const dif: MethodProfile["dif"] = {};
    if (recommended.has(id)) dif.recommended = recommended.get(id);
    if (endorsed.has(id)) dif.endorsed = endorsed.get(id);
    if (compose.has(id)) {
      // Approved + merged resolver docker container in the DIF Universal
      // Resolver repository (registry.drivers may be absent on a registry
      // value stored by an older deployment — tolerate it).
      dif.dockerDriver = registry.drivers?.[id] ?? {};
    }
    return {
      id,
      name: curated?.name ?? `did:${id}`,
      status,
      probation,
      ...(probationVerifiers ? { probationVerifiers } : {}),
      summary:
        curated?.summary ?? `did:${id} — routed through the upstream chain.`,
      research: curated?.research,
      links: [...(curated?.links ?? []), W3C_EXTENSIONS],
      statusReason: curated?.statusReason,
      lastReviewed: curated?.lastReviewed,
      network: featured?.network,
      example: featured?.example,
      chain: inCatalog ? chain : [],
      dif: Object.keys(dif).length ? dif : undefined,
    };
  });
}
