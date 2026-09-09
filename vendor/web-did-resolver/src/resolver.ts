/**
 * @thisdid/web-did-resolver — DIF `did-resolver` driver for did:web.
 *
 * The method implementation is the DIF `web-did-resolver` core, consumed from
 * the ThisDID-custodied fork (`vendor/forks/web-did-resolver`, pinned to the
 * 2.0.32 release) rather than the npm registry, so every line that resolves a
 * did:web here can be read, audited and patched in this repository. The fork
 * adds fetch boundaries the upstream lacks — a wall-clock timeout, a bounded
 * body, manual redirect handling and a private-host policy — exposed here as
 * options and on the CLI as WEB_* variables. This package adds the
 * connection-level half of the destination policy (see destination-guard.ts)
 * and is the single import the ThisDID Worker and the CLI share.
 */
import { getResolver as coreGetResolver } from "web-did-resolver";
import type { WebResolverOptions as CoreOptions } from "web-did-resolver";
import type {
  DIDResolutionResult,
  DIDResolver,
  ResolverRegistry,
} from "did-resolver";
import {
  loadNodeGuard,
  settleDestinationGuard,
  type DestinationGuard,
} from "./destination-guard.js";

export {
  DestinationGuardError,
  detectRuntime,
  settleDestinationGuard,
  type DestinationGuard,
  type Runtime,
} from "./destination-guard.js";

export interface WebResolverOptions extends CoreOptions {
  /**
   * Who checks the addresses a hostname resolves to (the core checks literal
   * names only): "node" binds this package's connect-time guard (default on
   * Node), "platform" trusts a runtime that cannot reach private destinations
   * (default on Cloudflare Workers), "caller" trusts the fetch in use
   * (required with a custom `fetch`). Elsewhere it must be declared.
   */
  destinationGuard?: DestinationGuard;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Register did:web; every option defaults to the fail-closed value. Throws
 * `DestinationGuardError` for a configuration that would leave the transport
 * unchecked (see destination-guard.ts).
 */
export function getResolver(
  options: WebResolverOptions = {},
): ResolverRegistry {
  const guard = settleDestinationGuard(options);
  const coreOptions: CoreOptions = { ...options };
  delete (coreOptions as { destinationGuard?: unknown }).destinationGuard;
  if (guard !== "node") return coreGetResolver(coreOptions) as ResolverRegistry;

  // Node: bind the connect-time guard, loaded on first use so the module that
  // imports node:dns and undici never reaches a Worker bundle.
  let core: Promise<DIDResolver> | undefined;
  const load = (): Promise<DIDResolver> =>
    (core ??= loadNodeGuard().then(
      (node) =>
        coreGetResolver({
          ...coreOptions,
          fetch: node.guardedFetch({
            allowPrivateHosts: coreOptions.allowPrivateHosts,
          }),
        }).web as DIDResolver,
    ));
  const web: DIDResolver = async (did, parsed, resolver, resolutionOptions) => {
    let inner: DIDResolver;
    try {
      inner = await load();
    } catch (error) {
      const failure: DIDResolutionResult = {
        didResolutionMetadata: {
          error: "internalError",
          message: `connect-time destination guard unavailable: ${describe(error)}`,
        },
        didDocument: null,
        didDocumentMetadata: {},
      };
      return failure;
    }
    return inner(did, parsed, resolver, resolutionOptions);
  };
  return { web };
}
