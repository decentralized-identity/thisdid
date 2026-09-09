/**
 * Connect-time destination guard for Node hosts (the standalone CLI and any
 * Node process embedding this package). Node only: it imports node:dns and
 * undici, so it is exported from the package's `./node` entry, never from the
 * main entry the Worker bundles.
 *
 * The isomorphic policy in the core checks the literal hostname of every URL
 * and redirect target; it cannot see what that name resolves to. This guard
 * closes the gap: an undici Agent resolves each hostname exactly once at
 * connect time, refuses the connection unless every returned address is a
 * globally routable unicast address (the core's positive classification:
 * IANA special-purpose, transition, multicast and reserved ranges are all
 * refused), and otherwise connects to precisely the addresses it validated —
 * so a name that flips between validation and connection (DNS rebinding)
 * cannot reach an internal destination, and TLS still verifies the
 * certificate against the hostname.
 * Cloudflare Workers enforce the same rule at the platform level, which is why
 * the deployed driver does not need this.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { Agent, fetch as undiciFetch } from "undici";
import { isPrivateHost } from "web-did-resolver";

export interface ResolvedAddress {
  address: string;
  family: number;
}

export interface NodeGuardOptions {
  /** Permit non-global destinations (local development only). Default false. */
  allowPrivateHosts?: boolean;
  /** Resolver used at connect time; defaults to dns.lookup with all addresses. */
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
}

type LookupCallback = (
  error: Error | null,
  address: string | ResolvedAddress[],
  family?: number,
) => void;

/** Node's lookup callback carries no address on error. */
function fail(callback: LookupCallback, error: Error): void {
  (callback as (error: Error) => void)(error);
}

const defaultResolve = async (hostname: string): Promise<ResolvedAddress[]> => {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((a) => ({ address: a.address, family: a.family }));
};

/**
 * A `lookup` function in the shape Node's net/tls connect accepts. Every
 * address the resolver returns is validated; one non-global answer refuses the
 * whole connection (an attacker who mixes a public and a private record must
 * not get a second chance through address selection).
 */
export function guardLookup(options: NodeGuardOptions = {}) {
  const resolve = options.resolve ?? defaultResolve;
  const allowPrivateHosts = options.allowPrivateHosts ?? false;
  return (
    hostname: string,
    lookupOptions: { all?: boolean } | number | undefined,
    callback: LookupCallback,
  ): void => {
    resolve(hostname).then(
      (answers) => {
        if (answers.length === 0) {
          fail(
            callback,
            new Error(`blocked by fetch policy: ${hostname} did not resolve`),
          );
          return;
        }
        if (!allowPrivateHosts) {
          const bad = answers.find((a) => isPrivateHost(a.address));
          if (bad) {
            fail(
              callback,
              new Error(
                `blocked by fetch policy: ${hostname} resolves to non-global address ${bad.address}`,
              ),
            );
            return;
          }
        }
        const all =
          typeof lookupOptions === "object" && lookupOptions?.all === true;
        if (all) callback(null, answers);
        else callback(null, answers[0].address, answers[0].family);
      },
      (error: unknown) => {
        fail(
          callback,
          error instanceof Error ? error : new Error(String(error)),
        );
      },
    );
  };
}

/**
 * A `fetch` bound to a guarded undici Agent. Pass it to the core through its
 * fetch option (the ThisDID CLI does so automatically).
 */
export function guardedFetch(options: NodeGuardOptions = {}): typeof fetch {
  const agent = new Agent({ connect: { lookup: guardLookup(options) } });
  const guarded = (input: RequestInfo | URL, init?: RequestInit) =>
    undiciFetch(
      input as never,
      { ...(init as object), dispatcher: agent } as never,
    );
  return guarded as unknown as typeof fetch;
}
