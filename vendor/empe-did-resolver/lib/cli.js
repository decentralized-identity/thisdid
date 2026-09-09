/**
 * Command-line resolution for @thisdid/empe-did-resolver.
 *
 * `thisdid-resolve-empe <did>` resolves one did:empe identifier with this
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
import { Resolver } from "did-resolver";
import { getResolver } from "./resolver.js";
export const COMMAND = "thisdid-resolve-empe";
export const USAGE = `Usage: ${COMMAND} <did> [options]

Resolve a did:empe identifier with @thisdid/empe-did-resolver and print the
DIF resolution result as JSON on stdout.

Options:
  --version-id <id>      pass versionId to the resolver
  --version-time <iso>   pass versionTime to the resolver
  --compact              single-line JSON (default: pretty-printed)
  -h, --help             show this help

Environment (all optional; testnet defaults to the public chain-registry RPC):
  EMPE_RPC_MAINNET_URL   Tendermint RPC base URL for Empeiria mainnet
                         (none by default — mainnet DIDs report notConfigured)
  EMPE_RPC_TESTNET_URL   Tendermint RPC base URL for empe-testnet-2
                         (default https://rpc-testnet.empe.io)
  EMPE_TIMEOUT_MS        integer — per-request wall-clock bound (default 6000)

A comma-separated list in an *_URL variable names fallback endpoints, tried
in order on transport failures.

Exit status: 0 resolved, 1 resolution error, 2 usage or configuration error.
`;
/** Thrown for a malformed environment value; reported as exit status 2. */
export class CliConfigError extends Error {
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
/**
 * Map the documented environment variables onto `getResolver()` options.
 * A single endpoint is passed as a string (exactly what the Worker does); a
 * comma-separated list becomes the resolver's ordered fallback array.
 */
export function optionsFromEnv(env) {
    const options = {};
    const rpcUrls = {};
    for (const [network, name] of [
        ["mainnet", "EMPE_RPC_MAINNET_URL"],
        ["testnet", "EMPE_RPC_TESTNET_URL"],
    ]) {
        const urls = envList(env, name);
        if (urls)
            rpcUrls[network] = urls.length === 1 ? urls[0] : urls;
    }
    if (Object.keys(rpcUrls).length > 0)
        options.rpcUrls = rpcUrls;
    const timeoutMs = envInteger(env, "EMPE_TIMEOUT_MS");
    if (timeoutMs !== undefined)
        options.timeoutMs = timeoutMs;
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
        if (arg.startsWith("-")) {
            return { ...parsed, error: `unknown option ${arg}` };
        }
        if (parsed.did !== undefined) {
            return { ...parsed, error: `unexpected argument ${arg}` };
        }
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