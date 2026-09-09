/**
 * @thisdid/ethr-did-resolver — DIF `did-resolver` driver for did:ethr.
 *
 * The method implementation is the DIF `ethr-did-resolver` core (ERC-1056
 * registry reads over ethers), consumed from the ThisDID-custodied fork under
 * `vendor/forks/ethr-did-resolver` (pinned to the 14.1.2 release) rather than
 * the npm registry, so every line that resolves a did:ethr here can be read,
 * audited and patched in this repository. This package adds the environment
 * → network configuration the ThisDID Worker and the command-line resolver
 * share, and is the single import both use.
 */
import { getResolver as coreGetResolver } from "ethr-did-resolver";
import type { ResolverRegistry } from "did-resolver";

/** The core's own configuration shape (networks, providers, cache), taken
 *  from its `getResolver` signature since the core does not export the name. */
export type EthrResolverOptions = Parameters<typeof coreGetResolver>[0];

export interface EthrNetwork {
  name: "mainnet" | "sepolia";
  chainId: number;
  rpcUrl: string;
}

/**
 * Compose an Alchemy RPC endpoint from a public base-URL var (ends with `/`)
 * and the ALCHEMY_API_KEY secret, exactly as the ThisDID Worker does; both
 * halves must be present.
 */
function alchemyRpcUrl(
  base: string | undefined,
  key: string | undefined,
): string | undefined {
  const trimmedBase = base?.trim();
  const trimmedKey = key?.trim();
  if (!trimmedBase || !trimmedKey) return undefined;
  return trimmedBase.replace(/\/*$/, "/") + trimmedKey;
}

/**
 * The networks a host has configured, from the ThisDID variable convention:
 * `ETH_RPC_<NETWORK>_URL` (a complete endpoint) or
 * `ETH_RPC_<NETWORK>_BASE_URL` + `ALCHEMY_API_KEY`. Networks without an
 * endpoint are omitted, so the resolver fails closed for them
 * (`unknownNetwork`), never guessing a public RPC.
 */
export function networksFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): EthrNetwork[] {
  const networks: EthrNetwork[] = [];
  for (const [name, chainId, prefix] of [
    ["mainnet", 1, "ETH_RPC_MAINNET"],
    ["sepolia", 11155111, "ETH_RPC_SEPOLIA"],
  ] as const) {
    const rpcUrl =
      alchemyRpcUrl(env[`${prefix}_BASE_URL`], env.ALCHEMY_API_KEY) ??
      env[`${prefix}_URL`]?.trim();
    if (rpcUrl) networks.push({ name, chainId, rpcUrl });
  }
  return networks;
}

/**
 * Register did:ethr for the configured networks. Pass the core's options
 * directly (`{ networks: [...] }`, optionally with pre-built ethers providers)
 * or the output of `networksFromEnv()`.
 */
export function getResolver(options: EthrResolverOptions): ResolverRegistry {
  // The core types its registry against its own did-resolver major; the two
  // registry shapes are structurally identical at runtime.
  return coreGetResolver(options) as unknown as ResolverRegistry;
}
