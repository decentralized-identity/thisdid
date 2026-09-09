/**
 * Command-line resolution for @thisdid/hedera-did-resolver.
 *
 * `thisdid-resolve-hedera <did>` resolves one did:hedera identifier with this
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
import { type HederaResolverOptions } from "./resolver.js";
export declare const COMMAND = "thisdid-resolve-hedera";
export declare const USAGE = "Usage: thisdid-resolve-hedera <did> [options]\n\nResolve a did:hedera identifier with @thisdid/hedera-did-resolver and print the DIF\nresolution result as JSON on stdout.\n\nOptions:\n  --version-id <id>      pass versionId to the resolver\n  --version-time <iso>   pass versionTime to the resolver\n  --compact              single-line JSON (default: pretty-printed)\n  -h, --help             show this help\n\nEnvironment (all optional; public mirror nodes are built in):\n  HEDERA_MIRROR_MAINNET_URL      mirror-node REST base URL for mainnet\n  HEDERA_MIRROR_TESTNET_URL      mirror-node REST base URL for testnet\n  HEDERA_MIRROR_PREVIEWNET_URL   mirror-node REST base URL for previewnet\n  HEDERA_TIMEOUT_MS              integer \u2014 per-request bound in ms\n  HEDERA_MAX_MESSAGES            integer \u2014 fail-closed bound on topic history\n\nExit status: 0 resolved, 1 resolution error, 2 usage or configuration error.\n";
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
/** An optional absolute http(s) URL variable. */
export declare function envUrl(env: CliEnv, name: string): string | undefined;
/** Map the documented environment variables onto `getResolver()` options. */
export declare function optionsFromEnv(env: CliEnv): HederaResolverOptions;
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/** Run the CLI; returns the process exit status. Never throws. */
export declare function main(argv: readonly string[], env: CliEnv, io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map