/**
 * Self-contained SSR pages, cloned from the parent ThisDID design: the same
 * tokens, fonts, header, pill buttons, and footer as /analytics on
 * thisdid.com (src/dashboard.ts) — the directory must read as the same
 * product. The small client script avoids backticks and dollar-brace so it
 * survives the surrounding template literal.
 */
import type {
  MethodProfile,
  MethodScores,
  ProviderProfile,
  ProviderScoreTable,
  ProviderScores,
  ProviderWindow,
  ReliabilityScore,
  ScoreTable,
} from "./types";

const esc = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Minimal safe renderer for curated research: paragraphs + [text](url). */
export function renderResearch(text: string): string {
  const paragraphs = text.split(/\n{2,}/);
  return paragraphs
    .map((p) => {
      const escaped = esc(p.trim());
      const linked = escaped.replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>',
      );
      return `<p>${linked}</p>`;
    })
    .join("");
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  edge: { label: "TS Universal Resolver driver", cls: "edge" },
  upstream: { label: "Upstream routed", cls: "upstream" },
  parked: { label: "Parked", cls: "parked" },
  "no-go": { label: "No-go", cls: "nogo" },
  bench: { label: "Bench", cls: "bench" },
  excluded: { label: "Via GoPlausible", cls: "excluded" },
};

