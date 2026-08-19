import type { ReactNode } from "react";
import {
  ALL_METHODS,
  exampleFor,
  FEATURED_METHODS,
  mixHex,
} from "../lib/methods";
import * as Icon from "../icons";

const h2 = {
  fontFamily: "'Space Grotesk'",
  fontWeight: 700,
  fontSize: "clamp(28px,3.2vw,40px)",
  letterSpacing: "-.02em",
  margin: "0 0 12px",
  lineHeight: 1.08,
} as const;
const lead = {
  fontSize: 16,
  lineHeight: 1.6,
  color: "var(--dim)",
  margin: 0,
} as const;
const eyebrow = (color: string) =>
  ({
    fontSize: 12.5,
    fontWeight: 700,
    letterSpacing: ".14em",
    textTransform: "uppercase",
    color,
    marginBottom: 12,
  }) as const;

const ACC = "#d97757";
const TW = "#b587f0";

const STEPS: {
  num: string;
  title: string;
  body: string;
  icon: ReactNode;
  accent: boolean;
}[] = [
  {
    num: "01",
    title: "Parse & classify",
    body: "The DID is parsed and matched against the method registry to identify its resolution strategy.",
    icon: <Icon.Brackets size={20} />,
    accent: true,
  },
  {
    num: "02",
    title: "Rules engine",
    body: "A policy engine uses method preference and live route health to order the fallback chain.",
    icon: <Icon.Gear size={20} />,
    accent: false,
  },
  {
    num: "03",
    title: "Dispatch to driver",
    body: "The request is dispatched through the ordered chain until a driver returns a usable document.",
    icon: <Icon.Nodes size={20} />,
    accent: true,
  },
  {
    num: "04",
    title: "Normalize & return",
    body: "The DID resolution result is returned with transparent route and attempt metadata.",
    icon: <Icon.Shield size={20} />,
    accent: false,
  },
];

