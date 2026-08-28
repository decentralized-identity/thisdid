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
  label: "W3C DID Methods registry",
  url: "https://www.w3.org/TR/did-extensions-methods/",
};

export const CURATED: Record<string, CuratedMethod> = {
  // ── Tier-1 edge drivers ───────────────────────────────────────────────────
  web: {
    summary: "Domain-anchored DIDs resolved from /.well-known over HTTPS.",
    research:
      "The workhorse of the DID ecosystem: the identifier is a domain, the document a file the domain serves. ThisDID runs the standard published driver in an isolated Worker of its own.",
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
      "No network, no registry: the identifier IS the key, multicodec-encoded. Resolution is pure computation inside ThisDID.",
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
      "Wraps any CAIP-10 account (Ethereum, Solana, Tezos, Bitcoin, …) as a deterministic DID. Offline resolution inside ThisDID.",
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
      "Each document version is entry-hashed and proof-signed in a did.jsonl log; the ThisDID wrapper adds a WebCrypto Ed25519 proof verifier so history is verified by ThisDID, not trusted. A DIF Recommended method.",
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
    summary:
      "Content-addressed Archon identities, chain-verified by ThisDID itself.",
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

  ion: {
    summary:
      "Sidetree on Bitcoin — long-form DIDs fully verified offline; short-form via upstreams.",
    research:
      "ThisDID's driver verifies long-form did:ion entirely offline (suffix and delta hashes over canonicalized create data — no network needed) and was activated in wave 5 after being parked one wave. Short-form resolution requires an anchored-state Sidetree node: the historical public gateways (Microsoft's ion.msidentity.com, TBD's ion.tbd.engineering) are both dead (re-confirmed 24 Aug 2026), so the driver deliberately ships with NO short-form endpoint — short-form reports notConfigured and the routing chain falls through to upstreams that still advertise ion. Set ION_RESOLUTION_ENDPOINT the day a legitimate Sidetree node exists.",
    links: [
      {
        label: "ION repo (dormant)",
        url: "https://github.com/decentralized-identity/ion",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/ion-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-24",
  },
  iota: {
    summary:
      "Identity Move objects on IOTA Rebased, read from the fullnode and unpacked offline.",
    research:
      "IOTA Identity moved to shared Move objects on IOTA Rebased (MoveVM, Sui-style JSON-RPC) and is in active development (v1.9.x, Aug 2026). Resolution is one iota_getObject call: the driver allowlists the published identity packages per network, asserts each endpoint's chain identifier against the DID's network, unpacks the byte-packed document (DID magic, version, encoding, u16 length) and substitutes the spec's did:0:0 placeholder — validated byte-for-byte against production mainnet Identities (including Turingcerts' domain-linkage DID) before implementation. Archon resolves the method too and serves as probation verifier.",
    links: [
      { label: "IOTA Identity", url: "https://github.com/iotaledger/identity" },
      {
        label: "IOTA DID method spec v2.0",
        url: "https://docs.iota.org/developer/iota-identity/references/iota-did-method-spec",
      },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/iota-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-24",
  },
  dht: {
    summary:
      "Ed25519-signed DNS packets in BitTorrent's Mainline DHT, verified against the DID's own key.",
    research:
      "The DID's suffix IS the Ed25519 identity key: one Pkarr relay GET returns a BEP44 mutable item whose signature the driver verifies against that key before reconstructing the document from its DNS records — a relay can withhold but never forge. The spec (DIF, W3C-registered) is complete and the Mainline + Pkarr rails are live, but records expire without republishing and the method's main publisher ecosystem (TBD's Web5) shut down, so real population is sparse: an absent record answers notFound, deliberately not the spec's identity-key-only fallback, which would resurrect expired or deactivated DIDs. No upstream anywhere resolves did:dht (Archon answers 501), so results are honestly stamped unverified.",
    links: [
      { label: "did:dht spec", url: "https://did-dht.com/" },
      { label: "Pkarr", url: "https://github.com/pubky/pkarr" },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/dht-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-24",
  },
  tz: {
    summary:
      "Tezos accounts derived offline per the Spruce spec, with BLAKE2b-verified key discovery.",
    research:
      "did:tz layer-1 derivation is pure address math (tz1/tz2/tz3 → Ed25519/secp256k1/P-256 method types with a CAIP-10 account id), so every valid account resolves offline. The driver then enriches from the chain: one TzKT call discovers the revealed public key, included only after re-deriving the address from it (BLAKE2b-20) — a lying indexer cannot plant a key. Networks are pinned by live-read chain ids: mainnet and Shadownet (Ghostnet was terminated in 2026). Spruce's reference repo froze in 2021 but the spec's derivation layer is complete; KT1 smart-contract DIDs (TZIP-19 manager views, unused in the wild) report notConfigured. Archon resolves the method too and serves as probation verifier.",
    links: [
      {
        label: "Tezos DID method (Spruce)",
        url: "https://github.com/spruceid/did-tezos",
      },
      { label: "TzKT indexer", url: "https://tzkt.io/" },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/tz-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-24",
  },
  empe: {
    summary:
      "Empeiria EVDI chain documents, protobuf-decoded offline from one Tendermint abci_query.",
    research:
      "Empeiria's Cosmos-SDK chain stores DID documents in its x/diddoc module. The driver hand-encodes the query request, GETs abci_query on the public testnet RPC (path /empe.diddoc.Query/DidDocument) and decodes the protobuf answer offline with field numbers taken from the chain's own codec — validated byte-for-byte against the live testnet. Empeiria has no public mainnet yet (verified 24 Aug 2026): mainnet DIDs report notConfigured until real endpoints exist. The official @empe packages pull cosmjs/protobufjs/typeorm and are unusable in a Worker, hence the clean room. Archon resolves the method too and serves as probation verifier.",
    links: [
      { label: "Empeiria", url: "https://github.com/empe-io" },
      {
        label: "vendored package",
        url: `${REPO}/tree/main/vendor/empe-did-resolver`,
      },
    ],
    lastReviewed: "2026-08-24",
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
    summary:
      "Hyperledger Indy ledger DIDs — served upstream; a local driver has no trustworthy transport.",
    research:
      "Sovrin MainNet stopped accepting writes on 31 March 2025 and the Sovrin Foundation dissolved on 21 May 2025 — but its nodes still answer reads (live nymResponse observed August 2026), and the network story did not end there: Indicio MainNet remains actively written (a fresh NYM landed mid-August 2026) while IDunion looks dead and BCovrin/CANdy expose no browse APIs. The ecosystem's growth migrated to cheqd (ThisDID local driver) and did:webvh. A local driver stays parked on transport grounds, not liveness: Indy nodes speak ZeroMQ only, nobody hosts a public indy-vdr proxy, and IndyScan's HTTP API is Indicio-only Elasticsearch data without state proofs — an edge driver would be an unverified scraper with worse coverage than the upstream chain, which resolves both sovrin and indicio namespaces in about a second today.",
    links: [
      { label: "Sovrin Foundation", url: "https://sovrin.org/" },
      { label: "Indicio IndyScan", url: "https://indyscan.indiciotech.io/" },
      {
        label: "indy-vdr",
        url: "https://github.com/hyperledger-indy/indy-vdr",
      },
    ],
    lastReviewed: "2026-08-28",
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

  // ── Long tail (upstream-routed) ───────────────────────────────────────────
  btcr: {
    summary:
      "Bitcoin transaction-reference DIDs — the original ledger DID experiment.",
  },
  btcr2: {
    summary:
      "The modern successor to did:btcr (formerly did:btc1), anchored in Bitcoin transactions.",
    research:
      "Digital Contract Design's successor to did:btcr, presented as did:btc1 through 2025 before the rename. The spec is very active but self-declared draft with possible breaking changes, and it is not yet in the W3C DID method registry. Identifiers are bech32m (a secp256k1 key or a genesis-document hash); document updates are discovered by scanning beacon addresses over Esplora-style HTTPS APIs and verified with hash-chained JSON Patches and BIP-340 Schnorr signatures — mechanics a Worker driver could implement, and an official TypeScript implementation exists (@did-btcr2/method, noble/scure-based). Adoption is test-network-only so far (mutinynet/signet vectors; no mainnet DIDs found in the wild), so ThisDID serves it upstream — both Godiddy and the DIF Universal Resolver resolve the mutinynet canary today — and a verifying edge driver waits on W3C registration or real mainnet usage.",
    links: [
      { label: "did:btcr2 spec", url: "https://dcdpr.github.io/did-btcr2/" },
      { label: "dcdpr/did-btcr2", url: "https://github.com/dcdpr/did-btcr2" },
      {
        label: "TypeScript implementation",
        url: "https://github.com/dcdpr/did-btcr2-js",
      },
    ],
    lastReviewed: "2026-08-28",
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
  ling: {
    summary: "LING key-value-store DIDs by K4-Security Co., Ltd (Seoul).",
    research:
      "Not a Chinese chain: LING is K4-Security's (the same Seoul vendor behind did:kscirc) LevelDB-based key-value store, and the DID method rides on it. The spec is a v0.0.1 Notion draft from May 2024, untouched since, defining no resolution endpoints; the resolver stack is four closed-source containers, and exactly one DID is known to resolve through the DIF dev instance — carrying a revoked timestamp. No public read API exists, so no verifying edge driver is buildable; the method stays upstream-routed in the long tail.",
    links: [
      {
        label: "LING method spec",
        url: "https://tangy-gallium-b9b.notion.site/LING-DID-Method-Specification-7b9d25a62a1849a496890b9ef24e0890",
      },
    ],
    lastReviewed: "2026-08-28",
  },
  emtrust: { summary: "Halialabs EmTrust DIDs." },
  meta: { summary: "Metadium chain DIDs." },
  kit: { summary: "Keyp toolkit DIDs." },
  oyd: {
    summary:
      "OwnYourData OYDID — self-verifying identifiers over provenance logs.",
    research:
      "The identifier commits to its own document: a base58btc multihash of the stored record, whose provenance log (create/update/revoke entries, each Ed25519-signed and hash-chained) lets any resolver verify the full history from public HTTPS endpoints — no ledger involved. OwnYourData (EU NGI-funded) remains actively developed in 2026 and its public repo and resolver answer in well under a second. ThisDID routes did:oyd to resolver.ownyourdata.eu as the authoritative first hop; notably, the DIF Universal Resolver's oyd driver is a pure proxy to that same resolver and Godiddy does not support the method, so today nobody independently verifies did:oyd. All verification primitives (SHA-256 multihash, canonical-JSON log hashing, Ed25519) are reproducible with WebCrypto alone, making a local verifying driver — the only independent check of the method anywhere — a planned small build.",
    links: [
      {
        label: "OYDID spec",
        url: "https://ownyourdata.github.io/oydid/",
      },
      {
        label: "OwnYourData/oydid",
        url: "https://github.com/OwnYourData/oydid",
      },
    ],
    lastReviewed: "2026-08-28",
  },
  moncon: { summary: "Moncon content-commerce DIDs." },
  mydata: { summary: "MyData operator DIDs." },
  everscale: { summary: "Everscale chain DIDs." },
  ala: { summary: "Alastria network DIDs (Quorum redT)." },
  com: { summary: "Commercio.network chain DIDs." },
  dyne: { summary: "Dyne.org / Zenroom DIDs." },
  kscirc: {
    summary: "KSChain DIDs by K4-Security Co., Ltd (Seoul).",
    research:
      "Operated by K4-Security Co., Ltd, a Seoul security vendor (DIF Korea SIG member, Danube Tech partner) — not, as sometimes assumed, a Korean financial-sector institute. The spec is a Notion page (v1.0.0, 2022, draft) whose entire Read section is one sentence: no resolution API, RPC, or endpoint is documented anywhere, the Universal Resolver driver wraps a closed-source binary, and the service domain inside the method's own DID documents (did.k4-security.com) no longer resolves in DNS. Exactly three canned demo DIDs resolve via the DIF dev instance. With no public read API there is nothing a verifying edge driver could verify — the method stays upstream-routed.",
    links: [
      {
        label: "KSChain method spec",
        url: "https://tangy-gallium-b9b.notion.site/DID-Method-Specification-KSChain-7a77664f1eae47769692f4ff2d029fe0",
      },
    ],
    lastReviewed: "2026-08-28",
  },
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
  webs: {
    summary: "did:web secured with KERI key event logs (did:webs).",
    research:
      "The ToIP KERI Suite WG spec (v0.10.3, still draft even though the underlying KERI/ACDC/CESR specs were ratified in January 2026) is strict by design: a resolver MUST fetch both did.json and keri.cesr, MUST verify the full key event log, and MUST fail on any mismatch — serving did.json alone degrades did:webs to plain did:web security and is explicitly non-conformant. A faithful TypeScript verifier means a clean-room CESR parser plus KEL state machine (~4–5k lines against keripy's ~25k-line reference; signify-ts is a KERIA client without the validator and drags runtime-WASM libsodium, which Workers block). With adoption still tutorial-grade — GLEIF's own testnet endpoint is down and no production did:webs is discoverable — ThisDID serves the method upstream, where Godiddy resolves the canonical tutorial DID via GLEIF's reference driver in ~200ms. An edge driver waits on production publishers or a maintained TS KEL verifier.",
    links: [
      {
        label: "did:webs spec (ToIP)",
        url: "https://trustoverip.github.io/kswg-did-method-webs-specification/",
      },
      {
        label: "GLEIF reference resolver",
        url: "https://github.com/GLEIF-IT/did-webs-resolver",
      },
    ],
    lastReviewed: "2026-08-28",
  },
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
const EXTRA_IDS = ["sov"];

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
