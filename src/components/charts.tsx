"use client";

import { useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CATEGORIES, fmtMoney, type VaultCategory } from "@/lib/shared";

const AXIS = {
  stroke: "var(--chart-axis)",
  tick: { fill: "var(--muted)", fontSize: 11 },
  tickLine: false,
};
const GRID = {
  stroke: "var(--chart-grid)",
  vertical: false,
  strokeDasharray: undefined,
};

const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

/** Tooltip shell: values lead (strong), series names follow, keyed by a short line. */
export function TipBox({ title, rows }: { title: ReactNode; rows: { color?: string; label: ReactNode; value: ReactNode }[] }) {
  return (
    <div className="min-w-[180px] rounded-lg border border-line bg-surface px-3 py-2.5 text-xs shadow-pop">
      <div className="mb-1.5 text-muted">{title}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            {r.color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: r.color }} />}
            <span className="tnum font-semibold text-ink">{r.value}</span>
            <span className="ml-auto pl-3 text-ink-2">{r.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function LegendRow({ items }: { items: { color: string; label: ReactNode; kind?: "line" | "rect" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-2">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {it.kind === "rect" ? (
            <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} />
          ) : (
            <span className="h-0.5 w-3.5 rounded-full" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}

/** Total saved across vaults over time (single series), with the category breakdown in the tooltip. */
export function SavingsTrend({ series, currency, height = 220 }: { series: Record<string, number | string>[]; currency: string; height?: number }) {
  const data = series.map((p) => {
    const total = Object.entries(p)
      .filter(([k]) => k !== "t")
      .reduce((s, [, v]) => s + Number(v), 0);
    return { ...p, total };
  });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="vw-total" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="t" tickFormatter={shortDate} {...AXIS} minTickGap={40} />
        <YAxis tickFormatter={(v) => fmtMoney(v, currency, { compact: true })} {...AXIS} axisLine={false} width={64} />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)", strokeWidth: 1 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as Record<string, number>;
            const cats = (Object.keys(CATEGORIES) as VaultCategory[]).filter((c) => p[c]);
            return (
              <TipBox
                title={`Week of ${shortDate(p.t)}`}
                rows={[
                  {
                    color: "var(--accent)",
                    label: "Total saved",
                    value: fmtMoney(p.total, currency),
                  },
                  ...cats.map((c) => ({
                    color: `var(--cat-${c})`,
                    label: CATEGORIES[c].label,
                    value: fmtMoney(p[c], currency),
                  })),
                ]}
              />
            );
          }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="var(--accent)"
          strokeWidth={2}
          fill="url(#vw-total)"
          activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Share of savings by vault category (SVG donut), with a center readout and a value legend. */
export function AllocationDonut({
  slices,
  currency,
  centerLabel,
}: {
  slices: { key: string; label: string; value: number; color: string }[];
  currency: string;
  centerLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const size = 168;
  const c = size / 2;
  const R = 78;
  const r = 56;
  let angle = -Math.PI / 2;
  const arcs = slices.map((s, i) => {
    const sweep = total ? (s.value / total) * Math.PI * 2 : 0;
    const a0 = angle;
    const a1 = angle + sweep;
    angle = a1;
    if (sweep <= 0) return null;
    const ro = hover === i ? R + 4 : R;
    const pt = (a: number, rad: number) => `${c + rad * Math.cos(a)},${c + rad * Math.sin(a)}`;
    const large = sweep > Math.PI ? 1 : 0;
    const full = sweep >= Math.PI * 2 - 1e-6;
    const d = full
      ? `M${c - ro},${c} a${ro},${ro} 0 1 0 ${ro * 2},0 a${ro},${ro} 0 1 0 ${-ro * 2},0 M${c - r},${c} a${r},${r} 0 1 1 ${r * 2},0 a${r},${r} 0 1 1 ${-r * 2},0`
      : `M${pt(a0, ro)} A${ro},${ro} 0 ${large} 1 ${pt(a1, ro)} L${pt(a1, r)} A${r},${r} 0 ${large} 0 ${pt(a0, r)} Z`;
    return (
      <path
        key={s.key}
        d={d}
        fill={s.color}
        fillRule="evenodd"
        stroke="var(--surface)"
        strokeWidth={2}
        onMouseEnter={() => setHover(i)}
        onMouseLeave={() => setHover(null)}
        className="cursor-pointer transition-[d]"
      >
        <title>{`${s.label}: ${fmtMoney(s.value, currency)}`}</title>
      </path>
    );
  });
  const h = hover != null ? slices[hover] : null;
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @md:flex-row @md:items-center">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${centerLabel} by category`}>
            {total === 0 ? <circle cx={c} cy={c} r={(R + r) / 2} fill="none" stroke="var(--line)" strokeWidth={R - r} /> : arcs}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <div className="text-[11px] text-muted">{h ? h.label.split(" /")[0] : centerLabel}</div>
            <div className="tnum text-[15px] font-semibold">{fmtMoney(h ? h.value : total, currency, { compact: true })}</div>
            {h && <div className="tnum text-[11px] text-muted">{((h.value / total) * 100).toFixed(0)}%</div>}
          </div>
        </div>
        <ul className="w-full space-y-2">
          {slices.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2.5 text-[13px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
              <span className="truncate text-ink-2">{s.label}</span>
              <span className="tnum ml-auto font-medium text-ink">{fmtMoney(s.value, currency, { decimals: false })}</span>
              <span className="tnum w-10 text-right text-xs text-muted">{total ? ((s.value / total) * 100).toFixed(0) : 0}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** A vault's running balance with its target as a reference line. */
export function BalanceChart({
  points,
  target,
  currency,
  color,
  now,
}: {
  points: { t: number; balance: number }[];
  target: number;
  currency: string;
  color: string;
  now: number;
}) {
  const data = points.length ? [...points, { t: Math.max(now, points.at(-1)!.t), balance: points.at(-1)!.balance }] : [];
  return (
    <ResponsiveContainer width="100%" height={250}>
      <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="vw-bal" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.14} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={shortDate} {...AXIS} minTickGap={40} />
        <YAxis tickFormatter={(v) => fmtMoney(v, currency, { compact: true })} {...AXIS} axisLine={false} width={64} domain={[0, "auto"]} />
        <ReferenceLine
          y={target}
          ifOverflow="extendDomain"
          stroke="var(--ink-2)"
          strokeWidth={1}
          label={{
            value: `Goal ${fmtMoney(target, currency, { compact: true })}`,
            position: "insideTopRight",
            fill: "var(--ink-2)",
            fontSize: 11,
          }}
        />
        <Tooltip
          cursor={{ stroke: "var(--chart-axis)" }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TipBox
                title={new Date(payload[0].payload.t).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                rows={[
                  {
                    color,
                    label: "Balance",
                    value: fmtMoney(payload[0].payload.balance, currency),
                  },
                ]}
              />
            ) : null
          }
        />
        <Area
          type="stepAfter"
          dataKey="balance"
          stroke={color}
          strokeWidth={2}
          fill="url(#vw-bal)"
          activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Monte Carlo projection: 10–90 and 25–75 percentile bands, median, and contributions. */
export function FanChart({
  years,
  currency,
}: {
  years: {
    year: number;
    contributed: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  }[];
  currency: string;
}) {
  const data = years.map((y) => ({
    ...y,
    outer: [y.p10, y.p90],
    inner: [y.p25, y.p75],
  }));
  return (
    <div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="year" tickFormatter={(y) => (y === 0 ? "Now" : `${y}y`)} {...AXIS} />
          <YAxis tickFormatter={(v) => fmtMoney(v, currency, { compact: true })} {...AXIS} axisLine={false} width={64} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <TipBox
                  title={p.year === 0 ? "Today" : `In ${p.year} year${p.year > 1 ? "s" : ""}`}
                  rows={[
                    {
                      color: "var(--accent)",
                      label: "Median outcome",
                      value: fmtMoney(p.p50, currency, { decimals: false }),
                    },
                    {
                      label: "Middle 50%",
                      value: `${fmtMoney(p.p25, currency, { compact: true })} – ${fmtMoney(p.p75, currency, { compact: true })}`,
                    },
                    {
                      label: "80% range",
                      value: `${fmtMoney(p.p10, currency, { compact: true })} – ${fmtMoney(p.p90, currency, { compact: true })}`,
                    },
                    {
                      color: "var(--ink-2)",
                      label: "You contributed",
                      value: fmtMoney(p.contributed, currency, {
                        decimals: false,
                      }),
                    },
                  ]}
                />
              );
            }}
          />
          <Area dataKey="outer" stroke="none" fill="var(--accent)" fillOpacity={0.1} isAnimationActive={false} />
          <Area dataKey="inner" stroke="none" fill="var(--accent)" fillOpacity={0.18} isAnimationActive={false} />
          <Line dataKey="contributed" stroke="var(--ink-2)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line
            dataKey="p50"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-3">
        <LegendRow
          items={[
            { color: "var(--accent)", label: "Median" },
            {
              color: "color-mix(in srgb, var(--accent) 30%, transparent)",
              label: "Middle 50%",
              kind: "rect",
            },
            {
              color: "color-mix(in srgb, var(--accent) 14%, transparent)",
              label: "80% of outcomes",
              kind: "rect",
            },
            { color: "var(--ink-2)", label: "Contributions" },
          ]}
        />
      </div>
    </div>
  );
}

/** Two-line comparison on one scale (e.g. portfolio value vs. contributions). */
export function TwoLineChart({
  data,
  xKey,
  a,
  b,
  format,
  xFormat,
  height = 240,
}: {
  data: Record<string, number | string>[];
  xKey: string;
  a: { key: string; label: string; color: string };
  b: { key: string; label: string; color: string };
  format: (v: number) => string;
  xFormat: (v: number | string) => string;
  height?: number;
}) {
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey={xKey} tickFormatter={xFormat} {...AXIS} minTickGap={48} />
          <YAxis tickFormatter={format} {...AXIS} axisLine={false} width={64} domain={["auto", "auto"]} />
          <Tooltip
            cursor={{ stroke: "var(--chart-axis)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <TipBox
                  title={xFormat(p[xKey])}
                  rows={[
                    { color: a.color, label: a.label, value: format(p[a.key]) },
                    { color: b.color, label: b.label, value: format(p[b.key]) },
                  ]}
                />
              );
            }}
          />
          <Line dataKey={b.key} stroke={b.color} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line
            dataKey={a.key}
            stroke={a.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-3">
        <LegendRow items={[a, b].map((s) => ({ color: s.color, label: s.label }))} />
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--accent)", height = 32 }: { values: number[]; color?: string; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 100;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${height - 2 - ((v - min) / (max - min || 1)) * (height - 4)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
