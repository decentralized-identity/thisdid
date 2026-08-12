import { useEffect, useRef } from "react";

interface Palette {
  line: string;
  hub: string;
  accent: string;
  twist: string;
  teal: string;
  amber: string;
  text: string;
  ring: string;
  glow: string;
}

function palette(dark: boolean): Palette {
  return dark
    ? {
        line: "rgba(255,255,255,0.07)",
        hub: "#ff916a",
        accent: "#d97757",
        twist: "#b587f0",
        teal: "#5fd0e0",
        amber: "#f0b968",
        text: "rgba(244,239,230,0.55)",
        ring: "rgba(217,119,87,0.5)",
        glow: "rgba(217,119,87,0.4)",
      }
    : {
        line: "rgba(30,24,16,0.10)",
        hub: "#c9633f",
        accent: "#c9633f",
        twist: "#8b5cf6",
        teal: "#2f9fb0",
        amber: "#d38f36",
        text: "rgba(60,50,40,0.6)",
        ring: "rgba(201,99,63,0.45)",
        glow: "rgba(201,99,63,0.25)",
      };
}

interface Packet {
  mi: number;
  ri: number;
  direct: boolean;
  seg: number;
  p: number;
  sp: number;
}

/** The animated routing diagram: left nodes → ThisDID hub → resolvers.
 * `labels` sets the 7 left-node captions (top methods or countries, live);
 * `total` is drawn above the hub (all-time resolutions). */
