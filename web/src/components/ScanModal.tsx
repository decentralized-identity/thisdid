import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr-es6'
import * as Icon from '../icons'

const GREEN = '#4ade80'

const corner = (pos: Record<string, unknown>) => ({ position: 'absolute', width: 26, height: 26, ...pos }) as const

/** Pull a `did:...` out of a scanned string (bare DID or a URL containing one). */
function extractDid(raw: string): string | null {
  const s = raw.trim()
  const i = s.toLowerCase().indexOf('did:')
  const v = i >= 0 ? s.slice(i) : s
  return v.toLowerCase().startsWith('did:') && v.split(':').length >= 3 ? v : null
}

/**
 * Scan-a-DID-QR modal — the styled viewport is unchanged; a live camera feed is
 * mounted beneath it and the frame greens on detection, then the DID is resolved.
 */
export function ScanModal({ onClose, onResolve }: { onClose: () => void; onResolve: (did: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const resolveRef = useRef(onResolve)
  resolveRef.current = onResolve
  const doneRef = useRef(false)

  const [streaming, setStreaming] = useState(false)
  const [detected, setDetected] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    let raf = 0
    let stream: MediaStream | null = null
    const video = videoRef.current
    const canvas = canvasRef.current

    function tick() {
      raf = requestAnimationFrame(tick)
      if (doneRef.current || !video || !canvas) return
      if (video.readyState !== video.HAVE_ENOUGH_DATA) return
      const w = video.videoWidth
      const h = video.videoHeight
      if (!w || !h) return
      canvas.width = w
      canvas.height = h
      const cx = canvas.getContext('2d', { willReadFrequently: true })
      if (!cx) return
      cx.drawImage(video, 0, 0, w, h)
      const img = cx.getImageData(0, 0, w, h)
      const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })
      const did = code?.data ? extractDid(code.data) : null
      if (did) {
        doneRef.current = true
        cancelAnimationFrame(raf)
        setDetected(true)
        setTimeout(() => resolveRef.current(did), 650)
      }
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop())
          return
        }
        stream = s
        if (video) {
          video.srcObject = s
          video.setAttribute('playsinline', 'true')
          void video.play()
        }
        setStreaming(true)
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setError(true))

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const acc = detected ? GREEN : 'var(--accent)'
  const caption = detected
    ? 'DID detected — resolving…'
    : error
      ? 'Camera unavailable — check permissions and try again.'
      : streaming
        ? 'Point your camera at a DID QR code.'
        : 'Starting camera…'

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(8,6,4,0.6)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 'min(420px,92vw)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 22, boxShadow: 'var(--shadow)', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'color-mix(in srgb,var(--accent) 16%,transparent)', color: 'var(--accent-bright)' }}>
              <Icon.QrIcon />
            </span>
            <div style={{ fontFamily: "'Space Grotesk'", fontWeight: 700, fontSize: 17 }}>Scan a DID QR</div>
          </div>
          <button onClick={onClose} title="Close" style={{ width: 34, height: 34, border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 10, cursor: 'pointer', color: 'var(--dim)', display: 'grid', placeItems: 'center' }}>
            <Icon.Close />
          </button>
        </div>
        <div
          style={{
            position: 'relative',
            aspectRatio: '1 / 1',
            borderRadius: 16,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            boxShadow: detected ? `inset 0 0 0 2px ${GREEN}, 0 0 26px -6px ${GREEN}` : 'none',
            transition: 'box-shadow .2s',
          }}
        >
          {/* live camera feed — sits under the styled overlay */}
          <video ref={videoRef} muted autoPlay playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: streaming ? 'block' : 'none' }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {/* corner brackets (green on detect) */}
          <span style={corner({ top: 14, left: 14, borderTop: `3px solid ${acc}`, borderLeft: `3px solid ${acc}`, borderRadius: '6px 0 0 0' })} />
          <span style={corner({ top: 14, right: 14, borderTop: `3px solid ${acc}`, borderRight: `3px solid ${acc}`, borderRadius: '0 6px 0 0' })} />
          <span style={corner({ bottom: 14, left: 14, borderBottom: `3px solid ${acc}`, borderLeft: `3px solid ${acc}`, borderRadius: '0 0 0 6px' })} />
          <span style={corner({ bottom: 14, right: 14, borderBottom: `3px solid ${acc}`, borderRight: `3px solid ${acc}`, borderRadius: '0 0 6px 0' })} />

          {/* faint QR glyph — only while there's no live feed */}
          {!streaming && (
            <svg width="42%" height="42%" viewBox="0 0 24 24" fill="none" stroke="var(--faint)" strokeWidth={1.4}>
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <path d="M14 14h3M14 18h3M14 21h7M18 14v3M21 14v7" strokeLinecap="round" />
            </svg>
          )}

          {/* scan line (hidden once detected) */}
          {!detected && (
            <div style={{ position: 'absolute', left: '8%', right: '8%', height: 2, top: '10%', background: `linear-gradient(90deg,transparent,${acc},transparent)`, boxShadow: `0 0 12px ${acc}`, animation: 'scanline 2.6s ease-in-out infinite' }} />
          )}
        </div>
        <div style={{ textAlign: 'center', color: detected ? GREEN : 'var(--dim)', fontWeight: detected ? 700 : 400, fontSize: 13.5, lineHeight: 1.5, marginTop: 16 }}>{caption}</div>
      </div>
    </div>
  )
}
