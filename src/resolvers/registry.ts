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
  // iden3: archon is authoritative first, then ThisDID, then godiddy.
  iden3: ["archon", "local", "godiddy"],
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

/** Stable, low-cardinality provider tag for analytics. */
export function providerTag(step: Step): string {
  if (step === "local") return "ThisDID";
  if (step === "goplausible") return "GoPlausible";
  return step;
}
