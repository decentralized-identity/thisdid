import type { ResolverRegistry } from "did-resolver";
import { getResolver } from "ethr-did-resolver";
import {
  JsonRpcProvider,
  type JsonRpcPayload,
  type JsonRpcResult,
} from "ethers";
import { createDriverWorker } from "../runtime";

interface EthrEnv {
  /** Full Alchemy URLs, including credentials; stored only on this driver Worker. */
  EVM_RPC_MAINNET_URL?: string;
  EVM_RPC_SEPOLIA_URL?: string;
}

const MAX_LOG_VALUE_CHARS = 4000;

function logValue(value: unknown): unknown {
  try {
    const json = JSON.stringify(value);
    return json.length <= MAX_LOG_VALUE_CHARS
      ? value
      : `${json.slice(0, MAX_LOG_VALUE_CHARS)}…[truncated ${json.length - MAX_LOG_VALUE_CHARS} chars]`;
  } catch {
    return "[unserializable]";
  }
}

class LoggingJsonRpcProvider extends JsonRpcProvider {
  constructor(
    url: string,
    chainId: number,
    private readonly networkLabel: string,
  ) {
    super(url, chainId);
  }

  override async _send(
    payload: JsonRpcPayload | JsonRpcPayload[],
  ): Promise<JsonRpcResult[]> {
    const requests = Array.isArray(payload) ? payload : [payload];
    const started = Date.now();
    console.info("ethr.rpc.request", {
      network: this.networkLabel,
      methods: requests.map((request) => request.method),
      ids: requests.map((request) => request.id),
      params: logValue(requests.map((request) => request.params)),
    });
    try {
      const responses = await super._send(payload);
      console.info("ethr.rpc.response", {
        network: this.networkLabel,
        methods: requests.map((request) => request.method),
        durationMs: Date.now() - started,
        responses: logValue(responses),
      });
      return responses;
    } catch (error) {
      console.error("ethr.rpc.error", {
        network: this.networkLabel,
        methods: requests.map((request) => request.method),
        durationMs: Date.now() - started,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
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
  packageName: "ethr-did-resolver",
  packageVersion: "14.1.2",
  // ethers JsonRpcProvider retains asynchronous request/batch state. Reusing
  // that provider in a later stateless Worker invocation can strand its promise
  // in the previous request context, which Cloudflare cancels as a hung request.
  cacheResolver: false,
  registry: (env) => {
    const networks = [
      ...(env.EVM_RPC_MAINNET_URL
        ? [
            {
              name: "mainnet",
              chainId: 1,
              provider: new LoggingJsonRpcProvider(
                env.EVM_RPC_MAINNET_URL,
                1,
                "mainnet",
              ),
            },
          ]
        : []),
      ...(env.EVM_RPC_SEPOLIA_URL
        ? [
            {
              name: "sepolia",
              chainId: 11155111,
              provider: new LoggingJsonRpcProvider(
                env.EVM_RPC_SEPOLIA_URL,
                11155111,
                "sepolia",
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
    } catch (error) {
      console.error("ethr.resolve.error", {
        requestId,
        durationMs: Date.now() - started,
        name: error instanceof Error ? error.name : "UnknownError",
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
};
