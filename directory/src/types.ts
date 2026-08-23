/** Bindings for the thisdid-directory Worker (see wrangler.jsonc). */
export interface Env {
  /**
   * Shared analytics D1 — the directory's ONLY storage (D1-only by design,
   * no KV): reads the event logs + phase-0 rollups, writes solely its own
   * `directory_store` table.
   */
  DB?: D1Database;
}

/** A method's disposition in the ThisDID engine. */
export type MethodStatus =
  | "edge" // Tier-1 local TypeScript driver
  | "upstream" // long tail, routed to upstream Universal Resolvers
  | "parked" // driver built but deliberately unbound
  | "no-go" // researched: dead/sunset project — evidence on the profile
  | "bench" // wave candidate, not yet promoted
  | "excluded"; // maintainer decision (served elsewhere)

export interface MethodLink {
  label: string;
  url: string;
}

/** Hand-curated half of a method profile (data/methods.ts). */
export interface CuratedMethod {
  /** Display name; defaults to `did:<id>`. */
  name?: string;
  /** One-line summary for the grid card. */
  summary: string;
  /** Research body — plain paragraphs, `[text](url)` links allowed. */
  research?: string;
  links?: MethodLink[];
  /** Disposition override for methods that are not edge/upstream. */
  status?: MethodStatus;
  statusReason?: string;
  lastReviewed?: string; // ISO date
}

/** The assembled profile served by pages + API. */
export interface MethodProfile {
  id: string;
  name: string;
  status: MethodStatus;
  probation: boolean;
  summary: string;
  research?: string;
  links: MethodLink[];
  statusReason?: string;
  lastReviewed?: string;
  network?: string;
  example?: string;
  /** Ordered routing chain, empty when not routed. */
  chain: string[];
  /**
   * Probation only: provider tags able to independently verify this method
   * (empty = no upstream anywhere resolves it — served honestly unverified).
   */
  probationVerifiers?: string[];
  /** From the DIF sync, when present. */
  dif?: {
    recommended?: string; // findings URL
    endorsed?: string;
    dockerDriver?: { image?: string; repo?: string; hub?: string };
  };
}

/** Live per-method numbers computed from D1 (cached in KV). */
export interface MethodScores {
  resolutions24h: number;
  resolutions7d: number;
  resolutions30d: number;
  /** 0–100 log-scaled rank over 30d volume; null when no traffic anywhere. */
  popularity: number | null;
  /** 0–100 success ratio over 7d; null when no traffic. */
  availability: number | null;
  /** Probe canary ok-ratio over 24h for edge methods; null otherwise. */
  canary24h: number | null;
  /** Probation double-checks over 30d (from the daily rollups). */
  verificationMatch30d: number;
  verificationMismatch30d: number;
}

export interface ScoreTable {
  computedAt: number;
  methods: Record<string, MethodScores>;
}

/** A resolver provider in the ThisDID engine. */
export interface ProviderProfile {
  id: string; // thisdid | goplausible | godiddy | archon
  /** Analytics tag used in the D1 event logs. */
  tag: string; // ThisDID | GoPlausible | godiddy | archon
  name: string;
  kind: string;
  operator: string;
  baseUrl?: string;
  auth: string;
  summary: string;
  methods: string[];
  links: MethodLink[];
}

/** One provider's aggregates over a window (from provider_stats_hourly). */
export interface ProviderWindow {
  probesTotal: number;
  probesOk: number;
  probesRateLimited: number;
  probesTimeout: number;
  probeLatencyAvgMs: number | null;
  /** MAX of the hourly p95s in the window — the WORST hour, not a window percentile. */
  probeLatencyWorstP95Ms: number | null;
  resolutionsTotal: number;
  resolutionsOk: number;
  resolutionLatencyAvgMs: number | null;
  verificationMatch: number;
  verificationMismatch: number;
  statusTransitions: number;
}

/** The reliability composite, with its component breakdown (all 0–100). */
export interface ReliabilityScore {
  score: number | null;
  components: {
    successConsistency: number | null;
    stability: number | null;
    latencyDiscipline: number | null;
    throttleBehavior: number | null;
    verificationAgreement: number | null;
  };
}

export interface ProviderScores {
  /** up | degraded | down | unknown — from the last ~15 min of probes. */
  statusNow: string;
  availability24h: number | null;
  availability7d: number | null;
  reliability: ReliabilityScore;
  /** Share of routed resolutions over 7d, 0–100. */
  share7d: number | null;
  windows: { h24: ProviderWindow; d7: ProviderWindow; d30: ProviderWindow };
}

export interface ProviderScoreTable {
  computedAt: number;
  providers: Record<string, ProviderScores>;
}

/** Normalized result of the daily DIF registry sync. */
export interface DifRegistry {
  /** Stored-schema version — bump on shape changes; mismatches fall back. */
  v: number;
  syncedAt: number;
  /** Distinct method ids advertised by the universal-resolver compose file. */
  composeMethods: string[];
  /**
   * Approved, merged resolver docker containers in the DIF Universal
   * Resolver repository, per method: image (compose), source repo and
   * Docker Hub page (README driver table).
   */
  drivers: Record<string, { image?: string; repo?: string; hub?: string }>;
  recommended: { id: string; url: string }[];
  endorsed: { id: string; url: string }[];
}
