/** Minimal client for the analytics `/data` endpoint, used to make the landing
 * page live (KPI strip + the routing animation's labels & total). */
const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export interface LiveTotals {
  total: number;
  liveTotal: number;
  success: number;
  /** DID correctly determined absent (DIF `notFound`) — not a failure. */
  notFound: number;
  /** Genuine resolution failures — everything unanswered that is not notFound. */
  failed: number;
  /** notFound + failed (every non-success). */
  errors: number;
  /** success / (success + failed); notFound is excluded. */
  successRate: number;
  latencyTotalMs: number;
  latencyAvgMs: number;
}

export interface LiveStatsData {
  totals: LiveTotals;
  byMethod: { key: string; count: number }[];
  byCountry: { key: string; count: number }[];
}

export async function fetchStats(): Promise<LiveStatsData | null> {
  try {
    const r = await fetch(`${API_BASE}/data?range=all`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    return (await r.json()) as LiveStatsData;
  } catch {
    return null;
  }
}

/** Cycle `labels` (or `fallback` when empty) to exactly `n` entries. */
export function fillLabels(
  labels: string[],
  n: number,
  fallback: string[],
): string[] {
  const src = labels.length ? labels : fallback;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(src[i % src.length]);
  return out;
}
