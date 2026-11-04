/**
 * Command-line resolution for @thisdid/webvh-did-resolver.
 *
 * `thisdid-resolve-webvh <did>` resolves one did:webvh identifier with this
 * package alone — no resolver service, no Worker — and prints the DIF
 * resolution result as JSON on stdout.
 * Configuration comes from the WEBVH_* environment variables in USAGE, the
 * same names the ThisDID driver Worker reads from its wrangler `vars`.
 * Exit status: 0 resolved, 1 the resolver reported an error
 * (`didResolutionMetadata.error` is set), 2 usage or configuration error.
 *
 * `main()` is pure over its inputs (argv, env, an output sink) so it is unit
 * tested directly; `bin.ts` is the thin executable that binds it to the
 * process.
 */
import { Resolver, type DIDResolutionOptions } from "did-resolver";
import { optionsFromEnv, type EnvVars } from "./env.js";
import {
  DestinationGuardError,
  FETCH_POLICY_DEFAULTS,
  getResolver,
  type WebvhResolverOptions,
} from "./resolver.js";

// The environment helpers live in env.ts, shared with the driver Worker; the
// CLI contract re-exports them under its own names.
export {
  EnvConfigError as CliConfigError,
  envFlag,
  envInteger,
  envPositiveInteger,
  optionsFromEnv,
} from "./env.js";

export const COMMAND = "thisdid-resolve-webvh";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:webvh identifier with @thisdid/webvh-did-resolver and print the DIF
resolution result as JSON on stdout. The DID names the HTTPS origin its log is fetched from; proofs are verified
with the built-in WebCrypto Ed25519 verifier. The fetch boundaries below all
default to fail-closed values.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

The connection is checked as well as the name: each hostname is resolved once,
any private answer is refused, and the socket opens only to validated addresses.

Environment (all optional; an unset variable takes its default; the ThisDID
driver Worker reads the same names from its wrangler vars):
  WEBVH_TIMEOUT_MS            positive integer — wall-clock bound per retrieval in ms (default ${FETCH_POLICY_DEFAULTS.timeoutMs})
  WEBVH_MAX_RESPONSE_BYTES    positive integer — largest log or witness file accepted (default ${FETCH_POLICY_DEFAULTS.maxResponseBytes})
  WEBVH_MAX_REDIRECTS         integer — redirect hops followed, each re-validated; 0 disables (default ${FETCH_POLICY_DEFAULTS.maxRedirects})
  WEBVH_ALLOW_PRIVATE_HOSTS   1/0 — permit http:// and loopback / private hosts, development only (default ${FETCH_POLICY_DEFAULTS.allowPrivateHosts ? 1 : 0})
The package's .dev.vars.example lists them at their defaults:
  cp .dev.vars.example .dev.vars && node --env-file=.dev.vars lib/bin.js <did>

Exit status: 0 resolved, 1 resolution error, 2 usage or configuration error.
`;

export type CliEnv = EnvVars;

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

  let options: WebvhResolverOptions;
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
