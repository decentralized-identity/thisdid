/**
 * thisdid-directory — the public DID method directory, served under the MAIN
 * origin at thisdid.com/directory (directory phase 1).
 *
 * D1-only by design: shares the analytics D1 (raw logs + phase-0 rollups)
 * and writes solely its own `directory_store` table. Never on the
 * resolution request path.
 *
 *   GET /directory                → method grid (search + filters + scores)
 *   GET /directory/method/:id     → method profile (research, links, routing)
 *   GET /directory/api/methods    → all profiles + scores (JSON)
 *   GET /directory/api/methods/:id→ one profile + scores (JSON)
 *   cron (daily)                  → DIF registry sync (compose + did-methods)
 */
import { buildProfiles } from "./data/methods";
import { PROVIDERS, PROVIDER_BY_ID } from "./data/providers";
import { loadRegistry, syncRegistry } from "./dif";
import {
  homePage,
  joinPage,
  methodPage,
  providerPage,
  providersPage,
} from "./pages";
import { getProviderScores } from "./provider-scores";
import { getScores } from "./scores";
import type { Env } from "./types";

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=60",
    },
  });

const html = (page: string): Response =>
  new Response(page, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=60",
    },
  });

/** The directory lives under the main origin at this prefix. */
const BASE = "/directory";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const raw = url.pathname.replace(/\/+$/, "") || "/";

    // Everything serves under /directory (the production route only matches
    // that prefix); bare paths — a local-dev convenience — redirect in.
    if (raw !== BASE && !raw.startsWith(`${BASE}/`)) {
      return Response.redirect(
        new URL(BASE + (raw === "/" ? "" : raw), url).toString(),
        302,
      );
    }
    const path = raw === BASE ? "/" : raw.slice(BASE.length);
    const now = Date.now();

    if (path === "/health") {
      return json({ ok: true, service: "thisdid-directory" });
    }

    if (path === "/providers") {
      return html(providersPage(PROVIDERS, await getProviderScores(env, now)));
    }
    if (path === "/join") {
      return html(joinPage());
    }
    if (path === "/api/providers") {
      const table = await getProviderScores(env, now);
      return json({
        computedAt: table.computedAt,
        providers: PROVIDERS.map((p) => ({
          ...p,
          scores: table.providers[p.id] ?? null,
        })),
      });
    }
    const providerApi = path.match(/^\/api\/providers\/([a-z0-9]+)$/);
    if (providerApi) {
      const provider = PROVIDER_BY_ID.get(providerApi[1]);
      if (!provider) return json({ error: "unknown provider" }, 404);
      const table = await getProviderScores(env, now);
      return json({
        ...provider,
        scores: table.providers[provider.id] ?? null,
      });
    }
    const providerPageMatch = path.match(/^\/provider\/([a-z0-9]+)$/);
    if (providerPageMatch) {
      const provider = PROVIDER_BY_ID.get(providerPageMatch[1]);
      if (!provider) return new Response("Unknown provider", { status: 404 });
      const table = await getProviderScores(env, now);
      return html(providerPage(provider, table.providers[provider.id]));
    }

    const registry = await loadRegistry(env);
    const profiles = buildProfiles(registry);

    if (path === "/") {
      const scores = await getScores(env, now);
      return html(homePage(profiles, scores, registry.syncedAt));
    }

    if (path === "/api/methods") {
      const scores = await getScores(env, now);
      return json({
        syncedAt: registry.syncedAt,
        methods: profiles.map((p) => ({
          ...p,
          scores: scores.methods[p.id] ?? null,
        })),
      });
    }

    const apiMatch = path.match(/^\/api\/methods\/([a-z0-9]+)$/);
    if (apiMatch) {
      const profile = profiles.find((p) => p.id === apiMatch[1]);
      if (!profile) return json({ error: "unknown method" }, 404);
      const scores = await getScores(env, now);
      return json({ ...profile, scores: scores.methods[profile.id] ?? null });
    }

    const pageMatch = path.match(/^\/method\/([a-z0-9]+)$/);
    if (pageMatch) {
      const profile = profiles.find((p) => p.id === pageMatch[1]);
      if (!profile) {
        return new Response("Unknown method", { status: 404 });
      }
      const scores = await getScores(env, now);
      return html(methodPage(profile, scores.methods[profile.id]));
    }

    return Response.redirect(new URL(BASE, url).toString(), 302);
  },

  async scheduled(_ctrl, env, ctx) {
    ctx.waitUntil(syncRegistry(env, Date.now()));
  },
} satisfies ExportedHandler<Env>;
