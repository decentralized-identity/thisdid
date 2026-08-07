import type { ReactNode } from 'react'
import { ALL_METHODS, exampleFor, FEATURED_METHODS, mixHex } from '../lib/methods'
import * as Icon from '../icons'

const h2 = { fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 'clamp(28px,3.2vw,40px)', letterSpacing: '-.02em', margin: '0 0 12px', lineHeight: 1.08 } as const
const lead = { fontSize: 16, lineHeight: 1.6, color: 'var(--dim)', margin: 0 } as const
const eyebrow = (color: string) => ({ fontSize: 12.5, fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color, marginBottom: 12 }) as const

const ACC = '#d97757'
const TW = '#b587f0'

const STEPS: { num: string; title: string; body: string; icon: ReactNode; accent: boolean }[] = [
  { num: '01', title: 'Parse & classify', body: 'The DID is parsed and matched against the method registry to identify its resolution strategy.', icon: <Icon.Brackets size={20} />, accent: true },
  { num: '02', title: 'Rules engine', body: 'A policy engine weighs latency, trust and freshness to select the right conformant method driver.', icon: <Icon.Gear size={20} />, accent: false },
  { num: '03', title: 'Dispatch to driver', body: 'The request is dispatched to its matching driver — many run in parallel for speed.', icon: <Icon.Nodes size={20} />, accent: true },
  { num: '04', title: 'Sign & return', body: 'A unified, W3C-conformant document is returned with signed resolution metadata.', icon: <Icon.Shield size={20} />, accent: false },
]

export function HowItWorks() {
  return (
    <section id="how" style={{ maxWidth: 1240, margin: '0 auto', padding: '66px 26px 20px' }}>
      <div style={{ maxWidth: 640, marginBottom: 34 }}>
        <div style={eyebrow('var(--accent)')}>How ThisDID resolves</div>
        <h2 style={h2}>DID resolver and routing engine.</h2>
        <p style={lead}>Every request hits a rules engine that picks the fastest, most trustworthy driver for that method — then normalizes the response into one conformant document.</p>
      </div>
      <div className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        {STEPS.map((st) => (
          <div key={st.num} style={{ padding: 22, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--surface)', position: 'relative', overflow: 'hidden' }}>
            <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>{st.num}</div>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', marginBottom: 14, background: `color-mix(in srgb,var(${st.accent ? '--accent' : '--twist'}) ${st.accent ? 14 : 16}%,transparent)`, color: `var(${st.accent ? '--accent' : '--twist'})` }}>{st.icon}</div>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 7 }}>{st.title}</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--dim)' }}>{st.body}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

export function Methods({ onResolve }: { onResolve: (did: string) => void }) {
  const graded = FEATURED_METHODS.map((m, i) => ({ ...m, color: mixHex(ACC, TW, FEATURED_METHODS.length > 1 ? i / (FEATURED_METHODS.length - 1) : 0) }))
  return (
    <section id="methods" style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 26px 20px' }}>
      <div style={{ maxWidth: 640, marginBottom: 28 }}>
        <div style={eyebrow('var(--twist)')}>Supported methods</div>
        <h2 style={h2}>One endpoint. Every DID method.</h2>
        <p style={lead}>ThisDID dispatches each identifier to a conformant method driver — a growing fleet of 70+ resolvers behind a single API.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
        {graded.map((m) => (
          <button key={m.id} onClick={() => onResolve(m.example)} style={{ textAlign: 'left', cursor: 'pointer', padding: 18, borderRadius: 16, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, display: 'grid', placeItems: 'center', fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 16, color: m.color, background: `color-mix(in srgb, ${m.color} 16%, var(--surface2))`, border: `1px solid color-mix(in srgb, ${m.color} 28%, transparent)` }}>{m.glyph}</span>
            <div>
              <div style={{ fontFamily: "'IBM Plex Mono'", fontWeight: 600, fontSize: 14.5, color: 'var(--text)' }}>{m.name}</div>
              <div style={{ fontSize: 12.5, color: 'var(--dim)', marginTop: 5, lineHeight: 1.4 }}>{m.desc}</div>
            </div>
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '30px 0 16px' }}>
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: 'var(--faint)', whiteSpace: 'nowrap' }}>All supported methods</span>
        <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {ALL_METHODS.map((id) => (
          <button key={id} onClick={() => onResolve(exampleFor(id))} style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12.5, fontWeight: 500, color: 'var(--dim)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '7px 12px', borderRadius: 9, cursor: 'pointer' }}>did:{id}</button>
        ))}
      </div>
    </section>
  )
}

const PROVIDERS = [
  {
    name: 'GoPlausible',
    by: 'GoPlausible',
    glyph: 'G',
    color: 'var(--twist)',
    desc: 'Algorand-native resolver worker. ThisDID routes did:algo and did:nfd here first, then falls back to godiddy & archon.',
    resolver: 'goplausible.com',
    href: 'https://goplausible.com',
  },
  {
    name: 'Godiddy',
    by: 'Danube Tech',
    glyph: 'G',
    color: 'var(--res-b)',
    desc: 'Hosted Universal Resolver & Registrar API. ThisDID routes here for most methods that need an upstream driver.',
    resolver: 'api.godiddy.com',
    href: 'https://godiddy.com',
  },
  {
    name: 'Archon',
    by: 'Archon Technology',
    glyph: 'A',
    color: 'var(--res-c)',
    desc: 'Universal Resolver running the iden3 & did:cid drivers. ThisDID routes iden3 here first, and uses it as a final fallback elsewhere.',
    resolver: 'resolver.archon.technology',
    href: 'https://archon.technology',
  },
]

export function ResolverProviders() {
  return (
    <section id="providers" style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 26px 20px' }}>
      <div style={{ maxWidth: 640, marginBottom: 28 }}>
        <div style={eyebrow('var(--res-b)')}>Resolver providers</div>
        <h2 style={h2}>Redundant routes, trusted partners.</h2>
        <p style={lead}>When ThisDID can’t resolve a method in-Worker, it routes to these conformant Universal Resolvers — in a method-specific order, with automatic fallback.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {PROVIDERS.map((p) => (
          <a key={p.name} href={p.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'var(--text)', display: 'flex', flexDirection: 'column', gap: 14, padding: 24, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--surface)', boxShadow: 'var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 44, height: 44, borderRadius: 12, display: 'grid', placeItems: 'center', fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 19, color: p.color, background: `color-mix(in srgb, ${p.color} 16%, var(--surface2))`, border: `1px solid color-mix(in srgb, ${p.color} 28%, transparent)` }}>{p.glyph}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 18 }}>{p.name}</div>
                <div style={{ fontSize: 12.5, color: 'var(--faint)', fontWeight: 600 }}>by {p.by}</div>
              </div>
              <span style={{ marginLeft: 'auto', color: 'var(--dim)' }}>
                <Icon.ExternalArrow size={16} />
              </span>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.55, color: 'var(--dim)' }}>{p.desc}</div>
            <div style={{ fontFamily: "'IBM Plex Mono'", fontSize: 12.5, color: p.color, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px' }}>{p.resolver}</div>
          </a>
        ))}
      </div>
    </section>
  )
}

