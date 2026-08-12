import { FEATURED_METHODS, ALL_METHODS } from "../methods";

/** OpenAPI 3.1 document for the ThisDID Resolver API. `origin` sets the server URL. */
export function openApiSpec(origin: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "ThisDID DIF Universal DID Resolver API",
      version: "2.0.1",
      description:
        "ThisDID is a W3C DID Core-conformant DIF Universal DID Resolver. It implements the DIF " +
        "Universal Resolver HTTP binding (`GET /1.0/identifiers/{did}`) with smart routing: each method " +
        "is resolved through an ordered fallback chain of ThisDID in-Worker drivers plus the " +
        "Godiddy, GoPlausible, and Archon Universal Resolvers. ThisDID was built and donated to DIF " +
        "by GoPlausible, which continues to maintain it. Additional resolver integrations are welcome.",
      license: { name: "Apache-2.0" },
    },
    servers: [{ url: origin }],
    tags: [
      {
        name: "Resolution",
        description: "DIF Universal Resolver HTTP binding",
      },
      {
        name: "Discovery",
        description: "Supported methods & service metadata",
      },
      {
        name: "Analytics",
        description: "Aggregate and paginated resolution telemetry",
      },
      { name: "MCP", description: "Model Context Protocol — agentic access" },
    ],
    paths: {
      "/1.0/identifiers/{did}": {
        get: {
          tags: ["Resolution"],
          operationId: "resolveDid",
          summary: "Resolve a DID to its DID document",
          description:
            "Resolves a Decentralized Identifier and returns a W3C DID Resolution Result. " +
            "The `didResolutionMetadata` is extended with ThisDID routing fields " +
            "(`route`, `resolver`, `network`, `durationMs`, `via`).",
          parameters: [
            {
              name: "did",
              in: "path",
              required: true,
              description:
                "The DID to resolve, e.g. `did:web:identity.foundation`.",
              schema: { type: "string" },
              example: "did:web:identity.foundation",
            },
            {
              name: "Accept",
              in: "header",
              required: false,
              description: "Preferred DID representation media type.",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Resolution result (DID document found).",
              content: {
                "application/ld+json": {
                  schema: { $ref: "#/components/schemas/DIDResolutionResult" },
                },
                "application/json": {
                  schema: { $ref: "#/components/schemas/DIDResolutionResult" },
                },
              },
            },
            "400": { description: "Invalid DID syntax (`error: invalidDid`)." },
            "404": { description: "DID not found (`error: notFound`)." },
            "406": {
              description:
                "Requested representation is unsupported (`error: representationNotSupported`).",
            },
            "429": {
              description:
                "Edge resolution rate limit exceeded (`error: rateLimitExceeded`).",
            },
            "501": {
              description:
                "Unsupported DID method (`error: unsupportedDidMethod`).",
            },
          },
        },
      },
      "/methods": {
        get: {
          tags: ["Discovery"],
          operationId: "listMethods",
          summary: "List configured DID method routes",
          description:
            "Returns methods served by isolated TypeScript driver Workers and methods intentionally routed to upstream providers. A configured route is not a guarantee that every DID is resolvable.",
          responses: {
            "200": {
              description: "Supported methods.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      featured: {
                        type: "array",
                        items: { $ref: "#/components/schemas/MethodMeta" },
                      },
                      all: { type: "array", items: { type: "string" } },
                    },
                  },
                  example: { featured: FEATURED_METHODS, all: ALL_METHODS },
                },
              },
            },
          },
        },
      },
      "/health": {
        get: {
          tags: ["Discovery"],
          operationId: "health",
          summary: "Service health probe",
          responses: { "200": { description: "Service is healthy." } },
        },
      },
      "/status": {
        get: {
          tags: ["Discovery"],
          operationId: "status",
          summary: "Per-resolver route health",
          description:
            "Live health of every resolver route (ThisDID local, GoPlausible, godiddy, archon), fed by " +
            "the thisdid-probe sub-worker: canary DID resolutions every minute. Returns the current " +
            "snapshot (status, EWMA latency, rolling success rate, consecutive failures) plus 24h " +
            "aggregates. `configured: false` until the probe worker has reported.",
          responses: {
            "200": {
              description: "Resolver health snapshot.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/data": {
        get: {
          tags: ["Analytics"],
          operationId: "analytics",
          summary: "Resolution analytics aggregates (JSON)",
          description:
            "Aggregated analytics over the D1 resolution event log (totals, success rate, average & " +
            "total latency, counts by method / provider / route / country, timeline, and the first page " +
            "of recent events). Filter with `?range=&country=&method=`. The human analytics page is `/analytics`.",
          parameters: [
            {
              name: "range",
              in: "query",
              schema: {
                type: "string",
                enum: ["hourly", "day", "week", "month", "ytd", "all"],
              },
            },
            { name: "country", in: "query", schema: { type: "string" } },
            { name: "method", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "Analytics summary.",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/recent": {
        get: {
          tags: ["Analytics"],
          operationId: "recent",
          summary: "Live resolution feed (cursor-paginated)",
          description:
            "One page of recent resolutions, newest first. Pass `before` = a prior response’s " +
            "`nextCursor` to page older. Respects the same `range`/`country`/`method` filters.",
          parameters: [
            {
              name: "before",
              in: "query",
              description: "Cursor from a previous `nextCursor`.",
              schema: { type: "string" },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 30, maximum: 100 },
            },
            {
              name: "range",
              in: "query",
              schema: {
                type: "string",
                enum: ["hourly", "day", "week", "month", "ytd", "all"],
              },
            },
            { name: "country", in: "query", schema: { type: "string" } },
            { name: "method", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": {
              description: "A page of recent events + nextCursor.",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      recent: { type: "array" },
                      nextCursor: { type: ["string", "null"] },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/mcp": {
        post: {
          tags: ["MCP"],
          operationId: "mcp",
          summary: "Model Context Protocol endpoint (agentic access)",
          description:
            "Streamable-HTTP **MCP** endpoint that exposes the resolver to AI agents / MCP clients " +
            "as callable tools. Point any MCP-compatible agent at this URL.\n\n" +
            "**Tools**\n" +
            "- `resolve_did` — resolve a W3C DID to its DID document with routing & resolution metadata. Args: `did`.\n" +
            "- `list_did_methods` — list configured DID method routes and featured methods.\n" +
            "- `describe_routing` — return the ordered fallback chain (ThisDID / godiddy / archon) for a method. Args: `method`.\n" +
            "- `get_resolver_health` — report resolver service status.\n\n" +
            "Transport: stateless JSON-RPC 2.0 over MCP Streamable HTTP. Use `POST /mcp`; server-to-client SSE sessions are not required by this server.",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  description: "JSON-RPC 2.0 MCP request envelope.",
                },
                example: {
                  jsonrpc: "2.0",
                  id: 1,
                  method: "tools/call",
                  params: {
                    name: "resolve_did",
                    arguments: { did: "did:web:identity.foundation" },
                  },
                },
              },
            },
          },
          responses: {
            "200": { description: "JSON-RPC 2.0 MCP response." },
            "202": {
              description: "JSON-RPC notification accepted; no response body.",
            },
            "400": {
              description: "Malformed JSON or invalid/batch JSON-RPC request.",
            },
            "413": { description: "Request body exceeds 64 KiB." },
            "415": { description: "Content-Type is not `application/json`." },
            "429": { description: "Edge rate limit exceeded." },
          },
        },
      },
    },
    components: {
      schemas: {
        MethodMeta: {
          type: "object",
          properties: {
            id: { type: "string" },
            network: { type: "string" },
            desc: { type: "string" },
            glyph: { type: "string" },
            example: { type: "string" },
            local: { type: "boolean" },
          },
          required: ["id", "network"],
        },
        DIDResolutionResult: {
          type: "object",
          properties: {
            "@context": { oneOf: [{ type: "string" }, { type: "array" }] },
            didDocument: { type: ["object", "null"] },
            didResolutionMetadata: {
              type: "object",
              properties: {
                contentType: { type: "string" },
                error: { type: "string" },
                route: { type: "string", enum: ["local", "upstream"] },
                resolver: { type: "string" },
                network: { type: "string" },
                durationMs: { type: "number" },
                via: { type: "string" },
                chain: {
                  type: "string",
                  description:
                    "Ordered fallback chain attempted, e.g. local→godiddy→archon",
                },
                attempted: { type: "array", items: { type: "string" } },
                attempts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      step: { type: "string" },
                      error: { type: "string" },
                      status: { type: "integer" },
                    },
                    required: ["step", "error"],
                  },
                },
              },
            },
            didDocumentMetadata: { type: "object" },
          },
          required: [
            "didDocument",
            "didResolutionMetadata",
            "didDocumentMetadata",
          ],
        },
      },
    },
  };
}