export function RoutingCanvas({
  dark,
  motion = true,
  labels,
  total,
  countryMode = false,
}: {
  dark: boolean;
  motion?: boolean;
  labels?: string[];
  total?: string;
  countryMode?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef(dark);
  const labelsRef = useRef(labels);
  const totalRef = useRef(total);
  const countryModeRef = useRef(countryMode);

  useEffect(() => {
    darkRef.current = dark;
    labelsRef.current = labels;
    totalRef.current = total;
    countryModeRef.current = countryMode;
  }, [countryMode, dark, labels, total]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const methods = Array.from({ length: 7 }, () => ({ pulse: 0 }));
    const resolvers = [
      { label: "GoPlausible", pulse: 0 },
      { label: "Godiddy", pulse: 0 },
      { label: "Archon", pulse: 0 },
    ];
    let hubPulse = 0;
    const packets: Packet[] = [];
    let hub = { x: 0, y: 0 };

    // Uniform scale + wider node spread on narrow canvases so labels don't crowd.
    const scale = () => Math.max(0.7, Math.min(1, W / 460));
    const edge = () => (W < 400 ? 0.1 : 0.15);
    const mpos = (i: number) => ({
      x: W * edge(),
      y:
        H *
        (0.15 + (methods.length > 1 ? i / (methods.length - 1) : 0.5) * 0.7),
    });
    const rpos = (i: number) => ({
      x: W * (1 - edge()),
      y: H * (0.28 + i * 0.22),
    });

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      hub = { x: W * 0.5, y: H * 0.5 };
    };
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(canvas);

    const resColors = (pal: Palette) => [pal.twist, pal.teal, pal.amber];
    const countryFlag = (code: string) => {
      const normalized = code.trim().toUpperCase();
      if (!/^[A-Z]{2}$/.test(normalized)) return "🌐";
      return String.fromCodePoint(
        ...Array.from(normalized).map((char) => 127397 + char.charCodeAt(0)),
      );
    };
    const spawn = () => {
      if (!motion) return;
      const mi = Math.floor(Math.random() * methods.length);
      const direct = Math.random() < 0.45;
      const ri = direct ? -1 : Math.floor(Math.random() * resolvers.length);
      packets.push({
        mi,
        ri,
        direct,
        seg: 0,
        p: 0,
        sp: 0.85 + Math.random() * 0.5,
      });
    };
    const leftBusX = () => W * 0.36;
    const rightBusX = () => W * 0.64;
    const leftCircuit = (p: { x: number; y: number }) => [
      p,
      { x: leftBusX(), y: p.y },
      { x: leftBusX(), y: hub.y },
      hub,
    ];
    const rightCircuit = (p: { x: number; y: number }) => [
      hub,
      { x: rightBusX(), y: hub.y },
      { x: rightBusX(), y: p.y },
      p,
    ];
    const build = (pk: Packet) => {
      const m = mpos(pk.mi);
      const left = leftCircuit(m);
      const r = pk.direct ? undefined : rpos(pk.ri);
      const right = r ? rightCircuit(r) : [];
      const points = pk.direct
        ? [...left, ...left.slice(0, -1).reverse()]
        : [
            ...left,
            ...right.slice(1),
            ...right.slice(0, -1).reverse(),
            ...left.slice(0, -1).reverse(),
          ];
      return points.map((p) => ({
        p,
        k: p === hub ? "h" : p === m ? "m" : r && p === r ? "r" : "",
      }));
    };
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    let last = performance.now();
    let acc = 0;
    let raf = 0;

    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      acc += dt;
      if (acc > 0.34) {
        acc = 0;
        if (packets.length < 24) spawn();
      }
      const pal = palette(darkRef.current);
      const rc = resColors(pal);
      const S = scale();
      ctx.clearRect(0, 0, W, H);

      ctx.lineWidth = 1;
      ctx.strokeStyle = pal.line;

      // Shared vertical buses keep every branch aligned like a designed PCB.
      const methodPoints = methods.map((_, i) => mpos(i));
      const resolverPoints = resolvers.map((_, i) => rpos(i));
      ctx.beginPath();
      ctx.moveTo(leftBusX(), methodPoints[0].y);
      ctx.lineTo(leftBusX(), methodPoints[methodPoints.length - 1].y);
      ctx.moveTo(leftBusX(), hub.y);
      ctx.lineTo(hub.x, hub.y);
      ctx.moveTo(hub.x, hub.y);
      ctx.lineTo(rightBusX(), hub.y);
      ctx.moveTo(rightBusX(), resolverPoints[0].y);
      ctx.lineTo(rightBusX(), resolverPoints[resolverPoints.length - 1].y);
      ctx.stroke();

      methods.forEach((_, i) => {
        const p = mpos(i);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(leftBusX(), p.y);
        ctx.stroke();
        ctx.fillStyle = pal.line;
        ctx.fillRect(leftBusX() - 1.7 * S, p.y - 1.7 * S, 3.4 * S, 3.4 * S);
      });
      resolvers.forEach((_, i) => {
        const p = rpos(i);
        ctx.beginPath();
        ctx.moveTo(rightBusX(), p.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.fillStyle = pal.line;
        ctx.fillRect(rightBusX() - 1.7 * S, p.y - 1.7 * S, 3.4 * S, 3.4 * S);
      });

      // Larger central junctions visually terminate both aligned buses.
      ctx.fillStyle = pal.ring;
      [leftBusX(), rightBusX()].forEach((x) => {
        ctx.beginPath();
        ctx.arc(x, hub.y, 2.4 * S, 0, Math.PI * 2);
        ctx.fill();
      });

      // Short radial contacts make the central router read like a circuit hub.
      ctx.save();
      ctx.translate(hub.x, hub.y);
      ctx.strokeStyle = pal.ring;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) {
        const angle = (Math.PI * i) / 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * 29 * S, Math.sin(angle) * 29 * S);
        ctx.lineTo(Math.cos(angle) * 38 * S, Math.sin(angle) * 38 * S);
        ctx.stroke();
      }
      ctx.restore();

      const t = now / 1000;
      ctx.save();
      ctx.strokeStyle = pal.ring;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([4, 9]);
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 34 * S, t * 0.5, t * 0.5 + Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      for (let i = packets.length - 1; i >= 0; i--) {
        const pk = packets[i];
        const pts = build(pk);
        const a = pts[pk.seg].p;
        const b = pts[pk.seg + 1].p;
        const segLen = dist(a, b) || 1;
        pk.p += (pk.sp * 150 * dt) / segLen;
        while (pk.p >= 1) {
          pk.p -= 1;
          pk.seg++;
          if (pk.seg >= pts.length - 1) {
            packets.splice(i, 1);
            break;
          }
          const k = pts[pk.seg].k;
          if (k === "h") hubPulse = 1;
          else if (k === "r") resolvers[pk.ri].pulse = 1;
          else if (k === "m") methods[pk.mi].pulse = 1;
        }
        if (pk.seg >= pts.length - 1) continue;
        const a2 = pts[pk.seg].p;
        const b2 = pts[pk.seg + 1].p;
        const x = a2.x + (b2.x - a2.x) * pk.p;
        const y = a2.y + (b2.y - a2.y) * pk.p;
        const col = pk.direct ? pal.accent : rc[pk.ri];
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 12 * S;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, 3.1 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.textBaseline = "middle";
      methods.forEach((m, i) => {
        const p = mpos(i);
        const col = pal.accent;
        if (m.pulse > 0) {
          ctx.save();
          ctx.globalAlpha = m.pulse * 0.45;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (7 + (1 - m.pulse) * 13) * S, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          m.pulse = Math.max(0, m.pulse - dt * 2);
        }
        if (countryModeRef.current) {
          ctx.font = `${(16 * S).toFixed(1)}px "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(
            countryFlag(labelsRef.current?.[i] ?? ""),
            p.x,
            p.y + 0.5 * S,
          );
        } else {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 5.5 * S, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = pal.text;
        ctx.font = `600 ${(10 * S).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "left";
        ctx.fillText(
          labelsRef.current?.[i] ?? "did:method" + (i + 1),
          p.x + 12 * S,
          p.y,
        );
      });

      resolvers.forEach((r, i) => {
        const p = rpos(i);
        const col = rc[i];
        if (r.pulse > 0) {
          ctx.save();
          ctx.globalAlpha = r.pulse * 0.5;
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (10 + (1 - r.pulse) * 17) * S, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          r.pulse = Math.max(0, r.pulse - dt * 1.8);
        }
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 10 * S;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 8.5 * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.fillStyle = pal.text;
        ctx.font = `600 ${(10 * S).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.textAlign = "right";
        ctx.fillText(r.label, p.x - 15 * S, p.y);
      });

      if (hubPulse > 0) {
        ctx.save();
        ctx.globalAlpha = hubPulse * 0.4;
        ctx.fillStyle = pal.glow;
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, (26 + (1 - hubPulse) * 40) * S, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        hubPulse = Math.max(0, hubPulse - dt * 1.6);
      }
      const grd = ctx.createRadialGradient(
        hub.x,
        hub.y,
        2,
        hub.x,
        hub.y,
        30 * S,
      );
      grd.addColorStop(0, pal.hub);
      grd.addColorStop(1, pal.accent);
      ctx.save();
      ctx.shadowColor = pal.glow;
      ctx.shadowBlur = 26 * S;
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, 24 * S, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#fff";
      ctx.font = `700 ${(12 * S).toFixed(1)}px "Space Grotesk", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("ThisDID", hub.x, hub.y);

      // all-time total, above the hub
      const totalText = totalRef.current;
      if (totalText) {
        const ty = hub.y - 24 * S - 13 * S;
        ctx.fillStyle = pal.hub;
        ctx.font = `700 ${(15 * S).toFixed(1)}px "Space Grotesk", sans-serif`;
        ctx.fillText(totalText, hub.x, ty);
        ctx.fillStyle = pal.text;
        ctx.font = `600 ${(8.5 * S).toFixed(1)}px "IBM Plex Mono", monospace`;
        ctx.fillText("resolutions", hub.x, ty - 12 * S);
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [motion]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
      }}
    />
  );
}
