/**
 * Command-line resolution for @thisdid/web-did-resolver.
 *
 * `thisdid-resolve-web <did>` resolves one did:web identifier with this
 * package alone — no resolver service, no Worker — and prints the DIF
 * resolution result as JSON on stdout.
 * Configuration comes from environment variables, so a `.dev.vars` file or a
 * production secret set drives the CLI unchanged.
 * Exit status: 0 resolved, 1 the resolver reported an error
 * (`didResolutionMetadata.error` is set), 2 usage or configuration error.
 *
 * `main()` is pure over its inputs (argv, env, an output sink) so it is unit
 * tested directly; `bin.ts` is the thin executable that binds it to the
 * process.
 */
import { Resolver, type DIDResolutionOptions } from "did-resolver";
import {
  DestinationGuardError,
  getResolver,
  type WebResolverOptions,
} from "./resolver.js";

export const COMMAND = "thisdid-resolve-web";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:web identifier with @thisdid/web-did-resolver and print the DIF
resolution result as JSON on stdout. The DID names the HTTPS origin its document is fetched from; the fetch
boundaries below all default to fail-closed values.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

The connection is checked as well as the name: each hostname is resolved once,
any private answer is refused, and the socket opens only to validated addresses.

Environment (all optional):
  WEB_TIMEOUT_MS            integer — wall-clock bound per resolution (default 6000)
  WEB_MAX_RESPONSE_BYTES    integer — largest DID document accepted (default 1048576)
  WEB_MAX_REDIRECTS         integer — https redirect hops followed, each re-validated (default 3)
  WEB_ALLOW_PRIVATE_HOSTS   "1" — permit loopback / private / link-local hosts (development only)

Exit status: 0 resolved, 1 resolution error, 2 usage or configuration error.
`;

export type CliEnv = Readonly<Record<string, string | undefined>>;

export interface CliIo {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface ParsedArgs {
  did?: string;
  resolutionOptions: DIDResolutionOptions;
  compact: boolean;
  help: boolean;
  error?: string;
}

/** Thrown for a malformed environment value; reported as exit status 2. */
export class CliConfigError extends Error {}

/** An optional non-negative integer variable. */
export function envInteger(env: CliEnv, name: string): number | undefined {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return undefined;
  if (!/^\d+$/.test(raw)) {
    throw new CliConfigError(
      `${name} must be a non-negative integer, got "${env[name]}"`,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new CliConfigError(`${name} exceeds the maximum safe integer`);
  }
  return value;
}

const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);

/** An optional boolean variable; anything but a clear yes/no is an error. */
export function envFlag(env: CliEnv, name: string): boolean | undefined {
  const raw = env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return undefined;
  if (TRUE.has(raw)) return true;
  if (FALSE.has(raw)) return false;
  throw new CliConfigError(
    `${name} must be 1/0 (true/false), got "${env[name]}"`,
  );
}

/** Map the documented environment variables onto `getResolver()` options. */
export function optionsFromEnv(env: CliEnv): WebResolverOptions {
  const options: WebResolverOptions = {};
  const timeoutMs = envInteger(env, "WEB_TIMEOUT_MS");
  if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
  const maxResponseBytes = envInteger(env, "WEB_MAX_RESPONSE_BYTES");
  if (maxResponseBytes !== undefined)
    options.maxResponseBytes = maxResponseBytes;
  const maxRedirects = envInteger(env, "WEB_MAX_REDIRECTS");
  if (maxRedirects !== undefined) options.maxRedirects = maxRedirects;
  const allowPrivateHosts = envFlag(env, "WEB_ALLOW_PRIVATE_HOSTS");
  if (allowPrivateHosts !== undefined)
    options.allowPrivateHosts = allowPrivateHosts;
  return options;
}

/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    resolutionOptions: {},
    compact: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      return parsed;
    }
    if (arg === "--compact") {
      parsed.compact = true;
      continue;
    }
    if (arg === "--version-id" || arg === "--version-time") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("-")) {
        return { ...parsed, error: `${arg} requires a value` };
      }
      if (arg === "--version-id") parsed.resolutionOptions.versionId = value;
      else parsed.resolutionOptions.versionTime = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return { ...parsed, error: `unknown option ${arg}` };
    }
    if (parsed.did !== undefined) {
      return { ...parsed, error: `unexpected argument ${arg}` };
    }
    parsed.did = arg;
  }
  if (parsed.did === undefined) return { ...parsed, error: "missing <did>" };
  return parsed;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Run the CLI; returns the process exit status. Never throws. */
export async function main(
  argv: readonly string[],
  env: CliEnv,
  io: CliIo,
): Promise<number> {
  const args = parseArgs(argv);
  if (args.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (args.error !== undefined || args.did === undefined) {
    io.stderr(`${COMMAND}: ${args.error ?? "missing <did>"}\n\n${USAGE}`);
    return 2;
  }

  let options: WebResolverOptions;
  try {
    options = optionsFromEnv(env);
  } catch (error) {
    io.stderr(`${COMMAND}: ${describe(error)}\n`);
    return 2;
  }

  // Node host: the connection itself is checked — each hostname is resolved
  // once, private answers are refused, the socket opens only to validated
  // addresses (see destination-guard.ts).
  options.destinationGuard = "node";
  let registry;
  try {
    registry = getResolver(options);
  } catch (error) {
    if (error instanceof DestinationGuardError) {
      io.stderr(`${COMMAND}: ${describe(error)}\n`);
      return 2;
    }
    throw error;
  }

  let result;
  try {
    const resolver = new Resolver(registry);
    result = await resolver.resolve(args.did, args.resolutionOptions);
  } catch (error) {
    // The driver reports its own failures as results; anything thrown is a
    // host-level fault, reported in the same DIF shape so callers parse one
    // format.
    result = {
      didResolutionMetadata: {
        error: "internalError",
        message: describe(error),
      },
      didDocument: null,
      didDocumentMetadata: {},
    };
  }
  io.stdout(`${JSON.stringify(result, null, args.compact ? undefined : 2)}\n`);
  return typeof result.didResolutionMetadata?.error === "string" ? 1 : 0;
}
