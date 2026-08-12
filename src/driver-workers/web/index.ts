import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "web-did-resolver";
import { createDriverWorker } from "../runtime";

export default createDriverWorker({
  method: "web",
  packageName: "web-did-resolver",
  packageVersion: "2.0.32",
  registry: () => getResolver() as unknown as ResolverRegistry,
});
