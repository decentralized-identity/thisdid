import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/hedera-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:hedera through the vendored `@thisdid/hedera-did-resolver` — HCS
 * topic events read from Hedera's PUBLIC mirror nodes (keyless, no
 * secrets), every message Ed25519-verified against the DID root key.
 * Mirror URLs may be overridden via vars if ever needed.
 */

interface HederaEnv {
  HEDERA_MIRROR_MAINNET_URL?: string;
  HEDERA_MIRROR_TESTNET_URL?: string;
}

export default createDriverWorker<HederaEnv>({
  method: "hedera",
  packageName: "@thisdid/hedera-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      mirrorUrls: {
        ...(env.HEDERA_MIRROR_MAINNET_URL
          ? { mainnet: env.HEDERA_MIRROR_MAINNET_URL }
          : {}),
        ...(env.HEDERA_MIRROR_TESTNET_URL
          ? { testnet: env.HEDERA_MIRROR_TESTNET_URL }
          : {}),
      },
    }) as unknown as ResolverRegistry,
});
