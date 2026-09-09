/**
 * Who enforces the destination policy at connection time.
 *
 * The core's policy checks the literal hostname of every URL and redirect
 * target before it is fetched. What that name resolves to is outside its
 * reach: a public name may resolve to a loopback, private, shared, link-local,
 * cloud-metadata or otherwise non-global address, and may do so only after
 * the check (DNS rebinding).
 * That gap is closed at the transport, and this module decides by whom:
 *
 *   "node"     — this package's connect-time guard (the `./node` entry): each
 *                hostname is resolved exactly once, any non-global answer refuses
 *                the connection, and the socket opens only to the validated
 *                addresses. Every redirect hop is a new guarded connection.
 *                Default on Node (the standalone CLI and Node embedders).
 *   "platform" — the runtime cannot open connections to private destinations
 *                at all (Cloudflare Workers). Default when running on Workers;
 *                the ThisDID driver Worker declares it explicitly.
 *   "caller"   — the fetch in use (supplied or global) enforces the policy at
 *                connection time, or runs behind a proxy that does; the caller
 *                takes responsibility. Required whenever a custom `fetch` is
 *                supplied, so a plain fetch can never bypass the guard quietly.
 *
 * Any other runtime (browsers, Bun, Deno, …) has to choose explicitly:
 * `getResolver()` throws rather than resolve with an unchecked transport.
 * With `allowPrivateHosts` there is no private-destination policy to enforce
 * and the choice is moot.
 */
export type DestinationGuard = "node" | "platform" | "caller";

export type Runtime = "workers" | "node" | "unknown";

export interface RuntimeGlobals {
  navigator?: { userAgent?: string };
  process?: { versions?: { node?: string } };
}

/**
 * Workers identify themselves through `navigator.userAgent`; Node through
 * `process.versions.node`. Checked in that order: Workers with Node
 * compatibility expose a `process` too.
 */
export function detectRuntime(
  globals: RuntimeGlobals = globalThis as RuntimeGlobals,
): Runtime {
  if (globals.navigator?.userAgent === "Cloudflare-Workers") return "workers";
  if (typeof globals.process?.versions?.node === "string") return "node";
  return "unknown";
}

/** A configuration that would leave the transport unchecked; thrown by getResolver(). */
export class DestinationGuardError extends Error {}

export interface DestinationGuardInput {
  destinationGuard?: DestinationGuard;
  fetch?: unknown;
  allowPrivateHosts?: boolean;
}

/** Decide the guard for one getResolver() call, or throw. */
export function settleDestinationGuard(
  options: DestinationGuardInput,
  runtime: Runtime = detectRuntime(),
): DestinationGuard {
  const chosen = options.destinationGuard;
  if (chosen === "node" && options.fetch !== undefined) {
    throw new DestinationGuardError(
      'destinationGuard "node" binds its own fetch; drop the fetch option or declare destinationGuard: "caller"',
    );
  }
  if (options.allowPrivateHosts === true) return chosen ?? "caller";
  if (chosen !== undefined) return chosen;
  if (options.fetch !== undefined) {
    throw new DestinationGuardError(
      'a custom fetch needs an explicit destinationGuard: "caller" when it enforces the destination policy at connection time, "platform" when the runtime does',
    );
  }
  if (runtime === "workers") return "platform";
  if (runtime === "node") return "node";
  throw new DestinationGuardError(
    'no connection-level destination guard is available in this runtime; declare destinationGuard: "caller" (with a fetch that enforces the policy) or "platform" (a runtime that cannot reach private destinations), or allowPrivateHosts: true for local development',
  );
}

/**
 * Load the Node guard on demand. The specifier is assembled at runtime so no
 * bundler follows it: the module imports node:dns and undici, which a Worker
 * bundle must never carry, and it is only ever loaded under "node".
 */
export function loadNodeGuard(): Promise<typeof import("./node-guard.js")> {
  const specifier = ["./node-guard", "js"].join(".");
  return import(specifier) as Promise<typeof import("./node-guard.js")>;
}
