/**
 * Command-line resolution for @thisdid/ethr-did-resolver.
 *
 * `thisdid-resolve-ethr <did>` resolves one did:ethr identifier with this
 * package alone — no resolver service, no Worker — and prints the DIF
 * resolution result as JSON on stdout. RPC endpoints come from environment
 * variables under the same names the ThisDID Worker uses, so a `.dev.vars`
 * file or a production secret set drives the CLI unchanged. Exit status:
 * 0 resolved, 1 the resolver reported an error (`didResolutionMetadata.error`
 * is set), 2 usage or configuration error.
 *
 * `main()` is pure over its inputs (argv, env, an output sink) so it is unit
 * tested directly; `bin.ts` is the thin executable that binds it to the
 * process.
 */
import { Resolver, type DIDResolutionOptions } from "did-resolver";
import { getResolver, networksFromEnv } from "./resolver.js";

export const COMMAND = "thisdid-resolve-ethr";

export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:ethr identifier with @thisdid/ethr-did-resolver and print the
DIF resolution result as JSON on stdout.

Options:
  --version-id <id>      resolve at a block height (versionId)
  --version-time <iso>   resolve the version current at an ISO 8601 time
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment (at least one network is required):
  ETH_RPC_MAINNET_URL          complete JSON-RPC endpoint for Ethereum mainnet
  ETH_RPC_SEPOLIA_URL          complete JSON-RPC endpoint for Sepolia
  ETH_RPC_MAINNET_BASE_URL     Alchemy base URL (ends with /) + ALCHEMY_API_KEY
  ETH_RPC_SEPOLIA_BASE_URL     Alchemy base URL (ends with /) + ALCHEMY_API_KEY
  ALCHEMY_API_KEY              appended to the *_BASE_URL variables

Networks without an endpoint are not registered: a DID on one of them
resolves to the unknownNetwork error rather than through a guessed public RPC.

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

  const networks = networksFromEnv(env);
  if (networks.length === 0) {
    io.stderr(
      `${COMMAND}: no network configured — set ETH_RPC_MAINNET_URL and/or ETH_RPC_SEPOLIA_URL (or the *_BASE_URL + ALCHEMY_API_KEY pair)\n`,
    );
    return 2;
  }

  let result;
  try {
    const resolver = new Resolver(getResolver({ networks }));
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
