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
import { Resolver } from "did-resolver";
import { getResolver } from "./resolver.js";
export const COMMAND = "thisdid-resolve-oyd";
export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:oyd identifier with @thisdid/oyd-did-resolver and print the DIF
resolution result as JSON on stdout.

Options:
  --version-id <id>      resolve a specific version (versionId)
  --version-time <iso>   resolve the version current at an ISO 8601 time
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment:
  OYD_FOLLOW_ALSO_KNOWN_AS   "1" — follow a revoked DID's rotation target
  OYD_STRICT_REVOCATION_SIG  "0" — opt out of revocation-signature checks
  OYD_STRICT_PUBKEY_BINDING  "1" — bind pubkey-form ids to a verified doc key
  OYD_MAX_LOG_ENTRIES        integer — override the log-size bound
  OYD_MAX_PREVIOUS_REFS      integer — override the per-entry previous bound
  OYD_ALLOW_HOSTS            comma-separated repository host allowlist
  OYD_ALLOW_PRIVATE_HOSTS    "1" — permit private/loopback repository hosts
  OYD_ALLOW_SCHEMES          comma-separated URL schemes (default: https)

Exit status: 0 resolved, 1 resolution error, 2 usage or configuration error.
`;
/** Thrown for a malformed environment value; reported as exit status 2. */
export class CliConfigError extends Error {
}
const TRUE = new Set(["1", "true", "yes", "on"]);
const FALSE = new Set(["0", "false", "no", "off"]);
/** An optional boolean variable; anything but a clear yes/no is an error. */
export function envFlag(env, name) {
    const raw = env[name]?.trim().toLowerCase();
    if (raw === undefined || raw === "")
        return undefined;
    if (TRUE.has(raw))
        return true;
    if (FALSE.has(raw))
        return false;
    throw new CliConfigError(`${name} must be 1/0 (true/false), got "${env[name]}"`);
}
/** An optional non-negative integer variable. */
export function envInteger(env, name) {
    const raw = env[name]?.trim();
    if (raw === undefined || raw === "")
        return undefined;
    if (!/^\d+$/.test(raw)) {
        throw new CliConfigError(`${name} must be a non-negative integer, got "${env[name]}"`);
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) {
        throw new CliConfigError(`${name} exceeds the maximum safe integer`);
    }
    return value;
}
/** An optional comma-separated list variable (blank entries dropped). */
export function envList(env, name) {
    const raw = env[name];
    if (raw === undefined || raw.trim() === "")
        return undefined;
    const items = raw
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return items.length > 0 ? items : undefined;
}
/** Map the documented environment variables onto `getResolver()` options. */
export function optionsFromEnv(env) {
    const options = {};
    const followAlsoKnownAs = envFlag(env, "OYD_FOLLOW_ALSO_KNOWN_AS");
    if (followAlsoKnownAs !== undefined)
        options.followAlsoKnownAs = followAlsoKnownAs;
    const strictRevocationSig = envFlag(env, "OYD_STRICT_REVOCATION_SIG");
    if (strictRevocationSig !== undefined)
        options.strictRevocationSig = strictRevocationSig;
    const strictPubkeyBinding = envFlag(env, "OYD_STRICT_PUBKEY_BINDING");
    if (strictPubkeyBinding !== undefined)
        options.strictPubkeyBinding = strictPubkeyBinding;
    const maxLogEntries = envInteger(env, "OYD_MAX_LOG_ENTRIES");
    if (maxLogEntries !== undefined)
        options.maxLogEntries = maxLogEntries;
    const maxPreviousRefs = envInteger(env, "OYD_MAX_PREVIOUS_REFS");
    if (maxPreviousRefs !== undefined)
        options.maxPreviousRefs = maxPreviousRefs;
    const allowHosts = envList(env, "OYD_ALLOW_HOSTS");
    const schemes = envList(env, "OYD_ALLOW_SCHEMES");
    const allowPrivateHosts = envFlag(env, "OYD_ALLOW_PRIVATE_HOSTS");
    if (allowHosts || schemes || allowPrivateHosts !== undefined) {
        options.repositoryPolicy = {
            ...(allowHosts ? { allowHosts } : {}),
            ...(schemes ? { schemes } : {}),
            ...(allowPrivateHosts !== undefined ? { allowPrivateHosts } : {}),
        };
    }
    return options;
}
/** Parse `<did> [--version-id x] [--version-time t] [--compact] [--help]`. */
export function parseArgs(argv) {
    const parsed = {
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
            if (arg === "--version-id")
                parsed.resolutionOptions.versionId = value;
            else
                parsed.resolutionOptions.versionTime = value;
            i += 1;
            continue;
        }
        if (arg.startsWith("-"))
            return { ...parsed, error: `unknown option ${arg}` };
        if (parsed.did !== undefined)
            return { ...parsed, error: `unexpected argument ${arg}` };
        parsed.did = arg;
    }
    if (parsed.did === undefined)
        return { ...parsed, error: "missing <did>" };
    return parsed;
}
function describe(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Run the CLI; returns the process exit status. Never throws. */
export async function main(argv, env, io) {
    const args = parseArgs(argv);
    if (args.help) {
        io.stdout(USAGE);
        return 0;
    }
    if (args.error !== undefined || args.did === undefined) {
        io.stderr(`${COMMAND}: ${args.error ?? "missing <did>"}\n\n${USAGE}`);
        return 2;
    }
    let options;
    try {
        options = optionsFromEnv(env);
    }
    catch (error) {
        io.stderr(`${COMMAND}: ${describe(error)}\n`);
        return 2;
    }
    let result;
    try {
        const resolver = new Resolver(getResolver(options));
        result = await resolver.resolve(args.did, args.resolutionOptions);
    }
    catch (error) {
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
//# sourceMappingURL=cli.js.map