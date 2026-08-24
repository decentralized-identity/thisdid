import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/iota-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:iota through the vendored `@thisdid/iota-did-resolver` — Identity
 * Move objects read straight from public IOTA Rebased fullnode JSON-RPC
 * (keyless, no secrets): one chain-identifier assertion per endpoint
 * lifetime plus one `iota_getObject` call per resolution, unpacked and
 * placeholder-substituted fully offline. Endpoints may be overridden per
 * network alias via vars if ever needed (iota / testnet / devnet).
 */

interface IotaEnv {
  IOTA_RPC_MAINNET_URL?: string;
  IOTA_RPC_TESTNET_URL?: string;
  IOTA_RPC_DEVNET_URL?: string;
}

export default createDriverWorker<IotaEnv>({
  method: "iota",
  packageName: "@thisdid/iota-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      rpcUrls: {
        ...(env.IOTA_RPC_MAINNET_URL ? { iota: env.IOTA_RPC_MAINNET_URL } : {}),
        ...(env.IOTA_RPC_TESTNET_URL
          ? { testnet: env.IOTA_RPC_TESTNET_URL }
          : {}),
        ...(env.IOTA_RPC_DEVNET_URL ? { devnet: env.IOTA_RPC_DEVNET_URL } : {}),
      },
    }) as unknown as ResolverRegistry,
});
