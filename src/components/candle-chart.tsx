"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Overlays {
  swings: { i: number; price: number; kind: "high" | "low" }[];
  structure: { i: number; kind: "BOS" | "CHoCH"; dir: "bull" | "bear"; level: number; fromI: number }[];
  orderBlocks: { i: number; dir: "bull" | "bear"; top: number; bottom: number; createdAt: number; invalidatedAt?: number }[];
  fvgs: { i: number; dir: "bull" | "bear"; top: number; bottom: number; createdAt: number; filledAt?: number; fillProb?: number }[];
  sweeps: { i: number; dir: "bull" | "bear"; level: number }[];
  signals: { i: number; dir: "bull" | "bear" | null; score: number }[];
  profile: { poc: number; vah: number; val: number; bins: { price: number; volume: number }[] } | null;
  setup?: { dir: "bull" | "bear"; entry: number; stop: number; target: number } | null;
}

export type Layer = "fvg" | "ob" | "structure" | "swings" | "sweeps" | "profile" | "signals";

const fmtPrice = (p: number) => (p >= 1000 ? p.toLocaleString("en-US", { maximumFractionDigits: 0 }) : p >= 10 ? p.toFixed(2) : p.toFixed(4));

export function CandleChart({
  candles,
  overlays,
  layers,
  interval,
  height = 440,
}: {
  candles: Candle[];
  overlays: Overlays;
  layers: Set<Layer>;
  interval: string;
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  // Measured from the container; nothing is drawn until then, so the SVG never props its parent open.
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<{ i: number; y: number } | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const M = { l: 6, r: 66, t: 14, b: 26 };
  const W = width - M.l - M.r;
  const H = height - M.t - M.b;
  const n = candles.length;
  const step = W / Math.max(1, n);
  const bodyW = Math.max(1, Math.min(9, step * 0.62));

  const { lo, hi } = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      lo = Math.min(lo, c.l);
      hi = Math.max(hi, c.h);
    }
    if (overlays.setup) {
      lo = Math.min(lo, overlays.setup.stop, overlays.setup.target);
      hi = Math.max(hi, overlays.setup.stop, overlays.setup.target);
    }
    const pad = (hi - lo) * 0.06 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [candles, overlays.setup]);

  const x = (i: number) => M.l + (i + 0.5) * step;
  const y = (p: number) => M.t + (1 - (p - lo) / (hi - lo)) * H;
  const clampY = (p: number) => Math.max(M.t, Math.min(M.t + H, y(p)));

  const ticks = useMemo(() => {
    const raw = (hi - lo) / 5;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const nice = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((k) => k >= raw) ?? raw;
    const out: number[] = [];
    for (let v = Math.ceil(lo / nice) * nice; v <= hi; v += nice) out.push(v);
    return out;
  }, [lo, hi]);

  const timeTicks = useMemo(() => {
    const count = Math.max(2, Math.floor(W / 120));
    const every = Math.max(1, Math.floor(n / count));
    const out: number[] = [];
    for (let i = every; i < n; i += every) out.push(i);
    return out;
  }, [n, W]);

  const tfmt = (t: number) => {
    const d = new Date(t);
    return interval === "1d"
      ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric" });
  };

  const color = (d: "bull" | "bear") => (d === "bull" ? "var(--up)" : "var(--down)");
  // Label only the three most recent open gaps; older ones stay as shaded zones.
  const labelled = new Set(
    overlays.fvgs
      .map((g, k) => ({ g, k }))
      .filter(({ g }) => g.filledAt == null)
      .slice(-3)
      .map(({ k }) => k),
  );
  const maxVol = overlays.profile ? Math.max(...overlays.profile.bins.map((b) => b.volume)) : 1;
  const vpW = W * 0.16;
  const binH =
    overlays.profile && overlays.profile.bins.length > 1 ? Math.abs(y(overlays.profile.bins[0].price) - y(overlays.profile.bins[1].price)) : 0;
  const hc = hover ? candles[hover.i] : null;

  if (width === 0) return <div ref={wrap} className="w-full" style={{ height }} />;

  return (
    <div ref={wrap} className="relative w-full min-w-0 select-none overflow-hidden">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Candlestick chart with Smart Money Concepts overlays"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const i = Math.floor((e.clientX - r.left - M.l) / step);
          if (i >= 0 && i < n) setHover({ i, y: e.clientY - r.top });
          else setHover(null);
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((p) => (
          <g key={p}>
            <line x1={M.l} x2={M.l + W} y1={y(p)} y2={y(p)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={M.l + W + 8} y={y(p) + 4} fontSize={11} fill="var(--muted)" className="tnum">
              {fmtPrice(p)}
            </text>
          </g>
        ))}
        {timeTicks.map((i) => (
          <text key={i} x={x(i)} y={height - 8} fontSize={11} fill="var(--muted)" textAnchor="middle">
            {tfmt(candles[i].t)}
          </text>
        ))}
        <line x1={M.l} x2={M.l + W} y1={M.t + H} y2={M.t + H} stroke="var(--chart-axis)" />

        {layers.has("profile") && overlays.profile && (
          <g opacity={0.9}>
            {overlays.profile.bins.map((b, k) => {
              const w = (b.volume / maxVol) * vpW;
              const inVa = b.price >= overlays.profile!.val && b.price <= overlays.profile!.vah;
              return (
                <rect
                  key={k}
                  x={M.l + W - w}
                  y={y(b.price) - binH / 2 + 0.5}
                  width={w}
                  height={Math.max(1, binH - 1)}
                  fill="var(--ink-2)"
                  opacity={inVa ? 0.16 : 0.07}
                />
              );
            })}
            <line
              x1={M.l}
              x2={M.l + W}
              y1={y(overlays.profile.poc)}
              y2={y(overlays.profile.poc)}
              stroke="var(--ink-2)"
              strokeWidth={1}
              opacity={0.45}
            />
            <text x={M.l + 4} y={y(overlays.profile.poc) - 4} fontSize={10} fill="var(--ink-2)">
              POC
            </text>
          </g>
        )}

        {layers.has("ob") &&
          overlays.orderBlocks.map((ob, k) => {
            const x0 = x(Math.max(0, ob.i)) - step / 2;
            const x1 = x(Math.min(n - 1, ob.invalidatedAt ?? n - 1)) + step / 2;
            if (x1 <= M.l) return null;
            return (
              <g key={`ob${k}`}>
                <rect
                  x={Math.max(M.l, x0)}
                  y={clampY(ob.top)}
                  width={Math.max(2, x1 - Math.max(M.l, x0))}
                  height={Math.max(2, clampY(ob.bottom) - clampY(ob.top))}
                  fill={color(ob.dir)}
                  opacity={ob.invalidatedAt != null ? 0.05 : 0.11}
                  stroke={color(ob.dir)}
                  strokeOpacity={0.45}
                  strokeWidth={1}
                />
                <text x={Math.max(M.l, x0) + 3} y={clampY(ob.top) + 11} fontSize={9} fill="var(--ink-2)" fontWeight={600}>
                  OB
                </text>
              </g>
            );
          })}

        {layers.has("fvg") &&
          overlays.fvgs.map((g, k) => {
            const x0 = x(g.i - 1) - step / 2;
            const x1 = x(Math.min(n - 1, g.filledAt ?? n - 1)) + step / 2;
            const open = g.filledAt == null;
            return (
              <g key={`fvg${k}`}>
                <rect
                  x={Math.max(M.l, x0)}
                  y={clampY(g.top)}
                  width={Math.max(2, x1 - Math.max(M.l, x0))}
                  height={Math.max(1.5, clampY(g.bottom) - clampY(g.top))}
                  fill={color(g.dir)}
                  opacity={open ? 0.2 : 0.07}
                />
                {open && labelled.has(k) && (
                  <text x={x1 - 3} y={clampY(g.top) - 3} fontSize={9} fill="var(--ink-2)" textAnchor="end" fontWeight={600}>
                    FVG{g.fillProb != null ? ` · ${Math.round(g.fillProb * 100)}% fill` : ""}
                  </text>
                )}
              </g>
            );
          })}

        {layers.has("structure") &&
          overlays.structure.map((s, k) => {
            const x0 = x(Math.max(0, s.fromI));
            const x1 = x(s.i);
            return (
              <g key={`st${k}`}>
                <line x1={x0} x2={x1} y1={y(s.level)} y2={y(s.level)} stroke={color(s.dir)} strokeWidth={1.25} />
                <text
                  x={(x0 + x1) / 2}
                  y={y(s.level) + (s.dir === "bull" ? -4 : 11)}
                  fontSize={9.5}
                  fontWeight={700}
                  fill="var(--ink-2)"
                  textAnchor="middle"
                >
                  {s.kind}
                </text>
              </g>
            );
          })}

        {candles.map((c, i) => {
          const up = c.c >= c.o;
          const col = up ? "var(--up)" : "var(--down)";
          const top = y(Math.max(c.o, c.c));
          const bot = y(Math.min(c.o, c.c));
          return (
            <g key={c.t}>
              <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
              <rect x={x(i) - bodyW / 2} y={top} width={bodyW} height={Math.max(1, bot - top)} fill={col} rx={bodyW > 4 ? 1 : 0} />
            </g>
          );
        })}

        {layers.has("swings") &&
          overlays.swings.map((s, k) =>
            s.kind === "high" ? (
              <path
                key={`sw${k}`}
                d={`M${x(s.i) - 3.5},${y(s.price) - 9} L${x(s.i) + 3.5},${y(s.price) - 9} L${x(s.i)},${y(s.price) - 4} Z`}
                fill="var(--muted)"
              />
            ) : (
              <path
                key={`sw${k}`}
                d={`M${x(s.i) - 3.5},${y(s.price) + 9} L${x(s.i) + 3.5},${y(s.price) + 9} L${x(s.i)},${y(s.price) + 4} Z`}
                fill="var(--muted)"
              />
            ),
          )}

        {layers.has("sweeps") &&
          overlays.sweeps.map((s, k) => (
            <g key={`sp${k}`}>
              <circle cx={x(s.i)} cy={y(s.level)} r={4.5} fill="none" stroke="#eda100" strokeWidth={2} />
              <circle cx={x(s.i)} cy={y(s.level)} r={1.5} fill="#eda100" />
            </g>
          ))}

        {layers.has("signals") &&
          overlays.signals.map((s, k) => {
            if (!s.dir) return null;
            const c = candles[s.i];
            const up = s.dir === "bull";
            const yy = up ? y(c.l) + 14 : y(c.h) - 14;
            return (
              <path
                key={`sig${k}`}
                d={up ? `M${x(s.i)},${yy - 6} l5,8 h-10 Z` : `M${x(s.i)},${yy + 6} l5,-8 h-10 Z`}
                fill={up ? "var(--up)" : "var(--down)"}
                stroke="var(--surface)"
                strokeWidth={1}
              />
            );
          })}

        {overlays.setup && (
          <g>
            {(
              [
                ["Entry", overlays.setup.entry, "var(--ink)"],
                ["Stop", overlays.setup.stop, "var(--down)"],
                ["Target", overlays.setup.target, "var(--up)"],
              ] as const
            ).map(([label, p, col]) => (
              <g key={label}>
                <line x1={x(Math.max(0, n - 18))} x2={M.l + W} y1={y(p)} y2={y(p)} stroke={col} strokeWidth={1.5} />
                <rect x={M.l + W + 2} y={y(p) - 8} width={M.r - 4} height={16} rx={3} fill={col} />
                <text x={M.l + W + 6} y={y(p) + 4} fontSize={10} fill="var(--surface)" fontWeight={600}>
                  {label}
                </text>
              </g>
            ))}
          </g>
        )}

        {hover && hc && (
          <g pointerEvents="none">
            <line x1={x(hover.i)} x2={x(hover.i)} y1={M.t} y2={M.t + H} stroke="var(--ink-2)" strokeWidth={1} opacity={0.5} />
            {hover.y > M.t && hover.y < M.t + H && (
              <>
                <line x1={M.l} x2={M.l + W} y1={hover.y} y2={hover.y} stroke="var(--ink-2)" strokeWidth={1} opacity={0.35} />
                <rect x={M.l + W + 2} y={hover.y - 8} width={M.r - 4} height={16} rx={3} fill="var(--ink)" />
                <text x={M.l + W + 6} y={hover.y + 4} fontSize={10} fill="var(--surface)" className="tnum">
                  {fmtPrice(lo + (1 - (hover.y - M.t) / H) * (hi - lo))}
                </text>
              </>
            )}
          </g>
        )}
      </svg>
      {hover && hc && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-pop"
          style={{ left: x(hover.i) > width / 2 ? 12 : undefined, right: x(hover.i) <= width / 2 ? M.r + 12 : undefined }}
        >
          <div className="mb-1 text-muted">
            {new Date(hc.t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </div>
          <div className="tnum grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
            <span className="text-muted">Open</span>
            <span className="text-right font-semibold">{fmtPrice(hc.o)}</span>
            <span className="text-muted">High</span>
            <span className="text-right font-semibold">{fmtPrice(hc.h)}</span>
            <span className="text-muted">Low</span>
            <span className="text-right font-semibold">{fmtPrice(hc.l)}</span>
            <span className="text-muted">Close</span>
            <span className="text-right font-semibold" style={{ color: hc.c >= hc.o ? "var(--up)" : "var(--down)" }}>
              {fmtPrice(hc.c)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