const NET_STATS = [
  { value: '42', label: 'Edge regions' },
  { value: '3', label: 'Failover providers' },
  { value: '256-bit', label: 'Signed metadata' },
  { value: '100%', label: 'DIF conformance' },
]

export function NetworkCTA({ onResolveCta }: { onResolveCta: () => void }) {
  return (
    <section id="network" style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 26px 20px' }}>
      <div className="net-grid" style={{ borderRadius: 24, border: '1px solid var(--border2)', overflow: 'hidden', background: 'linear-gradient(130deg,color-mix(in srgb,var(--accent) 14%,var(--surface)),color-mix(in srgb,var(--twist) 12%,var(--surface)))', padding: 44, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 36, alignItems: 'center' }}>
        <div>
          <h2 style={{ ...h2, fontSize: 'clamp(26px,3vw,38px)', margin: '0 0 14px', lineHeight: 1.1 }}>Globally distributed. Always compliant.</h2>
          <p style={{ ...lead, margin: '0 0 24px', maxWidth: 520 }}>ThisDID runs at the edge worldwide, returning fully W3C DID-Core and DIF-conformant resolution results with signed metadata — ready to plug into any verifiable-credential stack.</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button onClick={onResolveCta} style={{ border: 0, cursor: 'pointer', fontWeight: 700, fontSize: 14.5, padding: '12px 22px', borderRadius: 12, background: 'linear-gradient(135deg,var(--accent),var(--accent-bright))', color: '#fff', boxShadow: '0 10px 24px -10px var(--glow)' }}>Resolve a DID now</button>
            <a href="/docs" target="_blank" rel="noopener" style={{ textDecoration: 'none', fontWeight: 700, fontSize: 14.5, padding: '12px 22px', borderRadius: 12, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>Read the docs</a>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {NET_STATS.map((n) => (
            <div key={n.label} style={{ padding: 18, borderRadius: 16, background: 'color-mix(in srgb,var(--surface) 70%,transparent)', border: '1px solid var(--border)' }}>
              <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 26, letterSpacing: '-.02em', color: 'var(--accent-bright)' }}>{n.value}</div>
              <div style={{ fontSize: 12.5, color: 'var(--dim)', fontWeight: 600, marginTop: 4 }}>{n.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

export function Footer() {
  return (
    <footer style={{ maxWidth: 1240, margin: '40px auto 0', padding: '40px 26px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ background: '#f4efe6', borderRadius: 8, padding: '4px 7px', display: 'grid', placeItems: 'center' }}>
          <img src="/DIF_logo.png" alt="DIF" style={{ height: 18, width: 'auto', display: 'block' }} />
        </span>
        <span style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 15 }}>
          this<span style={{ color: 'var(--accent)' }}>DID</span>
        </span>
        <span style={{ fontSize: 13, color: 'var(--faint)', marginLeft: 6 }}>Universal DID Resolver</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', fontSize: 13, color: 'var(--faint)' }}>
        <a href="https://goplausible.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--dim)', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
          Built by GoPlausible
          <Icon.ExternalArrow size={12} />
        </a>
        <a href="/analytics" style={{ color: 'var(--dim)', textDecoration: 'none', fontWeight: 600 }}>Analytics</a>
        <span>© 2026 ThisDID · DIF W3C DID-Core conformant universal DID Resolver</span>
      </div>
    </footer>
  )
}
