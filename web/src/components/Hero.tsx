import { useEffect, useState, type RefObject } from "react";
import { RoutingCanvas } from "./RoutingCanvas";
import { fillLabels, type LiveStatsData } from "../lib/stats";
import * as Icon from "../icons";

const DEFAULT_METHODS = [
  "did:web",
  "did:key",
  "did:algo",
  "did:nfd",
  "did:ethr",
  "did:pkh",
  "did:iden3",
];

const EXAMPLES = [
  { short: "did:web", did: "did:web:identity.foundation" },
  {
    short: "did:key",
    did: "did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK",
  },
  {
    short: "did:ethr",
    did: "did:ethr:0xb9c5714089478a327f09197987f16f9e5d936e8a",
  },
  {
    short: "did:algo",
    did: "did:algo:uti7paasilrda3ishy5m7j7lnrx2aivqjwi7zkccgkvlmfd3vpr5pwsz4i",
  },
  { short: "did:nfd", did: "did:nfd:goplausible.algo" },
  {
    short: "did:iden3",
    did: "did:iden3:polygon:amoy:xC8VZLUUfo5p9DWUawReh7QSstmYN6zR7qsQhQCsw",
  },
];
// const STATS = [
//   { value: "70+", label: "DID methods" },
//   { value: "3+", label: "Verified Providers" },
//   { value: "99.98%", label: "Global uptime" },
// ];

interface Props {
  query: string;
  setQuery: (v: string) => void;
  onClear: () => void;
  onResolve: () => void;
  onExample: (did: string) => void;
  resolving: boolean;
  progress: number;
  error: string;
  inputRef: RefObject<HTMLInputElement | null>;
  dark: boolean;
  stats: LiveStatsData | null;
}

