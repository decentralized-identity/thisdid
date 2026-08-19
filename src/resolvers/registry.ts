/**
 * Routing registry — the heart of ThisDID's "smart routing".
 *
 * Each DID method maps to an ORDERED fallback chain of steps. A step is either:
 *   - `local`   → resolved by an isolated TypeScript driver Worker through a Service Binding.
 *   - `godiddy` → routed to the godiddy Universal Resolver.
 *   - `archon`  → routed to the archon Universal Resolver.
 *
 * The chain is tried in order; the first step that returns a usable DID document
 * wins, otherwise the next step is attempted. This is the single place to change
 * how (and to which redundant resolver) any method is routed.
 */

export type Step = "local" | "godiddy" | "archon" | "goplausible";

/** Most methods: try ThisDID first, then godiddy, then archon. */
export const DEFAULT_CHAIN: Step[] = ["local", "godiddy", "archon"];

/** Per-method chain overrides. */
export const ROUTE_CHAINS: Record<string, Step[]> = {
  // iden3 & cid: archon is authoritative first, then ThisDID, then godiddy.
  iden3: ["archon", "local", "godiddy"],
  cid: ["archon", "local", "godiddy"],
  // Algorand-anchored methods: GoPlausible first, then godiddy, then archon.
  algo: ["goplausible", "godiddy", "archon"],
  nfd: ["goplausible", "godiddy", "archon"],
};

export function chainFor(method: string): Step[] {
  return ROUTE_CHAINS[method] ?? DEFAULT_CHAIN;
}

/** Whether a step resolves inside the Worker (`local`) or via an upstream. */
export function stepRoute(step: Step): "local" | "upstream" {
  return step === "local" ? "local" : "upstream";
}

/**
 * Methods each upstream is known to resolve — used for probation verifier
 * selection only (routing fall-through still tries every configured step).
 * Godiddy's set is its advertised catalog. Archon is a full Universal Resolver
 * deployment: resolution-verified 2026-08-17 for iden3/cid/web/ebsi/near/
 * webvh/plc; its did:jwk driver currently fails (HTTP 500), so jwk is
 * deliberately excluded. GoPlausible is the Algorand-native resolver.
 */
export const UPSTREAM_METHOD_SUPPORT: Partial<
  Record<Step, ReadonlySet<string>>
> = {
  godiddy: new Set([
    "btcr2",
    "cheqd",
    "dns",
    "ebsi",
    "ethr",
    "iden3",
    "indy",
    "ion",
    "jwk",
    "key",
    "kscirc",
    "ling",
    "near",
    "pkh",
    "v1",
    "web",
    "webs",
    "webvh",
  ]),
  archon: new Set([
    "iden3",
    "cid",
    "web",
    "ebsi",
    "near",
    "webvh",
    "plc",
    "cheqd",
    "ens",
  ]),
  goplausible: new Set(["algo", "nfd"]),
};

/** True when the upstream is known (or assumed) to resolve the method. */
export function upstreamSupports(step: Step, method: string): boolean {
  if (step === "local") return false;
  const supported = UPSTREAM_METHOD_SUPPORT[step];
  return supported ? supported.has(method) : true;
}

/** Stable, low-cardinality provider tag for analytics. */
export function providerTag(step: Step): string {
  if (step === "local") return "ThisDID";
  if (step === "goplausible") return "GoPlausible";
  return step;
}
