/**
 * The provider directory's curated half. Method lists are DERIVED from the
 * engine's own config (LOCAL_DRIVER_METHODS + UPSTREAM_METHOD_SUPPORT), so
 * they can never drift from routing reality.
 */
import { LOCAL_DRIVER_METHODS } from "../../../src/methods";
import { UPSTREAM_METHOD_SUPPORT } from "../../../src/resolvers/registry";
import type { ProviderProfile } from "../types";

const sorted = (values: Iterable<string>): string[] => [...values].sort();

export const PROVIDERS: ProviderProfile[] = [
  {
    id: "thisdid",
    tag: "ThisDID",
    name: "TS Universal Resolver drivers",
    kind: "TypeScript DID Resolver fleet",
    operator: "DIF / GoPlausible (maintainer)",
    baseUrl: "https://thisdid.com/1.0/identifiers/",
    auth: "Open — no key",
    summary:
      "Twenty-four isolated TypeScript driver Workers — the first hop of every routing chain, probation-verified against redundant upstreams while new.",
    methods: sorted(LOCAL_DRIVER_METHODS),
    links: [
      { label: "Resolver", url: "https://thisdid.com" },
      {
        label: "Driver source",
        url: "https://github.com/decentralized-identity/thisdid/tree/main/src/driver-workers",
      },
    ],
  },
  {
    id: "godiddy",
    tag: "godiddy",
    name: "Godiddy",
    kind: "Hosted Universal Resolver",
    operator: "Danube Tech",
    baseUrl: "https://api.godiddy.com/1.0/identifiers/",
    auth: "API key (Authorization: Bearer)",
    summary:
      "Danube Tech's hosted Universal Resolver — the broad-catalog second hop for most methods. Quota-throttled: probed via its unmetered health endpoint, and 429s count as up-but-throttled, never as downtime.",
    methods: sorted(UPSTREAM_METHOD_SUPPORT.godiddy ?? []),
    links: [
      { label: "Godiddy", url: "https://godiddy.com" },
      {
        label: "API docs",
        url: "https://docs.godiddy.com/apis/universal-resolver/index",
      },
    ],
  },
  {
    id: "archon",
    tag: "archon",
    name: "Archon",
    kind: "Universal Resolver + cid Gatekeeper",
    operator: "Archon Technology",
    baseUrl: "https://resolver.archon.technology/1.0/identifiers/",
    auth: "Open — no key",
    summary:
      "A full Universal Resolver deployment plus the cid-only Gatekeeper API — the probation verifier for several TS Universal Resolver drivers (iden3, cid, sol, hedera among them).",
    methods: sorted(UPSTREAM_METHOD_SUPPORT.archon ?? []),
    links: [
      { label: "Archon", url: "https://archon.technology" },
      { label: "Specs", url: "https://archon.technology/specs" },
    ],
  },
  {
    id: "oyd",
    tag: "oyd",
    name: "OYDID Resolver",
    kind: "did:oyd method resolver",
    operator: "OwnYourData",
    baseUrl: "https://resolver.ownyourdata.eu/1.0/identifiers/",
    auth: "Open — no key",
    summary:
      "Public resolver for the did:oyd method (OYDID). The identifier is cryptographically derived from the DID Document, and a cryptographically linked public provenance log guarantees that resolution yields the latest valid version.",
    methods: sorted(UPSTREAM_METHOD_SUPPORT.oyd ?? []),
    links: [
      { label: "OwnYourData", url: "https://www.ownyourdata.eu" },
      { label: "Resolver", url: "https://resolver.ownyourdata.eu" },
    ],
  },
  {
    id: "goplausible",
    tag: "GoPlausible",
    name: "GoPlausible",
    kind: "Algorand-native Universal Resolver",
    operator: "GoPlausible",
    baseUrl: "https://goplausible.xyz/api/1.0/identifiers/",
    auth: "Open — no key",
    summary:
      "The Algorand-native resolver: authoritative first hop for did:algo and did:nfd.",
    methods: sorted(UPSTREAM_METHOD_SUPPORT.goplausible ?? []),
    links: [{ label: "GoPlausible", url: "https://goplausible.com" }],
  },
];

export const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
export const PROVIDER_BY_TAG = new Map(PROVIDERS.map((p) => [p.tag, p]));
