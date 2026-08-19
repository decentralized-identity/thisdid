/**
 * Resolution orchestrator. Parses the DID, walks its routing chain (ThisDID
 * local + redundant upstreams in a method-specific order), and returns the first
 * successful result annotated with ThisDID route metadata for the UI banner.
 */
import { parse, type DIDResolutionResult } from "did-resolver";
import {
  chainFor,
  providerTag,
  stepRoute,
  upstreamSupports,
  type Step,
} from "./resolvers/registry";
import { resolveLocal } from "./resolvers/local";
import { fetchUpstream, type UpstreamFailure } from "./resolvers/upstream";
import { isSupportedMethod, networkFor, PROBATION_METHODS } from "./methods";
import {
  compareCores,
  isVerificationExempt,
  type ResolveHooks,
  type VerificationMeta,
} from "./resolvers/verify";
import { getHealth, type HealthSnapshot } from "./routing/health";
import type { Env, ThisDidResolution } from "./types";

export type { ResolveHooks } from "./resolvers/verify";

function errorResult(error: string): ThisDidResolution {
  return {
    didResolutionMetadata: { error },
    didDocument: null,
    didDocumentMetadata: {},
  };
}

/** The endpoint/base a step routes to (for the `via` metadata field). */
function upstreamBase(step: Step, env: Env): string {
  switch (step) {
    case "godiddy":
      return env.GODIDDY_RESOLVER;
    case "archon":
      return env.ARCHON_RESOLVER;
    case "goplausible":
      return env.GOPLAUSIBLE_RESOLVER;
    default:
      return "";
  }
}

function resolverLabel(step: Step, method: string): string {
  if (step === "local") return `ThisDID (${method} driver)`;
  if (step === "goplausible") return "GoPlausible universal-resolver";
  return `${step} universal-resolver`;
}

/** Run one chain step; null means "failed, try the next step". Never throws. */
type Attempt = {
  step: Step;
  result?: DIDResolutionResult;
  failure?: UpstreamFailure;
};

async function runStep(
  step: Step,
  did: string,
  env: Env,
  signal: AbortSignal,
): Promise<Attempt> {
  try {
    if (step === "local") {
      const r = await resolveLocal(did, env, signal);
      return r.didDocument && !r.didResolutionMetadata.error
        ? { step, result: r }
        : {
            step,
            failure: {
              error: r.didResolutionMetadata.error ?? "notFound",
              metadata: r.didResolutionMetadata,
              documentMetadata: r.didDocumentMetadata,
            },
          };
    }
    // godiddy / archon / goplausible are all DIF Universal Resolver GET endpoints.
    const token = step === "godiddy" ? env.GODIDDY_API_KEY : undefined;
    const upstream = await fetchUpstream(
      did,
      upstreamBase(step, env),
      token,
      signal,
    );
    return upstream.ok
      ? { step, result: upstream.result }
      : { step, failure: upstream.failure };
  } catch {
    return { step, failure: { error: "internalError" } };
  }
}

