import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/empe-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:empe through the vendored `@thisdid/empe-did-resolver` — Empeiria
 * `x/diddoc` documents read straight from public Tendermint RPC (keyless,
 * no secrets): one GET `abci_query` per resolution, protobuf-decoded fully
 * offline. Empeiria has no public mainnet yet — mainnet DIDs report
 * `notConfigured` (and fall through to upstreams) until EMPE_RPC_MAINNET_URL
 * is set; the testnet default may be overridden via EMPE_RPC_TESTNET_URL.
 */

interface EmpeEnv {
  EMPE_RPC_MAINNET_URL?: string;
  EMPE_RPC_TESTNET_URL?: string;
}

export default createDriverWorker<EmpeEnv>({
  method: "empe",
  packageName: "@thisdid/empe-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      rpcUrls: {
        ...(env.EMPE_RPC_MAINNET_URL
          ? { mainnet: env.EMPE_RPC_MAINNET_URL }
          : {}),
        ...(env.EMPE_RPC_TESTNET_URL
          ? { testnet: env.EMPE_RPC_TESTNET_URL }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
