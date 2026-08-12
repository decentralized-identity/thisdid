import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "pkh-did-resolver";
import { createDriverWorker } from "../runtime";

export default createDriverWorker({
  method: "pkh",
  packageName: "pkh-did-resolver",
  packageVersion: "2.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