/** Same tokens, background glow, fonts, and chrome as src/dashboard.ts. */
const STYLE = `
:root,[data-theme="dark"]{--bg:#16130f;--surface:#201c15;--surface2:#29241b;--border:rgba(255,255,255,.09);--text:#f4efe6;--dim:#a99f8f;--faint:#6f6656;--accent:#d97757;--accent-bright:#ff916a;--twist:#b587f0;--good:#57b96a;--bad:#ff916a;--warn:#f0b968;--docker:#5fd0e0;--glowa:rgba(217,119,87,.16)}
[data-theme="light"]{--bg:#f6f2e9;--surface:#ffffff;--surface2:#f4efe4;--border:rgba(30,24,16,.1);--text:#241d14;--dim:#6b6252;--faint:#9c9584;--accent:#c9633f;--accent-bright:#d97757;--twist:#8b5cf6;--good:#2f8f47;--bad:#c9633f;--warn:#a97a1e;--docker:#2f9fb0;--glowa:rgba(201,99,63,.1)}
*{box-sizing:border-box}body{margin:0;font-family:Manrope,system-ui,sans-serif;background:radial-gradient(1000px 500px at 85% -10%,var(--glowa),transparent 60%),var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}
a{color:inherit}.wrap{max-width:1200px;margin:0 auto;padding:26px}
header{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap}
.logo{height:34px;padding:5px 9px;border-radius:10px;background:#f4efe6;display:grid;place-items:center}
.logo img{height:22px;width:auto;display:block}
.brand{font-family:'Space Grotesk';font-weight:700;font-size:19px}.brand b{color:var(--accent)}
.brand a{text-decoration:none}
.tag{font-size:13px;color:var(--faint)}
.spacer{flex:1}
.back{font-size:13px;font-weight:600;color:var(--dim);text-decoration:none;border:1px solid var(--border);padding:8px 14px;border-radius:10px}
.back:hover{color:var(--text);border-color:var(--accent)}
.sub{color:var(--dim);margin:0 0 20px;max-width:76ch;font-size:14.5px;line-height:1.6}
.sub a{color:var(--accent-bright);text-decoration:none}
.filters{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:20px}
.filters input{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:10px;padding:9px 13px;font-size:13px;font-family:inherit;min-width:240px}
.seg{display:flex;gap:3px;padding:3px;background:var(--surface);border:1px solid var(--border);border-radius:11px;flex-wrap:wrap}
.range-btn{border:0;background:transparent;color:var(--dim);font-weight:700;font-size:12.5px;padding:7px 13px;border-radius:8px;cursor:pointer;font-family:inherit}
.range-btn.on{background:linear-gradient(135deg,var(--accent),var(--accent-bright));color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(315px,1fr));gap:12px}
.card{position:relative;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:15px 16px;display:flex;flex-direction:column;gap:8px;transition:border-color .15s}
.card:hover{border-color:var(--accent)}
.card h3 a::after{content:"";position:absolute;inset:0;border-radius:14px}
.card .badges a{position:relative;z-index:1}
.card h3{margin:0;font-family:'Space Grotesk';font-size:16px;font-weight:700}
.card h3 a{text-decoration:none}.card h3 a:hover{color:var(--accent-bright)}
.card .sum{color:var(--dim);font-size:13.5px;line-height:1.5;flex:1}
.badges{display:flex;gap:6px;flex-wrap:wrap}
.badge{font-size:11px;font-weight:700;border-radius:999px;padding:3px 10px;border:1px solid var(--border);color:var(--dim);text-decoration:none}
.badge.edge{color:var(--good);border-color:rgba(87,185,106,.45)}
.badge.parked{color:var(--warn);border-color:rgba(240,185,104,.45)}
.badge.nogo{color:var(--bad);border-color:rgba(255,145,106,.45)}
.badge.bench{color:var(--twist);border-color:rgba(181,135,240,.45)}
.badge.dif{color:var(--twist);border-color:rgba(181,135,240,.45)}
.badge.probation{color:var(--warn);border-color:rgba(240,185,104,.45)}
.badge.docker{color:var(--docker);border-color:color-mix(in srgb,var(--docker) 45%,transparent)}
.scores{display:flex;gap:12px;font-size:12px;color:var(--dim);font-family:'IBM Plex Mono'}
.scores b{color:var(--text);font-weight:500}
.nodata{color:var(--faint);font-style:italic}
h2{font-family:'Space Grotesk';font-size:13px;letter-spacing:.04em;margin:0 0 12px;color:var(--dim);text-transform:uppercase}
.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:18px 20px;margin-bottom:14px}
.panel .title{font-family:'Space Grotesk';font-size:22px;font-weight:700;margin:0 0 8px}
.kv{display:grid;grid-template-columns:180px 1fr;gap:7px 14px;font-size:13.5px;margin:0}
.kv dt{color:var(--dim)}.kv dd{margin:0;word-break:break-all;font-family:'IBM Plex Mono';font-size:12.5px}
.kv dd a{color:var(--accent-bright);text-decoration:none}
.chain{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.chain .hop{background:var(--surface2);border:1px solid var(--border);border-radius:9px;padding:5px 12px;font-size:12.5px;font-family:'IBM Plex Mono'}
a.hop:hover{border-color:var(--accent);color:var(--accent-bright)}
.chain .arrow{color:var(--faint)}
.research p{margin:0 0 10px;max-width:80ch;font-size:14px;line-height:1.65;color:var(--text)}
.research a{color:var(--accent-bright);text-decoration:none}
.links{margin:0;padding-left:18px}.links li{margin-bottom:5px;font-size:13.5px}
.links a{color:var(--accent-bright);text-decoration:none}
.scorerow{display:grid;grid-template-columns:150px 1fr 64px;gap:12px;align-items:center;font-size:13px;margin-bottom:9px}
.scorerow>span:first-child{color:var(--dim)}
.scorerow b{font-family:'IBM Plex Mono';font-weight:500;text-align:right}
.meter{height:7px;border-radius:5px;background:var(--surface2);overflow:hidden}
.meter i{display:block;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent-bright))}
.theme-seg{display:flex;align-items:center;gap:4px;padding:4px;border-radius:12px;background:var(--surface);border:1px solid var(--border)}
.theme-btn{width:30px;height:30px;border:0;border-radius:8px;cursor:pointer;display:grid;place-items:center;color:var(--dim);background:transparent}
.theme-btn.on{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent-bright))}
.foot{margin-top:34px;color:var(--faint);font-size:12.5px;line-height:1.7}
.foot a{color:var(--dim);text-decoration:none}.foot a:hover{color:var(--text)}
`;

