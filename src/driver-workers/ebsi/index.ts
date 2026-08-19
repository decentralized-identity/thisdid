import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@cef-ebsi/ebsi-did-resolver";
import { createDriverWorker } from "../runtime";

interface EbsiEnv {
  /**
   * EBSI DID registry base (environment-specific: pilot / conformance /
   * production). Set in wrangler.jsonc; the driver fails closed without it so
   * an unconfigured deployment can never silently target the wrong registry.
   */
  EBSI_DID_REGISTRY?: string;
}

export default createDriverWorker<EbsiEnv>({
  method: "ebsi",
  packageName: "@cef-ebsi/ebsi-did-resolver",
  packageVersion: "4.1.0",
  registry: (env) => {
    if (!env.EBSI_DID_REGISTRY)
      throw new Error("ebsi driver is not configured");
    return getResolver({
      registry: env.EBSI_DID_REGISTRY,
    }) as unknown as ResolverRegistry;
  },
});
