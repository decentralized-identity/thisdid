/**
 * The WEBVH_* host configuration, read the same way by the standalone CLI
 * (process.env) and the ThisDID driver Worker (its wrangler `vars`).
 *
 * Every variable is optional: an unset or empty one takes its default from
 * FETCH_POLICY_DEFAULTS, the single source the fetch policy itself falls back
 * to. A malformed value throws `EnvConfigError` instead of being replaced, so a
 * misconfiguration fails closed (CLI: exit 2; Worker: internalError).
 */
import { FETCH_POLICY_DEFAULTS, type FetchPolicy } from "./fetch-policy.js";

/**
 * Environment values as a host hands them over: strings from process.env or
 * `.dev.vars`, possibly numbers or booleans from wrangler `vars`.
 */
export type EnvVars = Readonly<
  Record<string, string | number | boolean | undefined>
>;

/** The variables this package reads, in documentation order. */
export const WEBVH_ENV_VARIABLES = [
  "WEBVH_TIMEOUT_MS",
  "WEBVH_MAX_RESPONSE_BYTES",
  "WEBVH_MAX_REDIRECTS",
  "WEBVH_ALLOW_PRIVATE_HOSTS",
] as const;

/** Thrown for a malformed environment value. */
export class EnvConfigError extends Error {}

function rawValue(env: EnvVars, name: string): string | undefined {
  const value = env[name];
  if (value === undefined) return undefined;
  const text = String(value).trim();
  return text === "" ? undefined : text;
}

/** An optional non-negative integer variable. */
export function envInteger(env: EnvVars, name: string): number | undefined {
  const raw = rawValue(env, name);
  if (raw === undefined) return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new EnvConfigError(
      `${name} must be a non-negative integer, got "${String(env[name])}"`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new EnvConfigError(`${name} exceeds the maximum safe integer`);
  }
  return value;
}

/** An optional positive integer variable (zero is refused, not replaced). */
export function envPositiveInteger(
  env: EnvVars,
  name: string,
): number | undefined {
  const value = envInteger(env, name);
  if (value === 0) {
    throw new EnvConfigError(`${name} must be a positive integer, got "0"`);
  }
  return value;
}

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

/** An optional boolean variable; anything but a clear yes/no is an error. */
export function envFlag(env: EnvVars, name: string): boolean | undefined {
  const raw = rawValue(env, name)?.toLowerCase();
  if (raw === undefined) return undefined;
  if (TRUE.has(raw)) return true;
  if (FALSE.has(raw)) return false;
  throw new EnvConfigError(
    `${name} must be 1/0 (true/false), got "${String(env[name])}"`,
  );
}

/**
 * Map the WEBVH_* variables onto `getResolver()` options. Every field is set:
 * an unset or empty variable takes its default from FETCH_POLICY_DEFAULTS.
 */
export function optionsFromEnv(env: EnvVars): { fetchPolicy: FetchPolicy } {
  return {
    fetchPolicy: {
      timeoutMs:
        envPositiveInteger(env, "WEBVH_TIMEOUT_MS") ??
        FETCH_POLICY_DEFAULTS.timeoutMs,
      maxResponseBytes:
        envPositiveInteger(env, "WEBVH_MAX_RESPONSE_BYTES") ??
        FETCH_POLICY_DEFAULTS.maxResponseBytes,
      maxRedirects:
        envInteger(env, "WEBVH_MAX_REDIRECTS") ??
        FETCH_POLICY_DEFAULTS.maxRedirects,
      allowPrivateHosts:
        envFlag(env, "WEBVH_ALLOW_PRIVATE_HOSTS") ??
        FETCH_POLICY_DEFAULTS.allowPrivateHosts,
    },
  };
}
