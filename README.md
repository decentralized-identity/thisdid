# thisDID

**thisDID.com** is a Universal **W3C DID Resolver** — one endpoint that resolves any
Decentralized Identifier and returns a unified, DID-Core & DIF-conformant resolution result.

A smart **routing engine** matches every DID to the right method driver: common methods are
resolved in-Worker by bundled drivers, and the long tail is routed to redundant upstream
Universal Resolvers with failover. The same edge Worker serves the marketing/landing SPA and the
JSON resolver API from a single origin via content negotiation.

> v2 is a ground-up rewrite. The previous CRA/MUI app (wallet connect, DID-URL shortener, credit,
> WebAuthn) has been removed; this repo is now resolver-only. History is preserved in git.

---

## Architecture

```
┌────────────────────────── thisdid.com (one origin) ──────────────────────────┐
│  Cloudflare Worker  (root: src/, wrangler.jsonc)                              │
│                                                                              │
│   GET /                     Accept: text/html   → landing SPA (via ASSETS)   │
│                             Accept: */json      → API service info           │
│   GET /:did                 Accept: */json      → resolve (deep link)        │
│   GET /1.0/identifiers/:did                      → DIF Universal Resolver     │
│   GET /methods /health /openapi.json /docs       → discovery + Swagger UI     │
│                                                                              │
│   resolve()  ──►  routing registry (src/resolvers/registry.ts)               │
│                     per-method ordered chain of:                             │
│                     ├─ local   → vendored did-resolver core + drivers        │
│                     ├─ godiddy → api.godiddy.com (upstream, API key)         │
│                     └─ archon  → resolver.archon.technology (upstream)       │
└──────────────────────────────────────────────────────────────────────────────┘
        ▲ static assets = web/dist (Vite + React + TS SPA, deployable as Pages)
        ▲ vendor/did-resolver = DIF did-resolver core (git submodule)
```

