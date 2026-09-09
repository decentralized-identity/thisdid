/**
 * Command-line resolution for @thisdid/near-did-resolver.
 *
 * `thisdid-resolve-near <did>` resolves one did:near identifier with this
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
  getResolver,
  type NearNetworkConfig,
  type NearResolverOptions,
} from "./resolver.js";

export const COMMAND = "thisdid-resolve-near";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:near identifier with @thisdid/near-did-resolver and print the DIF
resolution result as JSON on stdout.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment (at least one network is required):
  NEAR_RPC_MAINNET_URL             NEAR JSON-RPC endpoint for mainnet
  NEAR_RPC_TESTNET_URL             NEAR JSON-RPC endpoint for testnet
  NEAR_REGISTRY_CONTRACT_MAINNET   DID registry contract account (optional)
  NEAR_REGISTRY_CONTRACT_TESTNET   DID registry contract account (optional)
  NEAR_TIMEOUT_MS                  integer — per-request bound in ms

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

/** Map the documented environment variables onto `getResolver()` options. */
export function optionsFromEnv(env: CliEnv): NearResolverOptions {
  const networks: NearNetworkConfig[] = [];
  for (const [networkId, suffix] of [
    ["mainnet", "MAINNET"],
    ["testnet", "TESTNET"],
  ] as const) {
    const rpcUrl = env[`NEAR_RPC_${suffix}_URL`]?.trim();
    if (!rpcUrl) continue;
    const contractId = env[`NEAR_REGISTRY_CONTRACT_${suffix}`]?.trim();
    networks.push({ networkId, rpcUrl, ...(contractId ? { contractId } : {}) });
  }
  const options: NearResolverOptions = { networks };
  const timeoutMs = envInteger(env, "NEAR_TIMEOUT_MS");
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

  let options: NearResolverOptions;
  try {
    options = optionsFromEnv(env);
  } catch (error) {
    io.stderr(`${COMMAND}: ${describe(error)}\n`);
    return 2;
  }
  if (options.networks.length === 0) {
    io.stderr(
      `${COMMAND}: no network configured — set NEAR_RPC_MAINNET_URL and/or NEAR_RPC_TESTNET_URL\n`,
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
