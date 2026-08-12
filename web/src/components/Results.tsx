import type { ReactNode } from "react";
import type { ResultView } from "../lib/api";
import * as Icon from "../icons";

const card = {
  padding: 22,
  borderRadius: 18,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  boxShadow: "var(--shadow)",
} as const;

const cardHead = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginBottom: 16,
} as const;
const iconTile = (accent: boolean) =>
  ({
    width: 32,
    height: 32,
    borderRadius: 9,
    display: "grid",
    placeItems: "center",
    background: `color-mix(in srgb, var(${accent ? "--accent" : "--twist"}) ${accent ? 16 : 18}%, transparent)`,
    color: `var(${accent ? "--accent-bright" : "--twist-bright"})`,
  }) as const;
const eyebrow = {
  fontSize: 11,
  color: "var(--faint)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: ".05em",
} as const;

/** JSON syntax highlighter → colored spans using the --j-* tokens. */
function HighlightedJson({ json }: { json: string }): ReactNode {
  const parts: ReactNode[] = [];
  const re =
    /("(?:\\.|[^"\\])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+\.?\d*(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  const push = (txt: string, color?: string) =>
    parts.push(
      <span key={key++} style={{ color: color ?? "var(--j-punc)" }}>
        {txt}
      </span>,
    );
  while ((m = re.exec(json))) {
    if (m.index > last) push(json.slice(last, m.index));
    const tok = m[0];
    let color: string;
    if (tok[0] === '"')
      color = /:\s*$/.test(tok) ? "var(--j-key)" : "var(--j-str)";
    else if (tok === "true" || tok === "false") color = "var(--j-bool)";
    else if (tok === "null") color = "var(--j-null)";
    else color = "var(--j-num)";
    push(tok, color);
    last = re.lastIndex;
  }
  if (last < json.length) push(json.slice(last));
  return (
    <pre style={{ margin: 0, whiteSpace: "pre", fontFamily: "inherit" }}>
      {parts}
    </pre>
  );
}

interface Props {
  view: ResultView;
  tab: "overview" | "json";
  setTab: (t: "overview" | "json") => void;
  copy: (text: string) => void;
  copied: boolean;
}