export function Hero({
  query,
  setQuery,
  onClear,
  onResolve,
  onExample,
  resolving,
  progress,
  error,
  inputRef,
  dark,
  stats,
}: Props) {
  const topMethods = (stats?.byMethod ?? [])
    .filter((m) => m.key && m.key !== "—")
    .slice(0, 7)
    .map((m) => "did:" + m.key);
  const topCountries = (stats?.byCountry ?? [])
    .filter((c) => c.key && c.key !== "—")
    .slice(0, 7)
    .map((c) => c.key);
  const total = stats ? stats.totals.liveTotal.toLocaleString("en-US") : "";

  // Alternate the left column between DID methods and countries when we have geo
  // data — auto-cycles every 6s, or the user can pin a view via the toggle.
  const [mode, setMode] = useState<"methods" | "countries">("methods");
  const [manual, setManual] = useState(false);
  const hasGeo = topCountries.length >= 2;
  useEffect(() => {
    if (!hasGeo || manual) return;
    const id = setInterval(
      () => setMode((m) => (m === "methods" ? "countries" : "methods")),
      6000,
    );
    return () => clearInterval(id);
  }, [hasGeo, manual]);

  const visibleMode = hasGeo ? mode : "methods";
  const labels =
    visibleMode === "countries"
      ? fillLabels(topCountries, 7, topCountries)
      : fillLabels(topMethods, 7, DEFAULT_METHODS);

  return (
    <section
      id="top"
      className="hero-grid"
      style={{
        maxWidth: 1240,
        margin: "0 auto",
        padding: "14px 26px 24px",
        display: "grid",
        gridTemplateColumns: "1.02fr 1fr",
        gap: 40,
        alignItems: "center",
      }}
    >
      <div className="fu" style={{ minWidth: 0 }}>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 9,
            padding: "6px 13px",
            borderRadius: 999,
            border: "1px solid var(--border2)",
            background: "color-mix(in srgb,var(--accent) 10%, transparent)",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--accent-bright)",
            marginBottom: 22,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "var(--accent)",
              boxShadow: "0 0 0 4px var(--glow)",
            }}
          />
          DIF’s W3C DID Core-conformant resolution routing · live globally
        </div>
        <h1
          style={{
            fontFamily: "'Space Grotesk'",
            fontWeight: 700,
            fontSize: "clamp(38px,4.6vw,60px)",
            lineHeight: 1.02,
            letterSpacing: "-.03em",
            margin: "0 0 18px",
          }}
        >
          The DIF universal resolver that{" "}
          <span
            style={{
              background: "linear-gradient(115deg,var(--accent),var(--twist))",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
            }}
          >
            distributes
          </span>{" "}
          DID resolution.
        </h1>
        <p
          style={{
            fontSize: 17.5,
            lineHeight: 1.6,
            color: "var(--dim)",
            margin: "0 0 26px",
            maxWidth: 540,
          }}
        >
          DIF ThisDID universally resolves any W3C Decentralized Identifier. A
          smart rules engine matches every DID to its verified method driver and
          returns a unified, conformant document. One endpoint, every DID, every
          resolver.
        </p>

        <div style={{ position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "7px 7px 7px 18px",
              borderRadius: 16,
              background: "var(--surface)",
              border: `1.5px solid ${error ? "var(--accent)" : "var(--border2)"}`,
              boxShadow: "var(--shadow)",
              transition: "border-color .2s",
            }}
          >
            <span
              style={{
                fontFamily: "'IBM Plex Mono'",
                fontSize: 14,
                color: "var(--faint)",
                fontWeight: 600,
              }}
            >
              did:
            </span>
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onResolve();
              }}
              placeholder="paste a decentralized identifier…"
              spellCheck={false}
              style={{
                flex: 1,
                minWidth: 0,
                border: 0,
                outline: 0,
                background: "transparent",
                color: "var(--text)",
                fontFamily: "'IBM Plex Mono'",
                fontSize: 15,
                padding: "9px 2px",
              }}
            />
            {query && (
              <button
                onClick={onClear}
                title="Clear"
                style={{
                  width: 34,
                  height: 38,
                  border: 0,
                  background: "transparent",
                  cursor: "pointer",
                  color: "var(--faint)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Icon.Close />
              </button>
            )}
            <button
              onClick={onResolve}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                border: 0,
                cursor: "pointer",
                padding: "11px 20px",
                borderRadius: 11,
                background:
                  "linear-gradient(135deg,var(--accent),var(--accent-bright))",
                color: "#fff",
                fontWeight: 700,
                fontSize: 14.5,
                boxShadow: "0 8px 20px -10px var(--glow)",
              }}
            >
              {resolving ? <Icon.Spinner /> : <Icon.Search />}
              <span>{resolving ? "Resolving" : "Resolve"}</span>
            </button>
          </div>
          {resolving && (
            <div
              style={{
                height: 3,
                borderRadius: 3,
                margin: "10px 4px 0",
                background: "var(--border)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progress}%`,
                  background:
                    "linear-gradient(90deg,var(--accent),var(--twist))",
                  borderRadius: 3,
                  transition: "width .2s",
                }}
              />
            </div>
          )}
          {error && (
            <div
              style={{
                marginTop: 10,
                fontSize: 13.5,
                color: "var(--accent-bright)",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 16,
            alignItems: "center",
          }}
        >
          <span
            style={{ fontSize: 12.5, color: "var(--faint)", fontWeight: 600 }}
          >
            Try:
          </span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.short}
              onClick={() => onExample(ex.did)}
              style={{
                border: "1px solid var(--border)",
                background: "var(--surface2)",
                color: "var(--dim)",
                fontFamily: "'IBM Plex Mono'",
                fontSize: 12,
                fontWeight: 500,
                padding: "6px 11px",
                borderRadius: 8,
                cursor: "pointer",
              }}
            >
              {ex.short}
            </button>
          ))}
        </div>

        {/* <div style={{ display: "flex", gap: 28, marginTop: 30 }}>
          {STATS.map((s) => (
            <div key={s.label}>
              <div
                style={{
                  fontFamily: "'Space Grotesk'",
                  fontWeight: 700,
                  fontSize: 23,
                  letterSpacing: "-.02em",
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--faint)",
                  fontWeight: 600,
                  marginTop: 2,
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div> */}
      </div>

      <div
        className="fu"
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          minHeight: 320,
          borderRadius: 24,
          overflow: "hidden",
          border: "1px solid var(--border)",
          background:
            "linear-gradient(160deg,var(--bg2),color-mix(in srgb,var(--surface) 60%, transparent))",
          boxShadow: "var(--shadow)",
        }}
      >
        <RoutingCanvas
          dark={dark}
          labels={labels}
          total={total}
          countryMode={visibleMode === "countries"}
        />
        {hasGeo && (
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 16,
              display: "flex",
              gap: 3,
              padding: 3,
              borderRadius: 10,
              background: "color-mix(in srgb,var(--surface) 82%, transparent)",
              border: "1px solid var(--border)",
              backdropFilter: "blur(6px)",
            }}
          >
            {(["methods", "countries"] as const).map((m) => {
              const active = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => {
                    setManual(true);
                    setMode(m);
                  }}
                  title={
                    m === "methods" ? "Show DID methods" : "Show countries"
                  }
                  style={{
                    border: 0,
                    cursor: "pointer",
                    fontFamily: "'IBM Plex Mono'",
                    fontSize: 10.5,
                    fontWeight: 600,
                    letterSpacing: ".02em",
                    padding: "4px 9px",
                    borderRadius: 7,
                    color: active ? "#fff" : "var(--dim)",
                    background: active
                      ? "linear-gradient(135deg,var(--accent),var(--accent-bright))"
                      : "transparent",
                  }}
                >
                  {m === "methods" ? "DIDs" : "Geo"}
                </button>
              );
            })}
          </div>
        )}
        <div
          style={{
            position: "absolute",
            left: 16,
            bottom: 14,
            display: "flex",
            flexWrap: "wrap",
            gap: "6px 13px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--dim)",
          }}
        >
          <Legend c="var(--accent)" label="Answered by ThisDID" />
          <Legend c="var(--res-b)" label="Godiddy" href="https://godiddy.com" />
          <Legend
            c="var(--twist)"
            label="GoPlausible"
            href="https://goplausible.com"
          />
          <Legend
            c="var(--res-c)"
            label="Archon"
            href="https://archon.technology"
          />
        </div>
        <div
          style={{
            position: "absolute",
            right: 16,
            top: 14,
            fontFamily: "'IBM Plex Mono'",
            fontSize: 10.5,
            letterSpacing: ".14em",
            color: "var(--faint)",
            fontWeight: 600,
          }}
        >
          UNIVERSAL RESOLVER
        </div>
      </div>
    </section>
  );
}

const Legend = ({
  c,
  label,
  href,
}: {
  c: string;
  label: string;
  href?: string;
}) => {
  const dot = (
    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
  );
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`${label} resolver`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          color: "var(--dim)",
          textDecoration: "none",
        }}
      >
        {dot}
        {label}
      </a>
    );
  }
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
      {dot}
      {label}
    </span>
  );
};