export function HowItWorks() {
  return (
    <section
      id="how"
      style={{ maxWidth: 1240, margin: "0 auto", padding: "66px 26px 20px" }}
    >
      <div style={{ maxWidth: 760, marginBottom: 34 }}>
        <div style={eyebrow("var(--accent)")}>How ThisDID resolves</div>
        <h2 style={h2}>Two resolver flavors. One intelligent edge.</h2>
        <p style={lead}>
          The DIF ecosystem offers a container-based Universal Resolver and an
          embeddable TypeScript DID Resolver. ThisDID combines both: fast
          methods resolve close to the request in isolated TypeScript Workers,
          while its smart routing engine distributes the broader method catalog
          across compatible Universal Resolver deployments with health-aware
          failover.
        </p>
      </div>
      <div
        className="resolver-flavors"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 72px 1fr",
          gap: 16,
          alignItems: "stretch",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            padding: 24,
            borderRadius: 20,
            border:
              "1px solid color-mix(in srgb,var(--accent) 32%,var(--border))",
            background:
              "linear-gradient(145deg,color-mix(in srgb,var(--accent) 10%,var(--surface)),var(--surface))",
          }}
        >
          <div style={eyebrow("var(--accent)")}>Flavor 01 · embedded</div>
          <div
            style={{
              fontFamily: "'Space Grotesk'",
              fontWeight: 700,
              fontSize: 21,
            }}
          >
            TypeScript DID Resolver
          </div>
          <p style={{ ...lead, fontSize: 14, marginTop: 10 }}>
            DIF&apos;s lightweight{" "}
            <a
              href="https://github.com/decentralized-identity/did-resolver"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--accent)", fontWeight: 700 }}
            >
              did-resolver
            </a>{" "}
            library is embedded directly with compatible TypeScript method
            packages. ThisDID runs each package in its own private driver
            Worker, keeping startup, dependencies, RPC configuration, and
            failures isolated while providing a low-latency path at the edge.
          </p>
          <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
            {[
              "Embedded library + method package",
              "Private Service Binding",
              "Fast local/offline or direct-RPC resolution",
            ].map((item) => (
              <div key={item} style={{ fontSize: 12.5, color: "var(--dim)" }}>
                <span style={{ color: "var(--accent)", marginRight: 8 }}>
                  ●
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>

        <div
          className="flavor-join"
          aria-hidden="true"
          style={{
            display: "grid",
            placeItems: "center",
            color: "var(--faint)",
            fontFamily: "'IBM Plex Mono'",
            fontSize: 20,
          }}
        >
          ⇄
        </div>

        <div
          style={{
            padding: 24,
            borderRadius: 20,
            border:
              "1px solid color-mix(in srgb,var(--twist) 34%,var(--border))",
            background:
              "linear-gradient(145deg,color-mix(in srgb,var(--twist) 11%,var(--surface)),var(--surface))",
          }}
        >
          <div style={eyebrow("var(--twist)")}>Flavor 02 · distributed</div>
          <div
            style={{
              fontFamily: "'Space Grotesk'",
              fontWeight: 700,
              fontSize: 21,
            }}
          >
            Container-based Universal Resolver
          </div>
          <p style={{ ...lead, fontSize: 14, marginTop: 10 }}>
            The DIF{" "}
            <a
              href="https://github.com/decentralized-identity/universal-resolver"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "var(--twist)", fontWeight: 700 }}
            >
              Universal Resolver
            </a>{" "}
            provides a driver-based framework commonly deployed as containers,
            allowing many independently implemented DID methods to share one
            interoperable HTTP interface. ThisDID supports these deployments as
            distributed upstream resolution capacity instead of bundling every
            container and driver into its edge Worker.
          </p>
          <div style={{ marginTop: 18, display: "grid", gap: 8 }}>
            {[
              "Containerized method-driver ecosystem",
              "DIF Universal Resolver HTTP binding",
              "Broad method coverage across providers",
            ].map((item) => (
              <div key={item} style={{ fontSize: 12.5, color: "var(--dim)" }}>
                <span style={{ color: "var(--twist)", marginRight: 8 }}>●</span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: "20px 24px",
          borderRadius: 18,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
          marginBottom: 26,
        }}
      >
        <div
          className="resolution-flow"
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr auto 1fr auto",
            alignItems: "center",
            gap: 14,
            textAlign: "center",
          }}
        >
          <strong>DID request</strong>
          <span style={{ color: "var(--faint)" }}>──►</span>
          <strong style={{ color: "var(--accent)" }}>
            health-aware smart routing
          </strong>
          <span style={{ color: "var(--faint)" }}>──►</span>
          <strong>DIF resolution result</strong>
        </div>
        <div
          style={{
            marginTop: 12,
            textAlign: "center",
            fontSize: 13,
            color: "var(--dim)",
          }}
        >
          TypeScript driver first where configured · distributed resolver chain
          for broader coverage · timeouts, document validation, failover, route
          metadata, and normalization applied centrally
        </div>
      </div>

      <div style={{ ...eyebrow("var(--faint)"), marginBottom: 14 }}>
        Resolution lifecycle
      </div>
      <div
        className="steps-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 16,
        }}
      >
        {STEPS.map((st) => (
          <div
            key={st.num}
            style={{
              padding: 22,
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                fontFamily: "'Space Grotesk'",
                fontWeight: 700,
                fontSize: 13,
                color: "var(--faint)",
                marginBottom: 16,
              }}
            >
              {st.num}
            </div>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                display: "grid",
                placeItems: "center",
                marginBottom: 14,
                background: `color-mix(in srgb,var(${st.accent ? "--accent" : "--twist"}) ${st.accent ? 14 : 16}%,transparent)`,
                color: `var(${st.accent ? "--accent" : "--twist"})`,
              }}
            >
              {st.icon}
            </div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 7 }}>
              {st.title}
            </div>
            <div
              style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--dim)" }}
            >
              {st.body}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Methods({ onResolve }: { onResolve: (did: string) => void }) {
  const graded = FEATURED_METHODS.map((m, i) => ({
    ...m,
    color: mixHex(
      ACC,
      TW,
      FEATURED_METHODS.length > 1 ? i / (FEATURED_METHODS.length - 1) : 0,
    ),
  }));
  return (
    <section
      id="methods"
      style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 26px 20px" }}
    >
      <div style={{ maxWidth: 640, marginBottom: 28 }}>
        <div style={eyebrow("var(--twist)")}>Supported methods</div>
        <h2 style={h2}>One endpoint. Local and routed methods.</h2>
        <p style={lead}>
          ThisDID resolves package-backed methods through isolated TypeScript
          driver Workers and sends its configured method catalog through
          redundant upstream providers. Availability is reported live.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))",
          gap: 14,
        }}
      >
        {graded.map((m) => (
          <button
            key={m.id}
            onClick={() => onResolve(m.example)}
            style={{
              textAlign: "left",
              cursor: "pointer",
              padding: 18,
              borderRadius: 16,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            <span
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <span
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 11,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "'Space Grotesk'",
                  fontWeight: 700,
                  fontSize: 16,
                  color: m.color,
                  background: `color-mix(in srgb, ${m.color} 16%, var(--surface2))`,
                  border: `1px solid color-mix(in srgb, ${m.color} 28%, transparent)`,
                }}
              >
                {m.glyph}
              </span>
              {m.probation && (
                <span
                  style={{
                    fontSize: 9.5,
                    fontWeight: 800,
                    letterSpacing: ".06em",
                    textTransform: "uppercase",
                    color: "var(--res-c)",
                    background:
                      "color-mix(in srgb, var(--res-c) 12%, transparent)",
                    border:
                      "1px solid color-mix(in srgb, var(--res-c) 45%, transparent)",
                    padding: "2px 7px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  New · under test
                </span>
              )}
            </span>
            <div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono'",
                  fontWeight: 600,
                  fontSize: 14.5,
                  color: "var(--text)",
                }}
              >
                {m.name}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--dim)",
                  marginTop: 5,
                  lineHeight: 1.4,
                }}
              >
                {m.desc}
              </div>
            </div>
          </button>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          margin: "30px 0 16px",
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: ".08em",
            color: "var(--faint)",
            whiteSpace: "nowrap",
          }}
        >
          Configured method routes
        </span>
        <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {ALL_METHODS.filter(
          (id) => !FEATURED_METHODS.some((m) => m.id === id),
        ).map((id) => {
          const example = exampleFor(id);
          return (
            <button
              key={id}
              disabled={!example}
              title={
                example
                  ? `Resolve ${example}`
                  : "No verified example DID available"
              }
              onClick={() => example && onResolve(example)}
              style={{
                fontFamily: "'IBM Plex Mono'",
                fontSize: 12.5,
                fontWeight: 500,
                color: "var(--dim)",
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "7px 12px",
                borderRadius: 9,
                cursor: example ? "pointer" : "not-allowed",
                opacity: example ? 1 : 0.55,
              }}
            >
              did:{id}
            </button>
          );
        })}
      </div>
    </section>
  );
}

