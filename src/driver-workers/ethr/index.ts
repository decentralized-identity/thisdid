import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "@thisdid/ethr-did-resolver";
import {
  JsonRpcProvider,
  type JsonRpcPayload,
  type JsonRpcResult,
} from "ethers";
import {
  alchemyRpcUrl,
  createDriverWorker,
  scrubAlchemy,
  scrubAlchemyDeep,
} from "../runtime";

interface EthrEnv {
  /** "1" enables per-request RPC parameter and response tracing. Development
   *  only: those payloads carry the Ethereum address being resolved (call data,
   *  log topics), which resolution logs should not retain. Default off. */
  ETHR_RPC_TRACE?: string;
  /** Public Alchemy base URLs (wrangler vars, trailing `/`); the token is the
   *  ALCHEMY_API_KEY secret appended after it. The legacy full-URL secrets
   *  remain as fallbacks until they are deleted. */
  ETH_RPC_MAINNET_BASE_URL?: string;
  ETH_RPC_SEPOLIA_BASE_URL?: string;
  ALCHEMY_API_KEY?: string;
  ETH_RPC_MAINNET_URL?: string;
  ETH_RPC_SEPOLIA_URL?: string;
}

const MAX_LOG_VALUE_CHARS = 4000;

function logValue(value: unknown): unknown {
  try {
    const scrubbed = scrubAlchemyDeep(value);
    const json = JSON.stringify(scrubbed);
    return json.length <= MAX_LOG_VALUE_CHARS
      ? scrubbed
      : `${json.slice(0, MAX_LOG_VALUE_CHARS)}…[truncated ${json.length - MAX_LOG_VALUE_CHARS} chars]`;
  } catch {
    return "[unserializable]";
  }
}

/** ethers error messages embed the full request URL — scrub before rethrowing
 *  so the token cannot surface in any downstream log or metadata either. */
function scrubError(error: unknown): unknown {
  if (error instanceof Error) {
    error.message = scrubAlchemy(error.message);
    if (error.stack) error.stack = scrubAlchemy(error.stack);
  }
  return error;
}

class LoggingJsonRpcProvider extends JsonRpcProvider {
  constructor(
    url: string,
    chainId: number,
    private readonly networkLabel: string,
    private readonly trace: boolean = false,
  ) {
    super(url, chainId);
  }

  override async _send(
    payload: JsonRpcPayload | JsonRpcPayload[],
  ): Promise<JsonRpcResult[]> {
    const requests = Array.isArray(payload) ? payload : [payload];
    const started = Date.now();
    // Operational logging records what was called and how it went, never the
    // call payloads: JSON-RPC params and log topics carry the Ethereum address
    // being resolved, and resolution logs that retain identities enable the
    // tracking and profiling the DID Resolution privacy guidance warns about.
    // ETHR_RPC_TRACE=1 opts a development deployment back into full payloads.
    console.info("ethr.rpc.request", {
      network: this.networkLabel,
      methods: requests.map((request) => request.method),
      count: requests.length,
      ...(this.trace
        ? { params: logValue(requests.map((request) => request.params)) }
        : {}),
    });
    try {
      const responses = await super._send(payload);
      console.info("ethr.rpc.response", {
        network: this.networkLabel,
        methods: requests.map((request) => request.method),
        durationMs: Date.now() - started,
        ...(this.trace ? { responses: logValue(responses) } : {}),
      });
      return responses;
    } catch (rawError) {
      const error = scrubError(rawError);
      console.error("ethr.rpc.error", {
        network: this.networkLabel,
        methods: requests.map((request) => request.method),
        durationMs: Date.now() - started,
        name: error instanceof Error ? error.name : "UnknownError",
        message: scrubAlchemy(
          error instanceof Error ? error.message : String(error),
        ),
        code:
          error && typeof error === "object" && "code" in error
            ? String(error.code)
            : undefined,
      });
      throw error;
    }
  }
}

const driver = createDriverWorker<EthrEnv>({
  method: "ethr",
  // The DIF ethr-did-resolver core (14.1.2) from the ThisDID fork under
  // vendor/forks, through the @thisdid wrapper that also carries the CLI.
  packageName: "@thisdid/ethr-did-resolver",
  packageVersion: "1.0.0",
  // ethers JsonRpcProvider retains asynchronous request/batch state. Reusing
  // that provider in a later stateless Worker invocation can strand its promise
  // in the previous request context, which Cloudflare cancels as a hung request.
  cacheResolver: false,
  registry: (env) => {
    const trace = env.ETHR_RPC_TRACE === "1";
    const mainnetUrl =
      alchemyRpcUrl(env.ETH_RPC_MAINNET_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.ETH_RPC_MAINNET_URL;
    const sepoliaUrl =
      alchemyRpcUrl(env.ETH_RPC_SEPOLIA_BASE_URL, env.ALCHEMY_API_KEY) ??
      env.ETH_RPC_SEPOLIA_URL;
    const networks = [
      ...(mainnetUrl
        ? [
            {
              name: "mainnet",
              chainId: 1,
              provider: new LoggingJsonRpcProvider(
                mainnetUrl,
                1,
                "mainnet",
                trace,
              ),
            },
          ]
        : []),
      ...(sepoliaUrl
        ? [
            {
              name: "sepolia",
              chainId: 11155111,
              provider: new LoggingJsonRpcProvider(
                sepoliaUrl,
                11155111,
                "sepolia",
                trace,
              ),
            },
          ]
        : []),
    ];
    if (networks.length === 0) throw new Error("ethr driver is not configured");
    return getResolver({ networks } as never) as unknown as ResolverRegistry;
  },
});

export default {
  async fetch(request: Request, env: EthrEnv): Promise<Response> {
    const started = Date.now();
    const requestId = crypto.randomUUID();
    let didMethod = "unknown";
    try {
      const body = (await request.clone().json()) as { did?: unknown };
      if (typeof body.did === "string") {
        didMethod = body.did.split(":")[1] ?? "unknown";
      }
    } catch {
      // The shared runtime will return the authoritative malformed-request error.
    }
    console.info("ethr.resolve.start", { requestId, didMethod });
    try {
      const response = await driver.fetch(request, env);
      const diagnostic = (await response
        .clone()
        .json()
        .catch(() => null)) as {
        result?: { didResolutionMetadata?: { error?: unknown } };
        driver?: { durationMs?: unknown };
      } | null;
      console.info("ethr.resolve.complete", {
        requestId,
        status: response.status,
        durationMs: Date.now() - started,
        driverDurationMs: diagnostic?.driver?.durationMs,
        resolutionError: diagnostic?.result?.didResolutionMetadata?.error,
      });
      return response;
    } catch (rawError) {
      const error = scrubError(rawError);
      console.error("ethr.resolve.error", {
        requestId,
        durationMs: Date.now() - started,
        name: error instanceof Error ? error.name : "UnknownError",
        message: scrubAlchemy(
          error instanceof Error ? error.message : String(error),
        ),
      });
      throw error;
    }
  },
};
