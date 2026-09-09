/**
 * Command-line resolution for @thisdid/oyd-did-resolver.
 *
 * `thisdid-resolve-oyd <did>` resolves one did:oyd identifier with this
 * package alone — no resolver service, no Worker — and prints the DIF
 * resolution result as JSON on stdout. Configuration comes from environment
 * variables, so a `.dev.vars` file or a production secret set drives the CLI
 * unchanged. Exit status: 0 resolved, 1 the resolver reported an error
 * (`didResolutionMetadata.error` is set), 2 usage or configuration error.
 *
 * `main()` is pure over its inputs (argv, env, an output sink) so it is unit
 * tested directly; `bin.ts` is the thin executable that binds it to the
 * process.
 */
import { type DIDResolutionOptions } from "did-resolver";
import { type OydResolverOptions } from "./resolver.js";
export declare const COMMAND = "thisdid-resolve-oyd";
export declare const USAGE = "Usage: thisdid-resolve-oyd <did> [options]\n\nResolve a did:oyd identifier with @thisdid/oyd-did-resolver and print the DIF\nresolution result as JSON on stdout.\n\nOptions:\n  --version-id <id>      resolve a specific version (versionId)\n  --version-time <iso>   resolve the version current at an ISO 8601 time\n  --compact              single-line JSON (default: pretty-printed)\n  -h, --help             show this help\n\nEnvironment:\n  OYD_FOLLOW_ALSO_KNOWN_AS   \"1\" \u2014 follow a revoked DID's rotation target\n  OYD_STRICT_REVOCATION_SIG  \"0\" \u2014 opt out of revocation-signature checks\n  OYD_STRICT_PUBKEY_BINDING  \"1\" \u2014 bind pubkey-form ids to a verified doc key\n  OYD_MAX_LOG_ENTRIES        integer \u2014 override the log-size bound\n  OYD_MAX_PREVIOUS_REFS      integer \u2014 override the per-entry previous bound\n  OYD_ALLOW_HOSTS            comma-separated repository host allowlist\n  OYD_ALLOW_PRIVATE_HOSTS    \"1\" \u2014 permit private/loopback repository hosts\n  OYD_ALLOW_SCHEMES          comma-separated URL schemes (default: https)\n\nExit status: 0 resolved, 1 resolution error, 2 usage or configuration error.\n";
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
/** An optional boolean variable; anything but a clear yes/no is an error. */
export declare function envFlag(env: CliEnv, name: string): boolean | undefined;
/** An optional non-negative integer variable. */
export declare function envInteger(env: CliEnv, name: string): number | undefined;
/** An optional comma-separated list variable (blank entries dropped). */
export declare function envList(env: CliEnv, name: string): string[] | undefined;
/** Map the documented environment variables onto `getResolver()` options. */
export declare function optionsFromEnv(env: CliEnv): OydResolverOptions;
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export declare function parseArgs(argv: readonly string[]): ParsedArgs;
/** Run the CLI; returns the process exit status. Never throws. */
export declare function main(argv: readonly string[], env: CliEnv, io: CliIo): Promise<number>;
//# sourceMappingURL=cli.d.ts.map