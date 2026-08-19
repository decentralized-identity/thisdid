import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/plc-did-resolver";
import { createDriverWorker } from "../runtime";

/**
 * did:plc through the vendored `@thisdid/plc-did-resolver` wrapper — the DIF
 * registry contract plus a workerd-safe directory fetch over Bluesky's
 * `@atproto/identity`, which performs all resolution and validation.
 */

interface PlcEnv {
  /** PLC directory base. Defaults to the method's canonical public directory. */
  PLC_DIRECTORY_URL?: string;
}

export default createDriverWorker<PlcEnv>({
  method: "plc",
  packageName: "@thisdid/plc-did-resolver",
  packageVersion: "1.0.0",
  registry: (env) =>
    getResolver({
      ...(env.PLC_DIRECTORY_URL ? { directoryUrl: env.PLC_DIRECTORY_URL } : {}),
    }) as unknown as ResolverRegistry,
});
