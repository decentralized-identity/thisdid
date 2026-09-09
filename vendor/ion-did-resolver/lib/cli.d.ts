/**
 * Command-line resolution for @thisdid/ion-did-resolver.
 *
 * `thisdid-resolve-ion <did>` resolves one did:ion identifier with this
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
import { type IonResolverOptions } from "./resolver.js";
export declare const COMMAND = "thisdid-resolve-ion";
export declare const USAGE = "Usage: thisdid-resolve-ion <did> [options]\n\nResolve a did:ion identifier with @thisdid/ion-did-resolver and print the DIF\nresolution result as JSON on stdout. Long-form identifiers resolve fully offline.\n\nOptions:\n  --version-id <id>      pass versionId to the resolver\n  --version-time <iso>   pass versionTime to the resolver\n  --compact              single-line JSON (default: pretty-printed)\n  -h, --help             show this help\n\nEnvironment (short-form identifiers only):\n  ION_RESOLUTION_ENDPOINT   ION node resolution endpoint for short-form DIDs\n                            (unset: short-form reports notConfigured)\n  ION_TIMEOUT_MS            integer \u2014 per-request bound in ms\n\nExit status: 0 resolved, 1 resolution error, 2 usage or configuration error.\n";
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
export declare function optionsFromEnv(env: CliEnv): IonResolverOptions;
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/** Run the CLI; returns the process exit status. Never throws. */
export declare function main(argv: readonly string[], env: CliEnv, io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map