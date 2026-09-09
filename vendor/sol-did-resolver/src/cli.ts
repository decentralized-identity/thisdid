/**
 * Command-line resolution for @thisdid/sol-did-resolver.
 *
 * `thisdid-resolve-sol <did>` resolves one did:sol identifier with this
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
import { getResolver, type SolResolverOptions } from "./resolver.js";

export const COMMAND = "thisdid-resolve-sol";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:sol identifier with @thisdid/sol-did-resolver and print the DIF
resolution result as JSON on stdout.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment (at least one cluster is required):
  SOL_RPC_MAINNET_URL        complete JSON-RPC endpoint for mainnet-beta
  SOL_RPC_DEVNET_URL         complete JSON-RPC endpoint for devnet
  SOL_RPC_TESTNET_URL        complete JSON-RPC endpoint for testnet
  SOL_RPC_MAINNET_BASE_URL   Alchemy base URL (ends with /) + ALCHEMY_API_KEY
  SOL_RPC_DEVNET_BASE_URL    Alchemy base URL (ends with /) + ALCHEMY_API_KEY
  SOL_RPC_TESTNET_BASE_URL   Alchemy base URL (ends with /) + ALCHEMY_API_KEY
  ALCHEMY_API_KEY            appended to the *_BASE_URL variables
  SOL_TIMEOUT_MS             integer — per-request bound in ms (default 6000)

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

/**
 * Compose an Alchemy RPC endpoint from a public base-URL variable (ends with
 * `/`) and the ALCHEMY_API_KEY secret, exactly as the ThisDID Worker does;
 * both halves must be present.
 */
function alchemyRpcUrl(
  base: string | undefined,
  key: string | undefined,
): string | undefined {
  const trimmedBase = base?.trim();
  const trimmedKey = key?.trim();
  if (!trimmedBase || !trimmedKey) return undefined;
  return trimmedBase.replace(/\/*$/, "/") + trimmedKey;
}

/** Map the documented environment variables onto `getResolver()` options. */
export function optionsFromEnv(env: CliEnv): SolResolverOptions {
  const rpcUrls: NonNullable<SolResolverOptions["rpcUrls"]> = {};
  for (const [cluster, suffix] of [
    ["mainnet", "MAINNET"],
    ["devnet", "DEVNET"],
    ["testnet", "TESTNET"],
  ] as const) {
    const url =
      alchemyRpcUrl(env[`SOL_RPC_${suffix}_BASE_URL`], env.ALCHEMY_API_KEY) ??
      env[`SOL_RPC_${suffix}_URL`]?.trim();
    if (url) rpcUrls[cluster] = url;
  }
  const options: SolResolverOptions = { rpcUrls };
  const timeoutMs = envInteger(env, "SOL_TIMEOUT_MS");
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

  let options: SolResolverOptions;
  try {
    options = optionsFromEnv(env);
  } catch (error) {
    io.stderr(`${COMMAND}: ${describe(error)}\n`);
    return 2;
  }
  if (Object.keys(options.rpcUrls ?? {}).length === 0) {
    io.stderr(
      `${COMMAND}: no cluster configured — set SOL_RPC_MAINNET_URL, SOL_RPC_DEVNET_URL and/or SOL_RPC_TESTNET_URL (or the *_BASE_URL + ALCHEMY_API_KEY pair)\n`,
    );
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