/** Header nav: the parent product's surfaces, present on every page. */
function nav(current: "home" | "method" | "providers"): string {
  const links = [
    `<a class="back" href="/">← Resolver</a>`,
    current !== "home" ? `<a class="back" href="/directory">Directory</a>` : "",
    current !== "providers"
      ? `<a class="back" href="/directory/providers">Providers</a>`
      : "",
    `<a class="back" href="/analytics">Analytics</a>`,
    `<a class="back" href="/docs">API docs</a>`,
  ].filter(Boolean);
  return `<header>
<span class="logo"><img src="/DIF_logo.png" alt="DIF"/></span>
<div class="brand"><a href="/directory">This<b>DID</b> Directory</a></div>
<span class="tag">every DID method, measured</span>
<span class="spacer"></span>
<div class="theme-seg">
<button class="theme-btn" data-m="dark" title="Dark"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg></button>
<button class="theme-btn" data-m="light" title="Light"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg></button>
<button class="theme-btn" data-m="system" title="System"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg></button>
</div>
${links.join("\n")}
</header>`;
}

const FOOT = `<div class="foot">Curated method research + live measured scores ·
A <a href="https://identity.foundation/working-groups/identifiers-discovery.html" target="_blank" rel="noopener noreferrer">DIF Identifiers &amp; Discovery Working Group</a> project advancing the
<a href="https://github.com/decentralized-identity/universal-resolver" target="_blank" rel="noopener noreferrer">Universal Resolver</a> and interoperable
<a href="https://identity.foundation/working-groups/did-methods.html" target="_blank" rel="noopener noreferrer">DID methods</a> ·
<a href="/">Resolver</a> ·
<a href="/analytics">Analytics</a> ·
<a href="/status">Status</a> ·
<a href="/directory/api/methods">JSON API</a> ·
<a href="/docs">API docs</a> ·
<a href="https://github.com/decentralized-identity/thisdid" target="_blank" rel="noopener noreferrer">Source</a></div>`;

