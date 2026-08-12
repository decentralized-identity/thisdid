import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "ethr-did-resolver";
import { createDriverWorker } from "../runtime";

interface EthrEnv {
  /** Full Alchemy URLs, including credentials; stored only on this driver Worker. */
  EVM_RPC_MAINNET_URL?: string;
  EVM_RPC_SEPOLIA_URL?: string;
}

export default createDriverWorker<EthrEnv>({
  method: "ethr",
  packageName: "ethr-did-resolver",
  packageVersion: "14.1.2",
  registry: (env) => {
    const networks = [
      ...(env.EVM_RPC_MAINNET_URL
        ? [
            {
              name: "mainnet",
              chainId: 1,
              rpcUrl: env.EVM_RPC_MAINNET_URL,
            },
          ]
        : []),
      ...(env.EVM_RPC_SEPOLIA_URL
        ? [
            {
              name: "sepolia",
              chainId: 11155111,
              rpcUrl: env.EVM_RPC_SEPOLIA_URL,
            },
          ]
        : []),
    ];
    if (networks.length === 0) throw new Error("ethr driver is not configured");
    return getResolver({ networks } as never) as unknown as ResolverRegistry;
  },
});
