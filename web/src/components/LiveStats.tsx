import type { LiveStatsData } from "../lib/stats";

const fmt = (n: number) => n.toLocaleString("en-US");

const card = {
  padding: "18px 20px",
  border: "1px solid var(--border)",
  borderRadius: 16,
  background: "var(--surface)",
} as const;
const val = {
  fontFamily: "'Space Grotesk'",
  fontWeight: 700,
  fontSize: 28,
  letterSpacing: "-.02em",
} as const;
const label = {
  fontSize: 11.5,
  color: "var(--faint)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  marginTop: 6,
} as const;
const sub = { fontSize: 12, color: "var(--dim)", marginTop: 3 } as const;

/** The five all-time resolver metrics, mirrored from the dashboard, on the landing page.
 * While the first /data fetch is in flight, each value shows its own skeleton shimmer
 * (labels are static, so only the data-dependent parts skeletonize). */
export function LiveStats({
  stats,
  loading = false,
}: {
  stats: LiveStatsData | null;
  loading?: boolean;
}) {
  const t = stats?.totals;
  const pending = loading && !t;
  const cards: { v: string; l: string; s?: string; hasSub?: boolean }[] = [
    { v: t ? fmt(t.liveTotal) : "—", l: "Total resolutions" },
    {
      v: t ? fmt(t.success) : "—",
      l: "Success",
      s: t ? `${t.successRate}%` : undefined,
      hasSub: true,
    },
    { v: t ? fmt(t.errors) : "—", l: "Not found" },
    { v: t ? `${fmt(t.latencyTotalMs)} ms` : "—", l: "Total latency" },
    { v: t ? `${fmt(t.latencyAvgMs)} ms` : "—", l: "Avg latency" },
  ];
  return (
    <section
      style={{ maxWidth: 1240, margin: "0 auto", padding: "8px 26px 8px" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))",
          gap: 14,
        }}
      >
        {cards.map((c) => (
          <div key={c.l} style={card}>
            {pending ? (
              <div
                className="skel"
                style={{ height: 24, width: "72%", margin: "4px 0" }}
              />
            ) : (
              <div style={val}>{c.v}</div>
            )}
            <div style={label}>{c.l}</div>
            {pending && c.hasSub ? (
              <div
                className="skel"
                style={{ height: 11, width: "38%", marginTop: 5 }}
              />
            ) : c.s ? (
              <div style={sub}>{c.s}</div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