function shell(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<link rel="icon" href="/favicon.png" type="image/png"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Manrope:wght@400;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>${STYLE}</style></head><body>
<div class="wrap">${body}
${FOOT}
</div>
<script>
(function(){
  var KEY='thisdid-theme';
  function saved(){ try{var v=localStorage.getItem(KEY);return v==='dark'||v==='light'||v==='system'?v:'dark';}catch(e){return 'dark';} }
  function resolve(m){ if(m==='system'){ try{return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}catch(e){return 'dark';} } return m; }
  function paint(){ var m=saved(); document.documentElement.setAttribute('data-theme',resolve(m));
    document.querySelectorAll('.theme-btn').forEach(function(b){ b.classList.toggle('on', b.getAttribute('data-m')===m); });
  }
  document.querySelectorAll('.theme-btn').forEach(function(b){
    b.addEventListener('click',function(){ try{localStorage.setItem(KEY,b.getAttribute('data-m'));}catch(e){} paint(); });
  });
  try{ matchMedia('(prefers-color-scheme: dark)').addEventListener('change',paint); }catch(e){}
  paint();
})();
</script>
</body></html>`;
}

function scoreBits(s: MethodScores | undefined): string {
  if (!s) {
    return `<div class="scores"><span class="nodata">no data yet</span></div>`;
  }
  const pop =
    s.popularity == null
      ? `<span class="nodata">no traffic</span>`
      : `pop <b>${s.popularity}</b>`;
  const avail =
    s.availability == null ? "" : ` · avail <b>${s.availability}%</b>`;
  const day = s.resolutions24h > 0 ? ` · 24h <b>${s.resolutions24h}</b>` : "";
  return `<div class="scores"><span>${pop}${avail}${day}</span></div>`;
}

function badges(p: MethodProfile): string {
  const meta = STATUS_META[p.status] ?? STATUS_META.upstream;
  const parts = [`<span class="badge ${meta.cls}">${esc(meta.label)}</span>`];
  if (p.probation && p.status === "edge") {
    parts.push(`<span class="badge probation">New · under test</span>`);
  }
  if (p.dif?.recommended) {
    parts.push(
      `<a class="badge dif" href="${esc(p.dif.recommended)}" rel="noopener noreferrer" target="_blank">DIF Recommended</a>`,
    );
  }
  if (p.dif?.endorsed) {
    parts.push(
      `<a class="badge dif" href="${esc(p.dif.endorsed)}" rel="noopener noreferrer" target="_blank">DIF Endorsed</a>`,
    );
  }
  if (p.dif?.dockerDriver) {
    const link = p.dif.dockerDriver.hub ?? p.dif.dockerDriver.repo;
    parts.push(
      link
        ? `<a class="badge docker" href="${esc(link)}" rel="noopener noreferrer" target="_blank" title="Approved resolver docker container in the DIF Universal Resolver repository">Docker</a>`
        : `<span class="badge docker" title="Approved resolver docker container in the DIF Universal Resolver repository">Docker</span>`,
    );
  }
  return `<div class="badges">${parts.join("")}</div>`;
}

export function homePage(
  profiles: MethodProfile[],
  scores: ScoreTable,
  syncedAt: number,
): string {
  const cards = profiles
    .map((p) => {
      const s = scores.methods[p.id];
      return `<div class="card" data-id="${esc(p.id)}" data-status="${esc(p.status)}" data-docker="${p.dif?.dockerDriver ? "1" : ""}">
<h3><a href="/directory/method/${esc(p.id)}">${esc(p.name)}</a></h3>
${badges(p)}
<div class="sum">${esc(p.summary)}</div>
${scoreBits(s)}
</div>`;
    })
    .join("");
  const synced = syncedAt
    ? new Date(syncedAt).toISOString().slice(0, 10)
    : "vendored snapshot";
  const body = `${nav("home")}
<p class="sub">Curated research and live, measured popularity/availability for ${profiles.length}
DID methods — the ones <a href="/">ThisDID</a> resolves itself, the long
tail it routes upstream, and the ones the research says are gone. Live numbers come from the
resolver's own <a href="/analytics">analytics</a> and health probes.
DIF registry sync: ${esc(synced)}.</p>
<div class="filters">
<input id="q" type="search" placeholder="Filter methods…" autocomplete="off"/>
<div class="seg">
<button class="range-btn on" data-f="all">All</button>
<button class="range-btn" data-f="edge">TS Universal Resolver drivers</button>
<button class="range-btn" data-f="upstream">Upstream</button>
<button class="range-btn" data-f="no-go">No-go</button>
<button class="range-btn" data-f="parked">Parked / bench</button>
<button class="range-btn" data-f="docker">Docker</button>
</div>
</div>
<div class="grid" id="grid">${cards}</div>
<script>
(function(){
  var q=document.getElementById('q');
  var chips=document.querySelectorAll('.range-btn');
  var cards=document.querySelectorAll('.card');
  var filter='all';
  function apply(){
    var needle=q.value.toLowerCase();
    cards.forEach(function(c){
      var st=c.getAttribute('data-status');
      var okF=filter==='all'||st===filter||
        (filter==='parked'&&(st==='parked'||st==='bench'||st==='excluded'))||
        (filter==='docker'&&c.getAttribute('data-docker')==='1');
      var okQ=!needle||c.textContent.toLowerCase().indexOf(needle)>=0;
      c.style.display=okF&&okQ?'':'none';
    });
  }
  chips.forEach(function(ch){ch.addEventListener('click',function(){
    chips.forEach(function(o){o.classList.remove('on');});
    ch.classList.add('on');filter=ch.getAttribute('data-f');apply();
  });});
  q.addEventListener('input',apply);
})();
</script>`;
  return shell("ThisDID Directory", body);
}

function meterRow(label: string, value: number | null, suffix: string): string {
  if (value == null) {
    return `<div class="scorerow"><span>${esc(label)}</span><span class="nodata">no data</span><span></span></div>`;
  }
  return `<div class="scorerow"><span>${esc(label)}</span>
<span class="meter"><i style="width:${value}%"></i></span><b>${value}${esc(suffix)}</b></div>`;
}

export function methodPage(
  p: MethodProfile,
  s: MethodScores | undefined,
): string {
  const chain = p.chain.length
    ? `<div class="chain">${p.chain
        .map((hop) => {
          const providerId = hop.toLowerCase().replace(/[^a-z0-9]/g, "");
          return `<a class="hop" style="text-decoration:none" href="/directory/provider/${esc(providerId)}" title="${esc(hop)} in the provider directory">${esc(hop)}</a>`;
        })
        .join(`<span class="arrow">→</span>`)}</div>`
    : `<span class="nodata">not routed by ThisDID</span>`;
  const facts: string[] = [];
  if (p.network) facts.push(`<dt>Network</dt><dd>${esc(p.network)}</dd>`);
  if (p.example) {
    facts.push(
      `<dt>Try it live</dt><dd><a href="/${esc(p.example)}">${esc(p.example)}</a></dd>`,
    );
  }
  if (p.statusReason) {
    facts.push(`<dt>Status reason</dt><dd>${esc(p.statusReason)}</dd>`);
  }

  facts.push(
    `<dt>JSON API</dt><dd><a href="/directory/api/methods/${esc(p.id)}">/directory/api/methods/${esc(p.id)}</a></dd>`,
  );
  if (p.lastReviewed) {
    facts.push(`<dt>Last reviewed</dt><dd>${esc(p.lastReviewed)}</dd>`);
  }
  const body = `${nav("method")}
<div class="panel"><div class="title">${esc(p.name)}</div>
${badges(p)}
<p class="sub" style="margin:10px 0 0">${esc(p.summary)}</p></div>
<div class="panel"><h2>Live scores</h2>
${meterRow("Popularity", s?.popularity ?? null, "")}
${meterRow("Availability", s?.availability ?? null, "%")}
${meterRow("ThisDID canary 24h", s?.canary24h ?? null, "%")}
<div class="scores" style="margin-top:6px"><span>
resolutions: 24h <b>${s?.resolutions24h ?? 0}</b> · 7d <b>${s?.resolutions7d ?? 0}</b> ·
30d <b>${s?.resolutions30d ?? 0}</b> · from
</span><a href="/analytics" style="color:var(--accent-bright);text-decoration:none;font-size:12px">/analytics</a></div></div>
<div class="panel"><h2>Routing</h2>${chain}</div>
${
  p.probation
    ? `<div class="panel"><h2>Probation verification</h2>${
        p.probationVerifiers?.length
          ? `<p class="sub" style="margin:0 0 10px">New driver under the verification
guarantee: ThisDID resolutions are double-checked in parallel against an independent upstream —
for ${esc(p.name)}, ${esc(p.probationVerifiers.join(" and "))} — until the live match-rate
earns graduation.</p>
${
  s && s.verificationMatch30d + s.verificationMismatch30d > 0
    ? `${meterRow(
        "Match rate 30d",
        Math.round(
          (s.verificationMatch30d /
            (s.verificationMatch30d + s.verificationMismatch30d)) *
            100,
        ),
        "%",
      )}
<div class="scores" style="margin-top:6px"><span>double-checks 30d:
✓ <b>${s.verificationMatch30d}</b> matched ·
✗ <b>${s.verificationMismatch30d}</b> mismatched · live counts on
</span><a href="/analytics" style="color:var(--accent-bright);text-decoration:none;font-size:12px">/analytics</a></div>`
    : `<span class="nodata">no double-checks recorded in the rollup window yet</span>`
}`
          : `<p class="sub" style="margin:0"><b>No upstream anywhere resolves ${esc(p.name)}
— ThisDID is the only public route.</b> Results are honestly stamped
<span style="font-family:'IBM Plex Mono';font-size:12.5px">verification: unverified
(upstreamUnsupported)</span> until an independent verifier exists.</p>`
      }</div>`
    : ""
}
${
  p.dif?.dockerDriver
    ? `<div class="panel"><h2>DIF Universal Resolver docker driver</h2>
<p class="sub" style="margin:0 0 10px"><b>${esc(p.name)} has an approved and merged resolver
docker container in the DIF
<a href="https://github.com/decentralized-identity/universal-resolver" rel="noopener noreferrer" target="_blank">Universal Resolver</a>
repository.</b></p>
<dl class="kv">
${p.dif.dockerDriver.image ? `<dt><b>Docker image</b></dt><dd>${p.dif.dockerDriver.hub ? `<a href="${esc(p.dif.dockerDriver.hub)}" rel="noopener noreferrer" target="_blank"><b>${esc(p.dif.dockerDriver.image)}</b></a>` : `<b>${esc(p.dif.dockerDriver.image)}</b>`}</dd>` : ""}
${p.dif.dockerDriver.repo ? `<dt><b>Driver source</b></dt><dd><a href="${esc(p.dif.dockerDriver.repo)}" rel="noopener noreferrer" target="_blank"><b>${esc(p.dif.dockerDriver.repo)}</b></a></dd>` : ""}
</dl></div>`
    : ""
}
<div class="panel"><h2>Facts</h2><dl class="kv">${facts.join("")}</dl></div>
${p.research ? `<div class="panel research"><h2>Research</h2>${renderResearch(p.research)}</div>` : ""}
<div class="panel"><h2>Links</h2><ul class="links">${p.links
    .map(
      (l) =>
        `<li><a href="${esc(l.url)}" rel="noopener noreferrer" target="_blank">${esc(l.label)}</a></li>`,
    )
    .join("")}</ul></div>`;
  return shell(`${p.name} — ThisDID Directory`, body);
}

// ── Provider directory (phase 2) ────────────────────────────────────────────

const STATUS_NOW_META: Record<string, { label: string; color: string }> = {
  up: { label: "up", color: "var(--good)" },
  degraded: { label: "degraded", color: "var(--warn)" },
  down: { label: "down", color: "var(--bad)" },
  unknown: { label: "no probes", color: "var(--faint)" },
};

function statusChip(statusNow: string): string {
  const meta = STATUS_NOW_META[statusNow] ?? STATUS_NOW_META.unknown;
  return `<span style="display:inline-flex;align-items:center;gap:6px;font:700 11px 'IBM Plex Mono';text-transform:uppercase;letter-spacing:.06em;color:${meta.color}"><span style="width:8px;height:8px;border-radius:50%;background:${meta.color}"></span>${esc(meta.label)}</span>`;
}

const scoreOrDash = (v: number | null | undefined, suffix = ""): string =>
  v == null ? `<span class="nodata">—</span>` : `<b>${v}${suffix}</b>`;

export function providersPage(
  providers: ProviderProfile[],
  table: ProviderScoreTable,
): string {
  const totals = providers.reduce(
    (acc, p) => {
      const w = table.providers[p.id]?.windows.d7;
      acc.resolutions += w?.resolutionsTotal ?? 0;
      acc.probes += w?.probesTotal ?? 0;
      acc.verifications +=
        (w?.verificationMatch ?? 0) + (w?.verificationMismatch ?? 0);
      return acc;
    },
    { resolutions: 0, probes: 0, verifications: 0 },
  );
  const cards = providers
    .map((p) => {
      const s = table.providers[p.id];
      return `<div class="card" data-id="${esc(p.id)}">
<h3><a href="/directory/provider/${esc(p.id)}">${esc(p.name)}</a></h3>
<div class="badges">${statusChip(s?.statusNow ?? "unknown")}<span class="badge">${esc(p.kind)}</span></div>
<div class="sum">${esc(p.summary)}</div>
<div class="scores"><span>
avail 24h ${scoreOrDash(s?.availability24h, "%")} ·
reliability ${scoreOrDash(s?.reliability.score)} ·
share 7d ${scoreOrDash(s?.share7d, "%")} ·
methods <b>${p.methods.length}</b></span></div>
</div>`;
    })
    .join("");
  const body = `${nav("providers")}
<p class="sub">The resolver providers behind ThisDID's routing chains — the TS Universal Resolver driver fleet and
the redundant upstreams — with live availability, a measured <b>reliability</b> composite
(success consistency, stability, latency discipline, throttle behavior, verification
agreement), and each provider's share of routed traffic. Numbers come from the engine's own
probes and <a href="/analytics">analytics</a>. Want your resolver in these chains? See
<a href="/directory/join">joining as a provider</a>.</p>
<div class="panel"><h2>Network totals · 7 days</h2>
<div class="scores"><span>resolutions <b>${totals.resolutions}</b> ·
health probes <b>${totals.probes}</b> ·
probation verifications <b>${totals.verifications}</b> ·
providers <b>${providers.length}</b></span></div></div>
<div class="grid">${cards}</div>`;
  return shell("Providers — ThisDID Directory", body);
}

const COMPONENT_LABELS: [keyof ReliabilityScore["components"], string][] = [
  ["successConsistency", "Success consistency (40%)"],
  ["stability", "Stability / anti-flap (25%)"],
  ["latencyDiscipline", "Latency discipline (15%)"],
  ["throttleBehavior", "Throttle behavior (10%)"],
  ["verificationAgreement", "Verification agreement (10%)"],
];

function windowRow(label: string, w: ProviderWindow): string {
  const cell = (v: number | string | null): string =>
    v == null ? "—" : String(v);
  return `<tr><td>${esc(label)}</td>
<td class="num">${cell(w.probesTotal)}</td>
<td class="num">${cell(w.probesOk)}</td>
<td class="num">${cell(w.probesRateLimited)}</td>
<td class="num">${cell(w.probeLatencyAvgMs)}</td>
<td class="num">${cell(w.probeLatencyWorstP95Ms)}</td>
<td class="num">${cell(w.resolutionsTotal)}</td>
<td class="num">${cell(w.verificationMatch)}</td>
<td class="num">${cell(w.verificationMismatch)}</td>
<td class="num">${cell(w.statusTransitions)}</td></tr>`;
}

export function providerPage(
  p: ProviderProfile,
  s: ProviderScores | undefined,
): string {
  const rel = s?.reliability;
  const componentRows = COMPONENT_LABELS.map(([key, label]) =>
    meterRow(label, rel?.components[key] ?? null, ""),
  ).join("");
  const methodChips = p.methods
    .map(
      (m) =>
        `<a class="hop" style="text-decoration:none" href="/directory/method/${esc(m)}">did:${esc(m)}</a>`,
    )
    .join("");
  const facts: string[] = [
    `<dt>Kind</dt><dd>${esc(p.kind)}</dd>`,
    `<dt>Operator</dt><dd>${esc(p.operator)}</dd>`,
    ...(p.baseUrl ? [`<dt>Endpoint</dt><dd>${esc(p.baseUrl)}</dd>`] : []),
    `<dt>Auth</dt><dd>${esc(p.auth)}</dd>`,
    `<dt>JSON API</dt><dd><a href="/directory/api/providers/${esc(p.id)}">/directory/api/providers/${esc(p.id)}</a></dd>`,
  ];
  const body = `${nav("providers")}
<div class="panel"><div class="title">${esc(p.name)}</div>
<div class="badges">${statusChip(s?.statusNow ?? "unknown")}<span class="badge">${esc(p.kind)}</span></div>
<p class="sub" style="margin:10px 0 0">${esc(p.summary)}</p></div>
<div class="panel"><h2>Scores</h2>
${meterRow("Availability 24h", s?.availability24h ?? null, "%")}
${meterRow("Availability 7d", s?.availability7d ?? null, "%")}
${meterRow("Reliability (30d composite)", rel?.score ?? null, "")}
<div style="margin:12px 0 0;padding-top:10px;border-top:1px solid var(--border)">
<h2 style="margin-bottom:10px">Reliability components</h2>
${componentRows}</div></div>
<div class="panel"><h2>Windows</h2>
<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font:12.5px 'IBM Plex Mono'">
<thead><tr style="color:var(--dim);text-align:left">
<th style="padding:4px 8px 8px 0">window</th><th class="num">probes</th><th class="num">ok</th>
<th class="num">429s</th><th class="num">avg ms</th><th class="num">worst p95</th>
<th class="num">routed</th><th class="num">✓ match</th><th class="num">✗ mismatch</th>
<th class="num">flaps</th></tr></thead>
<tbody>${s ? [windowRow("24h", s.windows.h24), windowRow("7d", s.windows.d7), windowRow("30d", s.windows.d30)].join("") : ""}</tbody>
</table></div>
<div class="sub" style="margin:10px 0 0;font-size:12.5px">History accrues from the
engine's hourly rollups; "no data" means the window predates them, never a fabricated
number. Live raw feed on <a href="/analytics">/analytics</a>.</div></div>
<div class="panel"><h2>Methods served (${p.methods.length})</h2>
<div class="chain">${methodChips}</div></div>
<div class="panel"><h2>Facts</h2><dl class="kv">${facts.join("")}</dl></div>
<div class="panel"><h2>Links</h2><ul class="links">${p.links
    .map(
      (l) =>
        `<li><a href="${esc(l.url)}" rel="noopener noreferrer" target="_blank">${esc(l.label)}</a></li>`,
    )
    .join("")}</ul></div>`;
  return shell(`${p.name} — ThisDID Directory`, body);
}

export function joinPage(): string {
  const body = `${nav("providers")}
<div class="panel"><div class="title">Join as a provider</div>
<p class="sub" style="margin:10px 0 0">ThisDID routes every DID method through an ordered
chain of redundant resolvers, and the chains are open: an independently operated resolver
that meets the bar below can be added as a routing step, get probed every five minutes, verify
probation drivers, and appear on this dashboard with measured availability and reliability.</p></div>
<div class="panel"><h2>Requirements</h2><ul class="links">
<li>A DIF Universal Resolver interface: <span style="font-family:'IBM Plex Mono';font-size:12.5px">GET /1.0/identifiers/{did}</span> returning DID Core resolution results.</li>
<li>A published method catalog — which DID methods you authoritatively resolve.</li>
<li>An always-on health endpoint (unmetered) if your resolver API is quota-throttled.</li>
<li>Stable operation: the probes measure availability, latency, flapping, and throttling continuously — the scores on this page are earned, not declared.</li>
<li>An operator contact for incidents.</li>
</ul></div>
<div class="panel"><h2>Process</h2>
<p class="sub" style="margin:0">Open a pull request against
<a href="https://github.com/decentralized-identity/thisdid" rel="noopener noreferrer" target="_blank">decentralized-identity/thisdid</a>
adding your provider profile (directory data), your upstream configuration (routing registry
+ method support set), and a probe canary. The maintainers review, the probes start
measuring, and routing chains adopt the new step where it earns its place. Questions:
the <a href="https://identity.foundation/working-groups/identifiers-discovery.html" rel="noopener noreferrer" target="_blank">DIF Identifiers &amp; Discovery WG</a>.</p></div>`;
  return shell("Join as a provider — ThisDID Directory", body);
}
