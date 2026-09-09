/**
 * Command-line resolution for @thisdid/tz-did-resolver.
 *
 * `thisdid-resolve-tz <did>` resolves one did:tz identifier with this
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
import { type TzResolverOptions } from "./resolver.js";
export declare const COMMAND = "thisdid-resolve-tz";
export declare const USAGE = "Usage: thisdid-resolve-tz <did> [options]\n\nResolve a did:tz identifier with @thisdid/tz-did-resolver and print the DIF\nresolution result as JSON on stdout.\n\nOptions:\n  --version-id <id>      pass versionId to the resolver\n  --version-time <iso>   pass versionTime to the resolver\n  --compact              single-line JSON (default: pretty-printed)\n  -h, --help             show this help\n\nEnvironment (all optional; the public TzKT endpoints are built in):\n  TZ_TZKT_MAINNET_URL     comma-separated TzKT API base URLs for mainnet\n  TZ_TZKT_SHADOWNET_URL   comma-separated TzKT API base URLs for shadownet\n  TZ_CHAIN_ID_MAINNET     override the pinned chain id for mainnet\n  TZ_CHAIN_ID_SHADOWNET   override the pinned chain id for shadownet\n  TZ_TIMEOUT_MS           integer \u2014 per-request bound in ms\n\nExit status: 0 resolved, 1 resolution error, 2 usage or configuration error.\n";
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
/** An optional comma-separated list variable (blank entries dropped). */
export declare function envList(env: CliEnv, name: string): string[] | undefined;
/** An optional free-text variable (trimmed; blank means unset). */
export declare function envString(env: CliEnv, name: string): string | undefined;
/** Map the documented environment variables onto `getResolver()` options. */
export declare function optionsFromEnv(env: CliEnv): TzResolverOptions;
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/** Run the CLI; returns the process exit status. Never throws. */
export declare function main(argv: readonly string[], env: CliEnv, io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map