import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/xrpl-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:xrpl through the vendored `@thisdid/xrpl-did-resolver` — native
 * XLS-40 DID ledger entries read straight from public XRPL JSON-RPC
 * (keyless, no secrets), one `ledger_entry {did}` call per resolution.
 * Endpoints may be overridden per network-id via vars if ever needed
 * (0 = mainnet, 1 = testnet, 2 = devnet).
 */

interface XrplEnv {
  XRPL_RPC_MAINNET_URL?: string;
  XRPL_RPC_TESTNET_URL?: string;
  XRPL_RPC_DEVNET_URL?: string;
}

export default createDriverWorker<XrplEnv>({
  method: "xrpl",
  packageName: "@thisdid/xrpl-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      rpcUrls: {
        ...(env.XRPL_RPC_MAINNET_URL ? { "0": env.XRPL_RPC_MAINNET_URL } : {}),
        ...(env.XRPL_RPC_TESTNET_URL ? { "1": env.XRPL_RPC_TESTNET_URL } : {}),
        ...(env.XRPL_RPC_DEVNET_URL ? { "2": env.XRPL_RPC_DEVNET_URL } : {}),
      },
    }) as unknown as ResolverRegistry,
});
