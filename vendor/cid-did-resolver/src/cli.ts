/**
 * Command-line resolution for @thisdid/cid-did-resolver.
 *
 * `thisdid-resolve-cid <did>` resolves one did:cid identifier with this
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
import { getResolver, type CidResolverOptions } from "./resolver.js";

export const COMMAND = "thisdid-resolve-cid";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:cid identifier with @thisdid/cid-did-resolver and print the DIF
resolution result as JSON on stdout.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment:
  CID_GATEKEEPER_URL   Archon Gatekeeper base URL (default: the public Archon
                       deployment)
  CID_TIMEOUT_MS       integer — per-request bound in ms
  CID_MAX_EVENTS       integer — bound on the operation chain length

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

/** An optional absolute http(s) URL variable. */
export function envUrl(env: CliEnv, name: string): string | undefined {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return undefined;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new CliConfigError(
      `${name} must be an absolute URL, got "${env[name]}"`,
    );
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new CliConfigError(
      `${name} must use http or https, got "${env[name]}"`,
    );
  }
  return raw;
}

/** Map the documented environment variables onto `getResolver()` options. */
export function optionsFromEnv(env: CliEnv): CidResolverOptions {
  const options: CidResolverOptions = {};
  const gatekeeperUrl = envUrl(env, "CID_GATEKEEPER_URL");
  if (gatekeeperUrl !== undefined) options.gatekeeperUrl = gatekeeperUrl;
  const maxEvents = envInteger(env, "CID_MAX_EVENTS");
  if (maxEvents !== undefined) options.maxEvents = maxEvents;
  const timeoutMs = envInteger(env, "CID_TIMEOUT_MS");
  if (timeoutMs !== undefined) options.timeoutMs = timeoutMs;
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

  let options: CidResolverOptions;
  try {
    options = optionsFromEnv(env);
  } catch (error) {
    io.stderr(`${COMMAND}: ${describe(error)}\n`);
    return 2;
  }

  let result;
  try {
    const resolver = new Resolver(getResolver(options));
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
