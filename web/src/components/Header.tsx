import type { ThemeMode } from "../hooks";
import * as Icon from "../icons";

const navLink = {
  textDecoration: "none",
  color: "var(--dim)",
  fontSize: 14,
  fontWeight: 600,
  padding: "8px 12px",
  borderRadius: 9,
} as const;

interface Props {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  onScan: () => void;
}

export function Header({ mode, setMode, onScan }: Props) {
  const seg = (active: boolean) =>
    ({
      width: 30,
      height: 30,
      border: 0,
      borderRadius: 8,
      cursor: "pointer",
      display: "grid",
      placeItems: "center",
      color: active ? "#fff" : "var(--dim)",
      background: active
        ? "linear-gradient(135deg,var(--accent),var(--accent-bright))"
        : "transparent",
    }) as const;

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        backdropFilter: "blur(14px)",
        background: "color-mix(in srgb, var(--bg) 78%, transparent)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div className="hdr">
        <a
          href="#top"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 11,
            textDecoration: "none",
            color: "var(--text)",
          }}
        >
          <span
            style={{
              background: "#f4efe6",
              borderRadius: 9,
              padding: "5px 9px",
              display: "grid",
              placeItems: "center",
              boxShadow: "0 6px 18px -6px var(--glow)",
            }}
          >
            <img
              src="/DIF_logo.png"
              alt="DIF"
              style={{ height: 24, width: "auto", display: "block" }}
            />
          </span>
          <span
            style={{
              fontFamily: "'Space Grotesk'",
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: "-.02em",
            }}
          >
            this<span style={{ color: "var(--accent)" }}>DID</span>
          </span>
        </a>
        <nav
          className="site-nav"
          style={{
            display: "flex",
            gap: 2,
            marginLeft: 6,
            whiteSpace: "nowrap",
          }}
        >
          <a href="#top" style={navLink}>
            Resolve
          </a>
          <a href="#how" style={navLink}>
            How it works
          </a>
          <a href="#methods" style={navLink}>
            Methods
          </a>
          <a href="/directory/providers" style={navLink}>
            Providers
          </a>
          <a href="/directory" style={navLink}>
            Directory
          </a>
          <a
            href="/docs"
            target="_blank"
            rel="noopener"
            style={{
              ...navLink,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            API Docs
            <Icon.ExternalArrow />
          </a>
        </nav>
        <div style={{ flex: 1 }} />
        <button
          onClick={onScan}
          title="Scan DID QR"
          style={{
            width: 40,
            height: 40,
            border: "1px solid var(--border)",
            background: "var(--surface)",
            borderRadius: 11,
            cursor: "pointer",
            color: "var(--dim)",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Icon.QrIcon />
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 12,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            title="Dark"
            onClick={() => setMode("dark")}
            style={seg(mode === "dark")}
          >
            <Icon.Moon />
          </button>
          <button
            title="Light"
            onClick={() => setMode("light")}
            style={seg(mode === "light")}
          >
            <Icon.Sun />
          </button>
          <button
            title="System"
            onClick={() => setMode("system")}
            style={seg(mode === "system")}
          >
            <Icon.Monitor />
          </button>
        </div>
        <a
          href="/analytics"
          className="hdr-cta"
          title="Analytics"
          style={{
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            fontSize: 14,
            fontWeight: 700,
            borderRadius: 10,
            background:
              "linear-gradient(135deg,var(--accent),var(--accent-bright))",
            color: "#fff",
            boxShadow: "0 8px 20px -8px var(--glow)",
            whiteSpace: "nowrap",
          }}
        >
          <Icon.GridIcon size={15} />
          <span className="cta-label">Analytics</span>
        </a>
      </div>
    </header>
  );
}
