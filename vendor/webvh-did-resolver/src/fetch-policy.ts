/**
 * Fetch boundaries for every retrieval a did:webvh resolution performs — the
 * DID log and the witness file.
 *
 * didwebvh-ts retrieves both through the `fetch` it is given (its `fetch`
 * resolution option) and reads each body whole. With the platform fetch that
 * means no timeout, no size limit, implicit redirects and no destination
 * policy, which the method's "Resolver Transport Hardening" section requires.
 * `boundedFetch()` wraps a fetch so that all four are enforced, every default
 * failing closed:
 *
 *   - https only (http:// only with `allowPrivateHosts`),
 *   - the literal host of every URL and redirect target must be a globally
 *     routable unicast host (address-policy.ts),
 *   - redirects are followed manually, each hop re-validated, up to a limit,
 *   - one wall-clock timeout covers the whole retrieval, body included,
 *   - the body is streamed and cut off at a byte limit.
 *
 * The destination check here sees literal names only. What a name resolves to
 * is decided at the connection, by whoever the resolver's `destinationGuard`
 * names (see destination-guard.ts); every hop goes through both layers.
 */
import { isPrivateHost } from "./address-policy.js";

export interface FetchPolicy {
  /** Wall-clock bound for one retrieval, redirects and body included. Default 8000 ms. */
  timeoutMs?: number;
  /** Largest body accepted for a DID log or witness file. Default 4 MiB. */
  maxResponseBytes?: number;
  /** Redirect hops followed, each re-validated. Default 3; 0 disables. */
  maxRedirects?: number;
  /** Permit http:// and loopback / private / link-local hosts (local development only). Default false. */
  allowPrivateHosts?: boolean;
  /** Fetch implementation underneath the bounds. Defaults to the global fetch. */
  fetch?: typeof fetch;
}

/** The fetch shape didwebvh-ts accepts through its `fetch` option. */
export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

type SettledPolicy = Required<Omit<FetchPolicy, "fetch">> & {
  fetch?: typeof fetch;
};

export const FETCH_POLICY_DEFAULTS: Readonly<
  Required<Omit<FetchPolicy, "fetch">>
> = {
  timeoutMs: 8000,
  maxResponseBytes: 4 * 1024 * 1024,
  maxRedirects: 3,
  allowPrivateHosts: false,
};

/** Thrown when the policy refuses a destination or a bound is exceeded. */
export class FetchPolicyError extends Error {}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

export function settleFetchPolicy(policy: FetchPolicy = {}): SettledPolicy {
  return {
    timeoutMs: positive(policy.timeoutMs, FETCH_POLICY_DEFAULTS.timeoutMs),
    maxResponseBytes: positive(
      policy.maxResponseBytes,
      FETCH_POLICY_DEFAULTS.maxResponseBytes,
    ),
    maxRedirects: nonNegative(
      policy.maxRedirects,
      FETCH_POLICY_DEFAULTS.maxRedirects,
    ),
    allowPrivateHosts:
      policy.allowPrivateHosts ?? FETCH_POLICY_DEFAULTS.allowPrivateHosts,
    fetch: policy.fetch,
  };
}

function checkDestination(url: URL, allowPrivateHosts: boolean): void {
  if (
    url.protocol !== "https:" &&
    !(allowPrivateHosts && url.protocol === "http:")
  ) {
    throw new FetchPolicyError(
      `blocked by fetch policy: ${url.protocol} is not https:`,
    );
  }
  if (!allowPrivateHosts && isPrivateHost(url.hostname)) {
    throw new FetchPolicyError(
      `blocked by fetch policy: ${url.hostname} is not a globally routable unicast host`,
    );
  }
}

/**
 * undici reports connect-time refusals (for instance the Node guard's) as
 * "fetch failed" with the reason in `cause`; keep that reason visible.
 */
function withCause(error: unknown): unknown {
  if (!(error instanceof Error) || error.message !== "fetch failed")
    return error;
  const cause = (error as { cause?: unknown }).cause;
  if (!(cause instanceof Error)) return error;
  const wrapped = new Error(`fetch failed: ${cause.message}`);
  (wrapped as { cause?: unknown }).cause = cause;
  return wrapped;
}

/** Re-wrap `response` so its body is streamed through the byte limit and the timeout. */
function boundedResponse(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  timedOut: () => Error,
  done: () => void,
): Response {
  const tooLarge = () =>
    new FetchPolicyError(`response exceeds ${maxBytes} bytes`);
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!response.body || NULL_BODY_STATUSES.has(response.status)) {
    done();
    return response;
  }
  const reader = response.body.getReader();
  let total = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch (error) {
        done();
        controller.error(signal.aborted ? timedOut() : error);
        return;
      }
      if (chunk.done) {
        done();
        controller.close();
        return;
      }
      total += chunk.value.byteLength;
      if (total > maxBytes) {
        done();
        await reader.cancel().catch(() => undefined);
        controller.error(tooLarge());
        return;
      }
      controller.enqueue(chunk.value);
    },
    cancel(reason) {
      done();
      return reader.cancel(reason);
    },
  });
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

/**
 * A fetch that enforces `policy` on every call. The underlying fetch is the
 * policy's, or the global fetch looked up at call time.
 */
export function boundedFetch(policy: FetchPolicy = {}): FetchLike {
  const settled = settleFetchPolicy(policy);
  return async (input: string): Promise<Response> => {
    const doFetch = settled.fetch ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settled.timeoutMs);
    const done = () => clearTimeout(timer);
    const timedOut = () =>
      new FetchPolicyError(`fetch timed out after ${settled.timeoutMs} ms`);
    try {
      let target = new URL(input);
      for (let hop = 0; ; hop += 1) {
        checkDestination(target, settled.allowPrivateHosts);
        let response: Response;
        try {
          response = await doFetch(target.toString(), {
            redirect: "manual",
            signal: controller.signal,
          });
        } catch (error) {
          if (controller.signal.aborted) throw timedOut();
          throw withCause(error);
        }
        const location = response.headers.get("location");
        if (REDIRECT_STATUSES.has(response.status) && location) {
          if (hop >= settled.maxRedirects) {
            throw new FetchPolicyError(
              `blocked by fetch policy: more than ${settled.maxRedirects} redirects`,
            );
          }
          await response.body?.cancel().catch(() => undefined);
          target = new URL(location, target);
          continue;
        }
        return boundedResponse(
          response,
          settled.maxResponseBytes,
          controller.signal,
          timedOut,
          done,
        );
      }
    } catch (error) {
      done();
      throw error;
    }
  };
}
