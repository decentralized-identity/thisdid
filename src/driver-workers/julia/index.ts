import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/julia-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:julia through the vendored `@thisdid/julia-did-resolver` — Chia
 * singleton DIDs (keyless, no secrets). The driver walks the singleton from
 * the launcher ID the identifier itself encodes, derives the current state
 * from the most recent spend's own solution, and serves it only after
 * recomputing the singleton puzzle hash and matching it against the unspent
 * coin the chain holds. A state it cannot reproduce is an error, never a
 * guess. `JULIA_RPC_URL` repoints the driver at any other Chia full node;
 * the default is the open Coinset mainnet endpoint.
 */

interface JuliaEnv {
  JULIA_RPC_URL?: string;
}

export default createDriverWorker<JuliaEnv>({
  method: "julia",
  packageName: "@thisdid/julia-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.JULIA_RPC_URL ? { baseUrl: env.JULIA_RPC_URL } : {}),
    }) as unknown as ResolverRegistry,
});
