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
import { type DIDResolutionOptions } from "did-resolver";
import { type SolResolverOptions } from "./resolver.js";
export declare const COMMAND = "thisdid-resolve-sol";
export declare const USAGE = "Usage: thisdid-resolve-sol <did> [options]\n\nResolve a did:sol identifier with @thisdid/sol-did-resolver and print the DIF\nresolution result as JSON on stdout.\n\nOptions:\n  --version-id <id>      pass versionId to the resolver\n  --version-time <iso>   pass versionTime to the resolver\n  --compact              single-line JSON (default: pretty-printed)\n  -h, --help             show this help\n\nEnvironment (at least one cluster is required):\n  SOL_RPC_MAINNET_URL        complete JSON-RPC endpoint for mainnet-beta\n  SOL_RPC_DEVNET_URL         complete JSON-RPC endpoint for devnet\n  SOL_RPC_TESTNET_URL        complete JSON-RPC endpoint for testnet\n  SOL_RPC_MAINNET_BASE_URL   Alchemy base URL (ends with /) + ALCHEMY_API_KEY\n  SOL_RPC_DEVNET_BASE_URL    Alchemy base URL (ends with /) + ALCHEMY_API_KEY\n  SOL_RPC_TESTNET_BASE_URL   Alchemy base URL (ends with /) + ALCHEMY_API_KEY\n  ALCHEMY_API_KEY            appended to the *_BASE_URL variables\n  SOL_TIMEOUT_MS             integer \u2014 per-request bound in ms (default 6000)\n\nExit status: 0 resolved, 1 resolution error, 2 usage or configuration error.\n";
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
export declare class CliConfigError extends Error {
}
/** An optional non-negative integer variable. */
export declare function envInteger(env: CliEnv, name: string): number | undefined;
/** Map the documented environment variables onto `getResolver()` options. */
export declare function optionsFromEnv(env: CliEnv): SolResolverOptions;
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/** Run the CLI; returns the process exit status. Never throws. */
export declare function main(argv: readonly string[], env: CliEnv, io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map