| Path | What it is |
|---|---|
| `src/` | The Cloudflare Worker — the ThisDID Resolver API and SPA host. |
| `web/` | The landing-page SPA (Vite + React + TypeScript). Builds to `web/dist`. |
| `vendor/did-resolver` | Vendored DIF [`did-resolver`](https://github.com/GoPlausible/did-resolver) core, as a **git submodule**. |
| `wrangler.jsonc` | Worker + static-assets config. |

### Smart routing

Every DID method is resolved through an **ordered fallback chain** defined in
[`src/resolvers/registry.ts`](src/resolvers/registry.ts). Each step is one of:

- **`local`** — resolved in-Worker (thisDID itself) by a bundled driver on the vendored
  `did-resolver` core. `did:web` ships today; more pure-JS drivers register in
  [`src/resolvers/local.ts`](src/resolvers/local.ts).
- **`goplausible`** — routed to the [GoPlausible](https://goplausible.com) Universal Resolver
  (`goplausible.xyz/api/1.0/identifiers`), the Algorand-native resolver. Open, no key.
- **`godiddy`** — routed to the [Godiddy](https://godiddy.com) Universal Resolver
  (`api.godiddy.com`, by Danube Tech). **Requires an API key** (`Authorization: Bearer`).
- **`archon`** — routed to the [Archon](https://archon.technology) Universal Resolver
  (`resolver.archon.technology`), which runs the iden3 & did:cid drivers. Open, no key.

The chain is tried top-to-bottom; the first step that returns a usable DID document wins,
otherwise the next step is attempted (or the last error is returned if all fail).

#### Routing flows

```
did:iden3:…                          any other method (did:web, did:indy, …)
────────────                         ──────────────────────────────────────
                                   
  ┌─────────┐  hit? ──► return        ┌─────────┐  hit? ──► return
  │ Archon  │                         │ thisDID │
  └────┬────┘                         │ (local) │
       │ miss / error                 └────┬────┘
       ▼                                   │ miss / error
  ┌─────────┐  hit? ──► return             ▼
  │ thisDID │                         ┌─────────┐  hit? ──► return
  │ (local) │                         │ Godiddy │
  └────┬────┘                         └────┬────┘
       │ miss / error                      │ miss / error
       ▼                                   ▼
  ┌─────────┐  hit? ──► return        ┌─────────┐  hit? ──► return
  │ Godiddy │                         │ Archon  │
  └────┬────┘                         └────┬────┘
       │ all miss                          │ all miss
       ▼                                   ▼
   404 notFound                        404 notFound
```

| Method | Chain (in order) |
|---|---|
| `algo`, `nfd` | **GoPlausible** → Godiddy → Archon |
| `iden3` | **Archon** → thisDID (local) → Godiddy |
| *all others* | **thisDID (local)** → Godiddy → Archon |

Every response's `didResolutionMetadata` is extended with `route` (`local`/`upstream`),
`resolver`, `network`, `durationMs`, `via` (the upstream base that answered), and `chain`
(e.g. `local→godiddy→archon`) so clients — and the SPA route banner — can see exactly how a DID
was resolved. Change a method's routing by editing `ROUTE_CHAINS` in the registry.

---

## Getting started

Requires **Node ≥ 20** and the repo cloned **with submodules**:

```bash
git clone --recurse-submodules https://github.com/GoPlausible/this-did
# already cloned? →  git submodule update --init --recursive

npm install            # installs all workspaces (root Worker, web/, vendor/)
npm run build          # builds the vendored did-resolver lib + the SPA
```

> Installs are gated through [Socket](https://socket.dev): use `socket npm install`.

### Develop

```bash
npm run dev            # Worker + resolver API + built SPA on http://localhost:8787
npm run dev:web        # Vite HMR dev server on http://localhost:5173 (proxies /1.0, /methods to :8787)
```

For live SPA editing run both: `npm run dev` in one terminal, `npm run dev:web` in another.

### Build & deploy

```bash
npm run build          # → vendor/did-resolver/lib + web/dist
npm run deploy         # builds, then `wrangler deploy`
```

The Worker serves `web/dist` through its `ASSETS` binding, so a single `wrangler deploy` ships both
the API and the SPA. `web/` can also be deployed independently as a Cloudflare **Pages** project
(point it at the Worker with `VITE_API_BASE`).

---

## API

Base: `https://thisdid.com`

| Method | Path | Description |
|---|---|---|
| `GET` | `/1.0/identifiers/{did}` | Resolve a DID (DIF Universal Resolver HTTP binding). |
| `GET` | `/{did}` (Accept: json) | Resolve via a root deep link. |
| `GET` | `/methods` | Supported method metadata + full driver list. |
| `GET` | `/health` | Liveness probe. |
| `GET` | `/openapi.json` | OpenAPI 3.1 spec. |
| `GET` | `/docs` | Swagger UI. |
| `POST` | `/mcp` | Model Context Protocol endpoint (agentic access). |
| `GET` | `/dashboard` | Resolution analytics dashboard (HTML; JSON with `Accept: application/json`). |
| `GET` | `/data` | Analytics aggregates (JSON). |
| `GET` | `/recent` | Live resolution feed, cursor-paginated (`?before=&limit=`). |

```bash
curl -H 'Accept: application/json' https://thisdid.com/1.0/identifiers/did:web:identity.foundation
```

Errors follow the DIF binding: `invalidDid` → 400, `notFound` → 404, `unsupportedDidMethod` → 501,
`representationNotSupported` → 406.

### MCP (agentic access)

`POST /mcp` is a Model Context Protocol (Streamable-HTTP, JSON-RPC 2.0) endpoint that exposes the
resolver to AI agents / MCP clients as callable tools — point any MCP-compatible agent at
`https://thisdid.com/mcp`:

| Tool | Description | Args |
|---|---|---|
| `resolve_did` | Resolve a W3C DID to its DID document with routing & resolution metadata. | `did` |
| `list_did_methods` | List supported DID methods (featured + full driver list). | — |
| `describe_routing` | Return the ordered fallback chain (thisDID / godiddy / archon) for a method. | `method` |
| `get_resolver_health` | Report resolver service status. | — |

### Analytics (`/dashboard`)

Every resolution request is recorded and surfaced at **`/dashboard`** (a live, self-refreshing
dashboard) with a filterable **`/data`** JSON API. Storage uses **both** Cloudflare stores:

- **D1** (`DB`) — the authoritative event log: one row per resolution, tagged with `provider`
  (`thisDID`/`godiddy`/`archon`), `resolver`, `route`, `duration_ms`, `country`, `method` and more
  ([`migrations/0001_init.sql`](migrations/0001_init.sql)). All aggregates are SQL over it.
- **KV** (`STATS_KV`) — a live lifetime counter plus a short-TTL read-through cache of the unfiltered
  summaries, so the dashboard stays fast and cheap.

The dashboard shows:

- **Metrics** — total / success / failure, success rate, **total latency** and average latency.
- **Charts** — a requests-over-time **timeline**, a **routed-to pie**, a **by-method bar chart**, a
  **horizontal by-country bar chart**, a **latency-by-provider comparison** (avg / min / max), and a
  full-width **request-activity heatmap** (GitHub-style, daily over the last ~53 weeks).
- **Leaderboards** — tabbed by **method / routed-to / country / resolver**.
- **Filters** — by **scope** (Hourly / Day / Week / Month / YTD / All time — each with the matching
  bucket granularity), **country** and **method**.
- **Live feed** — recent requests with provider & resolver tags, geo, status and latency,
  auto-refreshing, with a **"Load older"** button (cursor pagination).

`/data` accepts `?range=`, `?country=` and `?method=`. The feed pages via **`/recent`**
(`?before=<cursor>&limit=<n>` + the same filters), returning `{ recent, nextCursor }`.

Recording is fire-and-forget (`ctx.waitUntil`) and never affects resolution latency or success.
**GDPR-friendly:** no IP addresses, no cookies, no user-agents — only coarse `cf.country`, the
requested DID (the resource, like a URL in a server log) and timing are stored.

**Setup** (once — then paste the ids into `wrangler.jsonc`):

```bash
wrangler d1 create thisdid-analytics                 # → database_id
wrangler kv namespace create STATS_KV                # → id

wrangler d1 migrations apply thisdid-analytics --local    # local dev
wrangler d1 migrations apply thisdid-analytics --remote   # production
```

Until `DB` is bound the dashboard renders a setup notice; resolution keeps working regardless.

### Configuration

Public config lives in `wrangler.jsonc` → `vars`:

| Var | Purpose |
|---|---|
| `GOPLAUSIBLE_RESOLVER` | GoPlausible Universal Resolver base (DID appended as `/{did}`). |
| `GODIDDY_RESOLVER` | Godiddy Universal Resolver base (DID appended as `/{did}`). |
| `ARCHON_RESOLVER` | Archon Universal Resolver base (DID appended as `/{did}`). |
| `RESOLVER_LABEL` | Service label reported by `/health`. |

Godiddy requires an API key, kept as a **secret** (never committed):

```bash
# production
wrangler secret put GODIDDY_API_KEY

# local dev — copy the template and fill it in (.dev.vars is gitignored)
cp .dev.vars.example .dev.vars
```

Without a `GODIDDY_API_KEY`, the Godiddy step is skipped (401) and the chain falls through to the
next resolver, so resolution still works for methods Archon or thisDID can serve.

---

## Design

The landing page implements the high-fidelity handoff in
[`.notes/design_handoff_thisdid_resolver`](.notes/design_handoff_thisdid_resolver) — coral-with-a-twist
palette, dark/light/system theming, the animated smart-routing diagram, and componentized Overview /
JSON result views.

## License

Apache-2.0. See [LICENSE](LICENSE).