const PROVIDERS = [
  {
    name: "Godiddy",
    by: "Danube Tech",
    glyph: "G",
    color: "var(--res-b)",
    desc: "Hosted Universal Resolver & Registrar API. ThisDID routes here for most methods that need an upstream driver.",
    resolver: "api.godiddy.com",
    href: "https://godiddy.com",
  },
  {
    name: "Archon",
    by: "Archon Technology",
    glyph: "A",
    color: "var(--res-c)",
    desc: "Universal Resolver running the iden3 & did:cid drivers. ThisDID routes iden3 here first, and uses it as a final fallback elsewhere.",
    resolver: "resolver.archon.technology",
    href: "https://archon.technology",
  },
  {
    name: "GoPlausible",
    by: "GoPlausible",
    glyph: "G",
    color: "var(--twist)",
    desc: "Algorand-native resolver worker. ThisDID routes did:algo and did:nfd here first, then falls back to godiddy & archon.",
    resolver: "goplausible.com",
    href: "https://goplausible.com",
  },
];

export function ResolverProviders() {
  return (
    <section
      id="providers"
      style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 26px 20px" }}
    >
      <div style={{ maxWidth: 640, marginBottom: 28 }}>
        <div style={eyebrow("var(--res-b)")}>Resolver providers</div>
        <h2 style={h2}>Redundant routes, trusted partners.</h2>
        <p style={lead}>
          When ThisDID can’t resolve a method via Typescript edge resolver, it
          routes to these conformant Universal Resolvers — in a method-specific
          order, with automatic fallback.
        </p>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))",
          gap: 16,
        }}
      >
        {PROVIDERS.map((p) => (
          <a
            key={p.name}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              color: "var(--text)",
              display: "flex",
              flexDirection: "column",
              gap: 14,
              padding: 24,
              borderRadius: 18,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              boxShadow: "var(--shadow)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  fontFamily: "'Space Grotesk'",
                  fontWeight: 700,
                  fontSize: 19,
                  color: p.color,
                  background: `color-mix(in srgb, ${p.color} 16%, var(--surface2))`,
                  border: `1px solid color-mix(in srgb, ${p.color} 28%, transparent)`,
                }}
              >
                {p.glyph}
              </span>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: "'Space Grotesk'",
                    fontWeight: 700,
                    fontSize: 18,
                  }}
                >
                  {p.name}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--faint)",
                    fontWeight: 600,
                  }}
                >
                  by {p.by}
                </div>
              </div>
              <span style={{ marginLeft: "auto", color: "var(--dim)" }}>
                <Icon.ExternalArrow size={16} />
              </span>
            </div>
            <div
              style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--dim)" }}
            >
              {p.desc}
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono'",
                fontSize: 12.5,
                color: p.color,
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "9px 12px",
              }}
            >
              {p.resolver}
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}

