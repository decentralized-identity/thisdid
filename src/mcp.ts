import { resolveDid } from "./resolve";
import { ALL_METHODS, FEATURED_METHODS } from "./methods";
import { chainFor } from "./resolvers/registry";
import { getHealth } from "./routing/health";
import type { Env } from "./types";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function isRpcRequest(value: unknown): value is RpcRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const request = value as Record<string, unknown>;
  const id = request.id;
  return (
    request.jsonrpc === "2.0" &&
    typeof request.method === "string" &&
    (request.params === undefined ||
      (!!request.params &&
        typeof request.params === "object" &&
        !Array.isArray(request.params))) &&
    (id === undefined ||
      id === null ||
      typeof id === "string" ||
      typeof id === "number")
  );
}

const TOOLS = [
  {
    name: "resolve_did",
    description: "Resolve a W3C DID.",
    inputSchema: {
      type: "object",
      properties: { did: { type: "string" } },
      required: ["did"],
      additionalProperties: false,
    },
  },
  {
    name: "list_did_methods",
    description: "List methods advertised by ThisDID and their routing mode.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "describe_routing",
    description: "Return the baseline route chain for a DID method.",
    inputSchema: {
      type: "object",
      properties: { method: { type: "string" } },
      required: ["method"],
      additionalProperties: false,
    },
  },
  {
    name: "get_resolver_health",
    description: "Return the current resolver health snapshot.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const ok = (id: RpcRequest["id"], result: unknown) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  result,
});
const error = (id: RpcRequest["id"], code: number, message: string) => ({
  jsonrpc: "2.0",
  id: id ?? null,
  error: { code, message },
});
const toolText = (value: unknown, isError = false) => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  isError,
});

export async function handleMcp(
  input: unknown,
  env: Env,
): Promise<Record<string, unknown> | null> {
  if (!isRpcRequest(input)) return error(undefined, -32600, "Invalid Request");
  const req = input;
  const notification = req.id === undefined;
  let response: Record<string, unknown>;
  if (req.method === "initialize") {
    response = ok(req.id, {
      protocolVersion: "2025-06-18",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "ThisDID", version: "2.0.0" },
    });
  } else if (req.method === "ping") response = ok(req.id, {});
  else if (req.method === "tools/list") response = ok(req.id, { tools: TOOLS });
  else if (req.method === "tools/call") {
    const name = req.params?.name;
    const rawArgs = req.params?.arguments;
    const args =
      rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};
    try {
      if (name === "resolve_did") {
        if (typeof args.did !== "string")
          response = ok(
            req.id,
            toolText({ error: "did must be a string" }, true),
          );
        else response = ok(req.id, toolText(await resolveDid(args.did, env)));
      } else if (name === "list_did_methods")
        response = ok(
          req.id,
          toolText({
            featured: FEATURED_METHODS,
            methods: ALL_METHODS,
            semantics:
              "Configured local or upstream routes; routed availability depends on provider health.",
          }),
        );
      else if (name === "describe_routing") {
        if (typeof args.method !== "string")
          response = ok(
            req.id,
            toolText({ error: "method must be a string" }, true),
          );
        else
          response = ok(
            req.id,
            toolText({
              method: args.method.replace(/^did:/, "").toLowerCase(),
              chain: chainFor(args.method.replace(/^did:/, "").toLowerCase()),
            }),
          );
      } else if (name === "get_resolver_health")
        response = ok(req.id, toolText(await getHealth(env)));
      else response = error(req.id, -32602, `Unknown tool: ${String(name)}`);
    } catch {
      response = ok(req.id, toolText({ error: "internalError" }, true));
    }
  } else response = error(req.id, -32601, "Method not found");
  return notification ? null : response;
}

export const MCP_TOOLS = TOOLS;
