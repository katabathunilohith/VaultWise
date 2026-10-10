/**
 * `/invest/satellite` is typed as Record<string, unknown> in the shared client, so this narrows
 * the parts the Practice view shows, field by field, with safe fallbacks. Anything malformed is
 * dropped rather than shown wrong.
 */

export interface PaperPosition {
  id: string;
  symbol: string;
  direction: "rise" | "fall";
  entry: number;
  stop: number;
  target: number;
  openedAt: number | null;
}

export interface GovernanceStage {
  key: string;
  /** The server's name for the stage; only shown for stages this app has no plain words for. */
  label: string;
  passed: boolean;
  detail: string;
}

export interface SatelliteView {
  optedIn: boolean;
  maxAllocationPct: number | null;
  openPositions: PaperPosition[];
  closedCount: number;
  stages: GovernanceStage[];
  marketNames: Record<string, string>;
}

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function parsePosition(v: unknown): { status: string; position: PaperPosition } | null {
  if (!isObj(v)) return null;
  const id = str(v.id);
  const symbol = str(v.symbol);
  const entry = num(v.entry);
  const stop = num(v.stop);
  const target = num(v.target);
  const dir = str(v.direction);
  if (!id || !symbol || entry === null || stop === null || target === null || (dir !== "bull" && dir !== "bear")) return null;
  return {
    status: str(v.status) ?? "",
    position: { id, symbol, direction: dir === "bull" ? "rise" : "fall", entry, stop, target, openedAt: num(v.opened_at) },
  };
}

export function parseSatellite(raw: unknown): SatelliteView {
  const o = isObj(raw) ? raw : {};
  const positions = arr(o.positions)
    .map(parsePosition)
    .filter((p): p is { status: string; position: PaperPosition } => p !== null);
  const stats = isObj(o.stats) ? o.stats : {};
  const rules = isObj(o.rules) ? o.rules : {};
  const governance = isObj(o.governance) ? o.governance : {};
  const marketNames: Record<string, string> = {};
  for (const m of arr(o.markets)) {
    if (!isObj(m)) continue;
    const symbol = str(m.symbol);
    const name = str(m.name);
    if (symbol && name) marketNames[symbol] = name;
  }
  return {
    optedIn: o.optedIn === true,
    maxAllocationPct: num(rules.maxAllocationPct),
    openPositions: positions.filter((p) => p.status === "open").map((p) => p.position),
    closedCount: num(stats.closed) ?? positions.filter((p) => p.status === "closed").length,
    stages: arr(governance.stages)
      .filter(isObj)
      .map((s) => ({ key: str(s.key) ?? "", label: str(s.label) ?? "", passed: s.passed === true, detail: str(s.detail) ?? "" }))
      .filter((s) => s.key),
    marketNames,
  };
}

/** Pulls "20 of 30 days · 15 of 20 trades" out of the paper stage's detail, if it's there. */
export function paperProgress(detail: string): { days: number; daysNeeded: number; trades: number; tradesNeeded: number } | null {
  const d = /(\d+)\s+of\s+(\d+)\s+days/i.exec(detail);
  const t = /(\d+)\s+of\s+(\d+)\s+trades/i.exec(detail);
  if (!d || !t) return null;
  return { days: Number(d[1]), daysNeeded: Number(d[2]), trades: Number(t[1]), tradesNeeded: Number(t[2]) };
}