export function Results({ view, tab, setTab, copy, copied }: Props) {
  const seg = (active: boolean) =>
    active
      ? {
          color: "#fff",
          background:
            "linear-gradient(135deg,var(--accent),var(--accent-bright))",
        }
      : { color: "var(--dim)", background: "transparent" };

  return (
    <section
      style={{ maxWidth: 1240, margin: "0 auto", padding: "16px 26px 8px" }}
    >
      {/* route banner */}
      <div
        className="fu"
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 18,
          padding: "18px 22px",
          borderRadius: 18,
          border: "1px solid var(--border2)",
          background:
            "linear-gradient(120deg,color-mix(in srgb,var(--accent) 12%,transparent),var(--surface))",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            background: "var(--accent)",
            boxShadow: "0 8px 20px -8px var(--accent)",
            flex: "none",
            color: "#fff",
          }}
        >
          <Icon.Check />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5 }}>
            Routed to the {view.resolver}
            {view.route === "local" ? " (in-Worker)" : ""}
          </div>
          <div style={{ fontSize: 13.5, color: "var(--dim)", marginTop: 3 }}>
            The rules engine matched {view.methodTag} to its conformant driver
            and normalized the response into one unified document.
          </div>
        </div>
        <div style={{ display: "flex", gap: 22, flex: "none" }}>
          <Stat label="Method" value={view.methodTag} mono />
          <Stat label="Network" value={view.network} />
          <Stat label="Time" value={view.duration} accent />
        </div>
      </div>

      {/* view tabs + toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 4,
            padding: 4,
            borderRadius: 12,
            background: "var(--surface)",
            border: "1px solid var(--border)",
          }}
        >
          <button
            onClick={() => setTab("overview")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: 0,
              cursor: "pointer",
              padding: "9px 16px",
              borderRadius: 9,
              fontWeight: 700,
              fontSize: 13.5,
              ...seg(tab === "overview"),
            }}
          >
            <Icon.GridIcon /> Overview
          </button>
          <button
            onClick={() => setTab("json")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              border: 0,
              cursor: "pointer",
              padding: "9px 16px",
              borderRadius: 9,
              fontWeight: 700,
              fontSize: 13.5,
              ...seg(tab === "json"),
            }}
          >
            <Icon.Brackets /> JSON
          </button>
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono'",
            fontSize: 13,
            color: "var(--dim)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
          }}
        >
          {view.did}
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button
            onClick={() => copy(view.did)}
            title="Copy DID"
            style={iconBtn}
          >
            <Icon.Copy />
          </button>
          <button
            onClick={() => copy(view.json)}
            title="Copy JSON"
            style={{
              ...iconBtn,
              width: "auto",
              padding: "0 14px",
              gap: 7,
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            <Icon.Download /> {copied ? "Copied!" : "Copy JSON"}
          </button>
        </div>
      </div>

      {tab === "overview" ? (
        <Overview view={view} copy={copy} />
      ) : (
        <JsonPanel view={view} />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <div>
      <div style={{ ...eyebrow, letterSpacing: ".06em" }}>{label}</div>
      <div
        style={{
          fontFamily: mono ? "'IBM Plex Mono'" : undefined,
          fontWeight: 600,
          fontSize: 14,
          marginTop: 3,
          color: accent ? "var(--accent-bright)" : undefined,
        }}
      >
        {value}
      </div>
    </div>
  );
}

const iconBtn = {
  width: 38,
  height: 38,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  borderRadius: 10,
  cursor: "pointer",
  color: "var(--dim)",
  display: "grid",
  placeItems: "center",
} as const;

function Overview({
  view,
  copy,
}: {
  view: ResultView;
  copy: (t: string) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
      {/* identity + health */}
      <div
        className="split-2"
        style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}
      >
        <div style={card}>
          <div style={cardHead}>
            <span style={iconTile(true)}>
              <Icon.Person />
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Subject Identity
            </span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11.5,
                fontWeight: 700,
                color: "#57b96a",
                display: "flex",
                alignItems: "center",
                gap: 5,
              }}
            >
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: "#57b96a",
                }}
              />
              {view.deactivated === "Yes" ? "Deactivated" : "Active"}
            </span>
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono'",
              fontSize: 14,
              lineHeight: 1.55,
              wordBreak: "break-all",
              padding: "12px 14px",
              borderRadius: 11,
              background: "var(--surface2)",
              border: "1px solid var(--border)",
            }}
          >
            {view.did}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 16,
            }}
          >
            <Field label="Controller" value={view.controllerShort} mono />
            <Field label="Deactivated" value={view.deactivated} />
            <Field label="Created" value={view.created} />
            <Field label="Updated" value={view.updated} />
          </div>
        </div>

        <div style={{ ...card, display: "flex", flexDirection: "column" }}>
          <div style={cardHead}>
            <span style={iconTile(false)}>
              <Icon.Shield />
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Document Health
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
            {view.healthRows.map((h) => (
              <div
                key={h.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ fontSize: 13.5, color: "var(--dim)" }}>
                  {h.label}
                </span>
                <span
                  style={{
                    fontFamily: "'Space Grotesk'",
                    fontWeight: 700,
                    fontSize: 15,
                    color: h.good ? "#57b96a" : "var(--text)",
                  }}
                >
                  {h.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* verification methods */}
      <div style={card}>
        <div style={cardHead}>
          <span style={iconTile(true)}>
            <Icon.Key />
          </span>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            Verification Methods
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--dim)",
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              padding: "3px 9px",
              borderRadius: 7,
            }}
          >
            {view.vmCount}
          </span>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
            gap: 14,
          }}
        >
          {view.vmList.map((vm) => (
            <div
              key={vm.frag}
              style={{
                padding: 16,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "var(--surface2)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  marginBottom: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono'",
                    fontSize: 12.5,
                    fontWeight: 600,
                    color: "var(--accent-bright)",
                  }}
                >
                  {vm.frag}
                </span>
                <span
                  style={{
                    marginLeft: "auto",
                    fontSize: 10.5,
                    fontWeight: 700,
                    letterSpacing: ".03em",
                    color: "var(--twist-bright)",
                    background:
                      "color-mix(in srgb,var(--twist) 15%,transparent)",
                    padding: "3px 8px",
                    borderRadius: 6,
                  }}
                >
                  {vm.type}
                </span>
              </div>
              <div style={{ ...eyebrow, marginBottom: 5 }}>{vm.keyLabel}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <code
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontFamily: "'IBM Plex Mono'",
                    fontSize: 11.5,
                    color: "var(--dim)",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: "8px 10px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {vm.keyValue}
                </code>
                <button
                  onClick={() => copy(vm.keyValue)}
                  title="Copy key"
                  style={{
                    width: 32,
                    height: 32,
                    flex: "none",
                    border: "1px solid var(--border)",
                    background: "var(--surface)",
                    borderRadius: 8,
                    cursor: "pointer",
                    color: "var(--faint)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  <Icon.Copy size={14} />
                </button>
              </div>
              {vm.uses.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {vm.uses.map((u) => (
                    <span
                      key={u}
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--dim)",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {u}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* relationships + services */}
      <div
        className="split-2"
        style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}
      >
        <div style={card}>
          <div style={cardHead}>
            <span style={iconTile(false)}>
              <Icon.Link />
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Key Relationships
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {view.relList.length === 0 && (
              <Empty>No key relationships declared.</Empty>
            )}
            {view.relList.map((r) => (
              <div
                key={r.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "11px 13px",
                  borderRadius: 11,
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 9,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: r.accent ? "var(--accent)" : "var(--twist)",
                      flex: "none",
                    }}
                  />
                  <span style={{ fontWeight: 600, fontSize: 13.5 }}>
                    {r.name}
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'IBM Plex Mono'",
                    fontSize: 12,
                    color: "var(--dim)",
                    flex: "none",
                  }}
                >
                  {r.refs}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={card}>
          <div style={cardHead}>
            <span style={iconTile(true)}>
              <Icon.Server />
            </span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Service Endpoints
            </span>
          </div>
          {view.svcList.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {view.svcList.map((sv) => (
                <div
                  key={sv.frag}
                  style={{
                    padding: 13,
                    borderRadius: 11,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 7,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: ".03em",
                        color: "var(--accent-bright)",
                        background:
                          "color-mix(in srgb,var(--accent) 14%,transparent)",
                        padding: "3px 8px",
                        borderRadius: 6,
                      }}
                    >
                      {sv.type}
                    </span>
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono'",
                        fontSize: 11.5,
                        color: "var(--faint)",
                      }}
                    >
                      {sv.frag}
                    </span>
                  </div>
                  {sv.href ? (
                    <a
                      href={sv.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontFamily: "'IBM Plex Mono'",
                        fontSize: 12.5,
                        color: "var(--twist-bright)",
                        textDecoration: "none",
                        wordBreak: "break-all",
                      }}
                    >
                      {sv.endpoint}
                    </a>
                  ) : (
                    <span
                      style={{
                        fontFamily: "'IBM Plex Mono'",
                        fontSize: 12.5,
                        color: "var(--dim)",
                        wordBreak: "break-all",
                      }}
                    >
                      {sv.endpoint}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <Empty>No service endpoints declared in this document.</Empty>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div style={eyebrow}>{label}</div>
      <div
        style={{
          fontFamily: mono ? "'IBM Plex Mono'" : undefined,
          fontSize: mono ? 12.5 : 13,
          marginTop: 4,
          color: "var(--dim)",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        padding: "22px 12px",
        textAlign: "center",
        color: "var(--faint)",
        fontSize: 13,
      }}
    >
      {children}
    </div>
  );
}

function JsonPanel({ view }: { view: ResultView }) {
  const meta: [string, string][] = [
    ["contentType", "application/did+ld+json"],
    ["resolver", view.resolver],
    ["route", view.route],
    ["pattern", "^did:" + view.method + ":"],
    ["duration", view.duration],
    ["retrieved", view.created],
    ["deactivated", view.deactivated === "Yes" ? "true" : "false"],
  ];
  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid var(--border)",
        background: "var(--surface)",
        boxShadow: "var(--shadow)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface2)",
        }}
      >
        <Dot c="#ff5f57" />
        <Dot c="#febc2e" />
        <Dot c="#28c840" />
        <span
          style={{
            fontFamily: "'IBM Plex Mono'",
            fontSize: 12,
            color: "var(--faint)",
            marginLeft: 8,
          }}
        >
          did-document.json · application/did+ld+json
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "'IBM Plex Mono'",
            fontSize: 11.5,
            color: "var(--faint)",
          }}
        >
          {view.byteSize}
        </span>
      </div>
      <div
        className="json-grid"
        style={{ display: "grid", gridTemplateColumns: "1.55fr .95fr" }}
      >
        <div
          style={{
            overflow: "auto",
            maxHeight: 560,
            padding: "18px 20px",
            fontFamily: "'IBM Plex Mono'",
            fontSize: 13,
            lineHeight: 1.7,
          }}
        >
          <HighlightedJson json={view.json} />
        </div>
        <div
          style={{
            borderLeft: "1px solid var(--border)",
            padding: "18px 20px",
            background: "var(--surface2)",
            overflow: "auto",
            maxHeight: 560,
          }}
        >
          <div style={{ ...eyebrow, letterSpacing: ".06em", marginBottom: 12 }}>
            Resolution Metadata
          </div>
          <div
            style={{
              fontFamily: "'IBM Plex Mono'",
              fontSize: 12.5,
              lineHeight: 1.9,
            }}
          >
            {meta.map(([k, v]) => (
              <div
                key={k}
                style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
              >
                <span style={{ color: "var(--j-key)" }}>{k}</span>
                <span style={{ color: "var(--dim)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const Dot = ({ c }: { c: string }) => (
  <span style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
);
