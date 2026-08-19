/**
 * @thisdid/ens-did-resolver — DIF `did-resolver` driver for did:ens.
 *
 * A clean-room implementation over **ethers v6**'s native ENS support,
 * producing the same DID document shape as veramolabs' `ens-did-resolver`
 * (the ecosystem reference, which Universal Resolver deployments run): the
 * ENS name's address record becomes an `EcdsaSecp256k1RecoveryMethod2020`
 * verification method with the legacy `<address>@eip155:<chainId>` account
 * identifier, plus a `Web3PublicProfile` service.
 *
 * Why not wrap the reference package: its ethers **v5** tree carries
 * `elliptic@6.6.1` (unpatched CVE-2025-14505) and a CVE-flagged `ws` —
 * ethers v6 uses `@noble/curves` and is already part of ThisDID's vetted
 * dependency set. Retired in favor of upstream if it migrates to ethers v6.
 */
import { JsonRpcProvider } from "ethers";
import type { DIDResolutionResult, ResolverRegistry } from "did-resolver";

export interface EnsNetworkConfig {
  /** Network name, e.g. `mainnet`. An empty network segment maps to `mainnet`. */
  name: string;
  /** Full JSON-RPC endpoint URL (credentials included where required). */
  rpcUrl: string;
  /** EVM chain id. Defaults to 1 for `mainnet`. */
  chainId?: number;
}

export interface EnsResolverOptions {
  /** At least one configured Ethereum network. */
  networks: EnsNetworkConfig[];
  /** Per-resolution wall-clock bound. Default 6000 ms. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 6000;
/** ENS names: dot-separated labels, at least one dot (e.g. `vitalik.eth`). */
const ENS_NAME_RE = /^[^\s.]+(\.[^\s.]+)+$/;

function errorResult(error: string, message?: string): DIDResolutionResult {
  return {
    didResolutionMetadata: { error, ...(message ? { message } : {}) },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

export function getResolver(options: EnsResolverOptions): ResolverRegistry {
  if (!options?.networks?.length) {
    throw new Error("ens resolver requires at least one configured network");
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const networks = new Map<string, Required<EnsNetworkConfig>>();
  for (const network of options.networks) {
    const chainId =
      network.chainId ?? (network.name === "mainnet" ? 1 : undefined);
    if (chainId === undefined) {
      throw new Error(`ens network ${network.name} requires a chainId`);
    }
    networks.set(network.name, { ...network, chainId });
  }

  const ens = async (did: string): Promise<DIDResolutionResult> => {
    try {
      // did:ens:<name> or did:ens:<network>:<name>
      const segments = did.split(":");
      if (segments.length !== 3 && segments.length !== 4) {
        return errorResult("invalidDid");
      }
      const ensName = segments[segments.length - 1];
      const networkName = segments.length === 4 ? segments[2] : "mainnet";
      if (!ENS_NAME_RE.test(ensName) || ensName.length > 253) {
        return errorResult("invalidDid");
      }
      const network = networks.get(networkName);
      if (!network) {
        return errorResult(
          "notConfigured",
          `no configured provider for the ${networkName} network`,
        );
      }

      // ethers providers retain request state; construct per resolution (the
      // Worker runtime also disables resolver caching for this driver).
      const provider = new JsonRpcProvider(network.rpcUrl, network.chainId);
      try {
        const work = (async () => {
          const ensResolver = await provider.getResolver(ensName);
          if (!ensResolver) return errorResult("notFound");
          const address = await ensResolver.getAddress();
          if (!address) return errorResult("notFound");

          // Shape-compatible with the ecosystem reference driver, including
          // its legacy `<address>@eip155:<chainId>` account identifier.
          const blockchainAccountId = `${address}@eip155:${network.chainId}`;
          const keyId = `${did}#${address}`;
          return {
            didResolutionMetadata: {
              contentType: "application/did+ld+json",
            },
            didDocument: {
              "@context": "https://www.w3.org/ns/did/v1",
              id: did,
              verificationMethod: [
                {
                  id: keyId,
                  type: "EcdsaSecp256k1RecoveryMethod2020",
                  controller: did,
                  blockchainAccountId,
                },
              ],
              service: [
                {
                  id: `${did}#Web3PublicProfile-${address}`,
                  type: "Web3PublicProfile",
                  serviceEndpoint: ensName,
                },
              ],
              authentication: [keyId],
              assertionMethod: [keyId],
              capabilityInvocation: [keyId],
              capabilityDelegation: [keyId],
            },
            didDocumentMetadata: {},
          } satisfies DIDResolutionResult;
        })();
        const timeout = new Promise<DIDResolutionResult>((resolve) => {
          setTimeout(() => resolve(errorResult("timeout")), timeoutMs);
        });
        return await Promise.race([work, timeout]);
      } finally {
        provider.destroy();
      }
    } catch (cause) {
      return errorResult(
        "networkError",
        cause instanceof Error ? cause.message.slice(0, 200) : undefined,
      );
    }
  };

  return { ens } as ResolverRegistry;
}