const NET_STATS = [
  { value: "42", label: "Edge regions" },
  { value: "3", label: "Failover providers" },
  { value: "Live", label: "Route health probes" },
  { value: "DIF", label: "Resolution result shape" },
];

export function NetworkCTA({ onResolveCta }: { onResolveCta: () => void }) {
  return (
    <section
      id="network"
      style={{ maxWidth: 1240, margin: "0 auto", padding: "56px 26px 20px" }}
    >
      <div
        className="net-grid"
        style={{
          borderRadius: 24,
          border: "1px solid var(--border2)",
          overflow: "hidden",
          background:
            "linear-gradient(130deg,color-mix(in srgb,var(--accent) 14%,var(--surface)),color-mix(in srgb,var(--twist) 12%,var(--surface)))",
          padding: 44,
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr",
          gap: 36,
          alignItems: "center",
        }}
      >
        <div>
          <h2
            style={{
              ...h2,
              fontSize: "clamp(26px,3vw,38px)",
              margin: "0 0 14px",
              lineHeight: 1.1,
            }}
          >
            Globally distributed. Always compliant.
          </h2>
          <p style={{ ...lead, margin: "0 0 24px", maxWidth: 520 }}>
            ThisDID runs at the edge worldwide and returns DID resolution
            results with explicit routing, timing and failure metadata.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button
              onClick={onResolveCta}
              style={{
                border: 0,
                cursor: "pointer",
                fontWeight: 700,
                fontSize: 14.5,
                padding: "12px 22px",
                borderRadius: 12,
                background:
                  "linear-gradient(135deg,var(--accent),var(--accent-bright))",
                color: "#fff",
                boxShadow: "0 10px 24px -10px var(--glow)",
              }}
            >
              Resolve a DID now
            </button>
            <a
              href="/docs"
              target="_blank"
              rel="noopener"
              style={{
                textDecoration: "none",
                fontWeight: 700,
                fontSize: 14.5,
                padding: "12px 22px",
                borderRadius: 12,
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
              }}
            >
              Read the docs
            </a>
          </div>
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}
        >
          {NET_STATS.map((n) => (
            <div
              key={n.label}
              style={{
                padding: 18,
                borderRadius: 16,
                background: "color-mix(in srgb,var(--surface) 70%,transparent)",
                border: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  fontFamily: "'Space Grotesk'",
                  fontWeight: 700,
                  fontSize: 26,
                  letterSpacing: "-.02em",
                  color: "var(--accent-bright)",
                }}
              >
                {n.value}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  color: "var(--dim)",
                  fontWeight: 600,
                  marginTop: 4,
                }}
              >
                {n.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-brand">
        <span className="footer-logo">
          <img src="/DIF_logo.png" alt="DIF" />
        </span>
        <div>
          <div className="footer-wordmark">
            this<span> DID</span>
          </div>
          <div className="footer-subtitle">Universal DID Resolver</div>
        </div>
      </div>

      <div className="footer-project">
        <div className="footer-kicker">A DIF community project</div>
        <div className="footer-statement">
          Advancing decentralized identifier resolution through the{" "}
          <a
            href="https://identity.foundation/working-groups/identifiers-discovery.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            Identifiers &amp; Discovery Working Group
          </a>
          , the{" "}
          <a
            href="https://github.com/decentralized-identity/universal-resolver"
            target="_blank"
            rel="noopener noreferrer"
          >
            Universal Resolver
          </a>{" "}
          and interoperable{" "}
          <a
            href="https://identity.foundation/working-groups/did-methods.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            DID methods
          </a>
          .
        </div>
      </div>

      <nav className="footer-links" aria-label="Footer navigation">
        <a href="/analytics">Analytics</a>
        <a href="/docs">API docs</a>
        <a
          href="https://identity.foundation/working-groups/"
          target="_blank"
          rel="noopener noreferrer"
        >
          DIF Working Groups
        </a>
        <a
          href="https://identity.foundation/join/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Join DIF
        </a>
      </nav>

      <div className="footer-bottom">
        <span>© 2026 DIF:ThisDID</span>
        <span className="footer-credit">
          Built and maintained by{" "}
          <a
            href="https://goplausible.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            GoPlausible
          </a>{" "}
          under the{" "}
          <a
            href="https://identity.foundation/working-groups/identifiers-discovery.html"
            target="_blank"
            rel="noopener noreferrer"
          >
            DIF Identifiers &amp; Discovery Working Group
          </a>
          .
        </span>
      </div>
    </footer>
  );
}