/** Bound a step's wall-clock so a hung driver fails over instead of stalling. */
const STEP_TIMEOUT_MS = 8000;
async function withTimeout(
  step: Step,
  run: (signal: AbortSignal) => Promise<Attempt>,
): Promise<Attempt> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(controller.signal),
      new Promise<Attempt>((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve({ step, failure: { error: "timeout" } });
        }, STEP_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Move routes tripped `down` to the end, preserving baseline preference and failing open. */
export function planChain(
  baseline: Step[],
  health: HealthSnapshot | null,
  method?: string,
): Step[] {
  if (!health) return [...baseline];
  const key = (step: Step) =>
    step === "local" && method ? `local:${method}` : step;
  return [
    ...baseline.filter((s) => health.providers[key(s)]?.status !== "down"),
    ...baseline.filter((s) => health.providers[key(s)]?.status === "down"),
  ];
}

/** Case/underscore-tolerant normalization for upstream error codes (godiddy
 * emits `INTERNAL_ERROR` / `METHOD_NOT_SUPPORTED`; DIF style is camelCase). */
const normalizeCode = (error: string): string =>
  error.replace(/[_\s-]/g, "").toLowerCase();

/** Failure codes that mean "transport problem", not "the DID does not resolve".
 * `rateLimited` (upstream HTTP 429) belongs here: the provider is alive and
 * merely throttling our quota, so it must never masquerade as a resolution
 * verdict. */
const TRANSPORT_CODES = new Set(
  [
    "networkError",
    "timeout",
    "internalError",
    "notConfigured",
    "invalidResponse",
    "upstreamError",
    "rateLimited",
  ].map(normalizeCode),
);

/** The provider cannot serve this method at all — no opinion about the DID. */
const UNSUPPORTED_CODES = new Set(
  [
    "methodNotSupported",
    "unsupportedDidMethod",
    "representationNotSupported",
  ].map(normalizeCode),
);

const isTransport = (error: string): boolean =>
  TRANSPORT_CODES.has(normalizeCode(error));
const isUnsupported = (error: string): boolean =>
  UNSUPPORTED_CODES.has(normalizeCode(error));

interface ResolveContext {
  method: string;
  chainLabel: string;
  started: number;
  attempts: Attempt[];
  env: Env;
}

/** Stamp the winning attempt with ThisDID route metadata. */
function finalize(
  attempt: Attempt,
  ctx: ResolveContext,
  verification?: VerificationMeta,
): ThisDidResolution {
  const result = attempt.result as ThisDidResolution;
  result.didResolutionMetadata = {
    contentType: "application/did+ld+json",
    ...result.didResolutionMetadata,
    route: stepRoute(attempt.step),
    provider: providerTag(attempt.step),
    resolver: resolverLabel(attempt.step, ctx.method),
    network: networkFor(ctx.method),
    durationMs: Math.max(1, Date.now() - ctx.started),
    chain: ctx.chainLabel,
    attempted: ctx.attempts.map((a) => a.step),
    ...(attempt.step === "local"
      ? {}
      : { via: upstreamBase(attempt.step, ctx.env) }),
    ...(verification ? { verification } : {}),
  };
  return result;
}

/** Aggregate a fully failed chain into one DIF error result. */
function finalizeFailure(
  ctx: ResolveContext,
  verification?: VerificationMeta,
): ThisDidResolution {
  const failures = ctx.attempts.flatMap((a) => (a.failure ? [a.failure] : []));
  // Prefer a semantic failure (notFound, deactivated, …); when the only
  // non-transport answers are "method not supported", surface that instead of
  // defaulting to notFound. When throttling is the WHOLE story (every attempt
  // came back rate-limited), say so — "notFound" would falsely claim the DID
  // does not exist when no provider was allowed to answer.
  const meaningful =
    failures.find((f) => !isTransport(f.error) && !isUnsupported(f.error)) ??
    failures.find((f) => isUnsupported(f.error));
  const allRateLimited =
    failures.length > 0 && failures.every((f) => f.error === "rateLimited");
  const fail = errorResult(
    meaningful?.error ?? (allRateLimited ? "rateLimited" : "notFound"),
  );
  fail.didResolutionMetadata = {
    ...(meaningful?.metadata ?? {}),
    ...fail.didResolutionMetadata,
    network: networkFor(ctx.method),
    durationMs: Math.max(1, Date.now() - ctx.started),
    chain: ctx.chainLabel,
    attempted: ctx.attempts.map((a) => a.step),
    attempts: ctx.attempts.map((a) => ({
      step: a.step,
      error: a.failure?.error ?? "unknown",
      ...(a.failure?.status ? { status: a.failure.status } : {}),
      // Our own drivers' diagnostic messages are safe to surface and make the
      // public API self-diagnosing for local-step failures.
      ...(a.step === "local" && typeof a.failure?.metadata?.message === "string"
        ? { message: a.failure.metadata.message.slice(0, 160) }
        : {}),
    })),
    ...(verification ? { verification } : {}),
  };
  fail.didDocumentMetadata = meaningful?.documentMetadata ?? {};
  return fail;
}

/**
 * Probation path: run the local driver and one redundant upstream in parallel
 * and compare security cores. Match → local result, badged. Core mismatch
 * (both sides resolved, documents disagree) → the upstream's answer is served
 * conservatively and the disagreement is logged with both documents. Any
 * upstream failure — transport, unsupported method, or a failed resolution —
 * means the verifier has no opinion: the local result is served unbadged
 * (`unverified`, reason recorded). The guarantee never becomes a new point of
 * failure and never counts an unanswerable upstream as a disagreement.
 */
async function resolveWithVerification(
  did: string,
  verifyStep: Step,
  ctx: ResolveContext,
  chain: Step[],
  hooks?: ResolveHooks,
): Promise<ThisDidResolution> {
  const provider = providerTag(verifyStep);
  const [local, upstream] = await Promise.all([
    withTimeout("local", (signal) => runStep("local", did, ctx.env, signal)),
    withTimeout(verifyStep, (signal) =>
      runStep(verifyStep, did, ctx.env, signal),
    ),
  ]);
  ctx.attempts.push(local, upstream);

  if (local.result && upstream.result) {
    if (compareCores(local.result, upstream.result) === "match") {
      return finalize(local, ctx, { status: "match", provider });
    }
    hooks?.onMismatch?.({
      did,
      method: ctx.method,
      provider,
      reason: "coreMismatch",
      localDocument: local.result.didDocument,
      upstreamDocument: upstream.result.didDocument,
    });
    return finalize(upstream, ctx, {
      status: "mismatch",
      provider,
      reason: "coreMismatch",
    });
  }

  if (local.result && upstream.failure) {
    // A verifier that cannot answer — transport failure, throttled quota,
    // unsupported method, or a failed resolution (notFound, deactivated, …) —
    // has no opinion to disagree with. Only two resolved-but-differing
    // documents count as a mismatch; everything else is UNVERIFIED, with the
    // reason recorded (rate limiting gets its own reason so quota exhaustion
    // is distinguishable from an outage in the verification metadata).
    const reason =
      upstream.failure.error === "rateLimited"
        ? "upstreamRateLimited"
        : isTransport(upstream.failure.error)
          ? "upstreamUnavailable"
          : isUnsupported(upstream.failure.error)
            ? "upstreamUnsupported"
            : `upstream:${upstream.failure.error}`;
    return finalize(local, ctx, { status: "unverified", provider, reason });
  }

  if (upstream.result) {
    // Local failed — the verifier's answer doubles as the normal fallback.
    return finalize(upstream, ctx);
  }

  // Both failed: continue down the remaining chain, then aggregate.
  for (const step of chain) {
    if (step === "local" || step === verifyStep) continue;
    const attempt = await withTimeout(step, (signal) =>
      runStep(step, did, ctx.env, signal),
    );
    ctx.attempts.push(attempt);
    if (attempt.result) return finalize(attempt, ctx);
  }
  return finalizeFailure(ctx);
}

export async function resolveDid(
  did: string,
  env: Env,
  hooks?: ResolveHooks,
): Promise<ThisDidResolution> {
  const trimmed = (did || "").trim();
  const parsed = parse(trimmed);
  if (!parsed) return errorResult("invalidDid");

  const method = parsed.method;
  if (!isSupportedMethod(method)) return errorResult("unsupportedDidMethod");
  const health = await getHealth(env);
  const chain = planChain(chainFor(method), health, method);
  const chainLabel = chain.join("→");
  const ctx: ResolveContext = {
    method,
    chainLabel,
    started: Date.now(),
    attempts: [],
    env,
  };

  // Probation double-check: only when the local driver is the planned first
  // step and an upstream CAPABLE of the method is healthy enough to verify.
  // A verifier that cannot speak the method, or is tripped `down`, is never
  // consulted — the edge result is served immediately, stamped unverified.
  let skippedVerification: VerificationMeta | undefined;
  if (
    PROBATION_METHODS.has(method) &&
    chain[0] === "local" &&
    !isVerificationExempt(method, trimmed)
  ) {
    const healthyCapable = chain.find(
      (s) =>
        upstreamSupports(s, method) && health?.providers[s]?.status !== "down",
    );
    if (healthyCapable) {
      return resolveWithVerification(
        trimmed,
        healthyCapable,
        ctx,
        chain,
        hooks,
      );
    }
    const anyCapable = chain.find((s) => upstreamSupports(s, method));
    skippedVerification = anyCapable
      ? {
          status: "unverified",
          provider: providerTag(anyCapable),
          reason: "upstreamUnavailable",
        }
      : { status: "unverified", reason: "upstreamUnsupported" };
  }

  for (const step of chain) {
    const attempt = await withTimeout(step, (signal) =>
      runStep(step, trimmed, env, signal),
    );
    ctx.attempts.push(attempt);
    if (attempt.result) {
      return finalize(
        attempt,
        ctx,
        attempt.step === "local" ? skippedVerification : undefined,
      );
    }
  }
  return finalizeFailure(ctx);
}
