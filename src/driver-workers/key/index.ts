import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "key-did-resolver";
import { createDriverWorker } from "../runtime";

export default createDriverWorker({
  method: "key",
  packageName: "key-did-resolver",
  packageVersion: "4.0.0",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
