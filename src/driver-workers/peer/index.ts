import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "peer-did-resolver";
import { createDriverWorker } from "../runtime";

export default createDriverWorker({
  method: "peer",
  packageName: "peer-did-resolver",
  packageVersion: "2.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
