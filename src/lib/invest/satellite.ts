import { all, get, newId, parseJson, run, tx } from "../db";
import { audit } from "../audit";
import { rulesFor, type AssetClass } from "../compliance";
import { balanceOf, transfer, userAccount } from "../ledger";
import { HttpError, type User } from "../users";
import { coreHoldings, riskProfile } from "./core";
import { getSeries, SATELLITE_UNIVERSE, type Interval } from "./market";
import { analyze, COST_BPS, DEFAULT_PARAMS, WEIGHTS, type Components } from "./smc";
import { runBacktest, type BacktestResult } from "./backtest";

export const PAPER_TIMEFRAME: Interval = "1h";
const HOUR = 3_600_000;

export const DISCLOSURES = [
  "The Satellite sleeve trades systematically using Smart Money Concepts and Fair Value Gaps — community-developed price-action heuristics without a peer-reviewed evidence base for a reliable edge after costs.",
  "It is opt-in, capped as a share of your investments, and completely separate from your savings vaults. Vault money is never used for trading.",
  "Strategies must pass backtesting, walk-forward validation and a paper-trading period before any live capital is used. Until then your allocation stays in cash.",
  "Crypto and forex are volatile. You can lose some or all of the amount you allocate.",
];

export function universeFor(user: User) {
  const rules = rulesFor(user.jurisdiction);
  return SATELLITE_UNIVERSE.map((m) => ({ ...m, allowed: rules.satellite.assetClasses.includes(m.assetClass as AssetClass) }));
}

function costFor(symbol: string) {
  const m = SATELLITE_UNIVERSE.find((x) => x.symbol === symbol);
  return COST_BPS[m?.assetClass ?? "equities"];
}

export async function eligibility(user: User) {
  const rules = rulesFor(user.jurisdiction).satellite;
  const profile = riskProfile(user);
  const core = await coreHoldings(user);
  const allocated = balanceOf(userAccount(user.id, "satellite_cash", user.currency).id);
  const investable = core.total + allocated;
  const capAmount = Math.floor((core.total * rules.maxAllocationPct) / (100 - rules.maxAllocationPct));
  const checks = [
    {
      key: "jurisdiction",
      label: "Available in your region",
      pass: rules.enabled,
      detail: rules.enabled ? `${rules.assetClasses.join(", ")} permitted` : "Not offered in this jurisdiction",
    },
    {
      key: "profile",
      label: "Risk profile completed",
      pass: !!profile,
      detail: profile ? `${profile.bandName} (score ${profile.score})` : "Complete the questionnaire first",
    },
    {
      key: "band",
      label: "Suitability: risk band",
      pass: !!profile && profile.band >= rules.minRiskBand,
      detail: profile ? `Band ${profile.band} — minimum band ${rules.minRiskBand} (Balanced)` : "—",
    },
    {
      key: "experience",
      label: "Suitability: investing experience",
      pass: !!profile && profile.experience >= 3,
      detail: profile ? (profile.experience >= 3 ? "Has invested in funds, ETFs or more" : "Needs prior fund/ETF experience") : "—",
    },
    {
      key: "core",
      label: "Core sleeve funded first",
      pass: core.total > 0,
      detail: core.total > 0 ? "Satellite is sized as a share of your Core investments" : "Invest in the Core sleeve before opting in",
    },
  ];
  return {
    eligible: checks.every((c) => c.pass),
    checks,
    capPct: rules.maxAllocationPct,
    capAmount,
    allocated,
    headroom: Math.max(0, capAmount - allocated),
    investable,
  };
}

export async function optIn(user: User, amount: number, acknowledged: number) {
  if (acknowledged < DISCLOSURES.length) throw new HttpError(400, "Please acknowledge every risk disclosure");
  const e = await eligibility(user);
  if (!e.eligible) throw new HttpError(403, "Not eligible for the Satellite sleeve yet");
  if (amount <= 0) throw new HttpError(400, "Choose an amount to allocate");
  if (amount > e.headroom) throw new HttpError(400, `Allocation is capped at ${e.capPct}% of your investments`);
  return tx(() => {
    const bank = userAccount(user.id, "bank", user.currency);
    const sat = userAccount(user.id, "satellite_cash", user.currency);
    transfer({
      userId: user.id,
      from: bank.id,
      to: sat.id,
      amount,
      kind: "satellite_allocate",
      memo: "Allocate to Satellite sleeve",
      actor: user.id,
      actorType: "user",
    });
    const now = Date.now();
    if (!user.satellite_opt_in) {
      run("UPDATE users SET satellite_opt_in = 1, satellite_opted_at = ? WHERE id = ?", now, user.id);
      for (const m of universeFor(user).filter((m) => m.allowed)) {
        run(
          `INSERT INTO paper_state (user_id, symbol, timeframe, enabled, last_bar_t) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(user_id, symbol, timeframe) DO NOTHING`,
          user.id,
          m.symbol,
          PAPER_TIMEFRAME,
          now,
        );
      }
    }
    audit({
      userId: user.id,
      actor: user.id,
      actorType: "user",
      action: user.satellite_opt_in ? "satellite.allocation_increased" : "satellite.opted_in",
      entityType: "satellite",
      details: { amount, disclosuresAcknowledged: DISCLOSURES.length, capPct: e.capPct },
    });
  });
}

export function optOut(user: User) {
  return tx(() => {
    const sat = userAccount(user.id, "satellite_cash", user.currency);
    const bal = balanceOf(sat.id);
    const bank = userAccount(user.id, "bank", user.currency);
    if (bal > 0)
      transfer({
        userId: user.id,
        from: sat.id,
        to: bank.id,
        amount: bal,
        kind: "satellite_return",
        memo: "Return Satellite allocation",
        actor: user.id,
        actorType: "user",
      });
    run("UPDATE paper_positions SET status = 'cancelled', closed_at = ? WHERE user_id = ? AND status = 'open'", Date.now(), user.id);
    run("UPDATE users SET satellite_opt_in = 0 WHERE id = ?", user.id);
    run("UPDATE paper_state SET enabled = 0 WHERE user_id = ?", user.id);
    audit({ userId: user.id, actor: user.id, actorType: "user", action: "satellite.opted_out", entityType: "satellite", details: { returned: bal } });
  });
}

export function setMarketEnabled(user: User, symbol: string, enabled: boolean) {
  const m = universeFor(user).find((x) => x.symbol === symbol);
  if (!m) throw new HttpError(404, "Unknown market");
  if (enabled && !m.allowed) throw new HttpError(403, "This asset class isn't permitted in your jurisdiction");
  run(
    `INSERT INTO paper_state (user_id, symbol, timeframe, enabled, last_bar_t) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, symbol, timeframe) DO UPDATE SET enabled = excluded.enabled`,
    user.id,
    symbol,
    PAPER_TIMEFRAME,
    enabled ? 1 : 0,
    Date.now(),
  );
}

interface PaperRow {
  id: string;
  symbol: string;
  timeframe: string;
  direction: "bull" | "bear";
  entry: number;
  stop: number;
  target: number;
  risk_amount: number;
  confluence: number;
  components: string | null;
  bar_time: number;
  status: string;
  exit: number | null;
  r_multiple: number | null;
  pnl: number | null;
  opened_at: number;
  closed_at: number | null;
}

export function paperEquity(user: User) {
  const allocated = balanceOf(userAccount(user.id, "satellite_cash", user.currency).id);
  const realized = get<{ s: number }>("SELECT COALESCE(SUM(pnl), 0) AS s FROM paper_positions WHERE user_id = ? AND status = 'closed'", user.id)!.s;
  return { allocated, realized, equity: allocated + realized };
}

/**
 * Always-on paper engine. Each run processes every completed bar since the
 * last run, exactly as a continuously running engine would have: manage open
 * positions first, then look for new setups. Circuit breakers halt new
 * entries after a daily or weekly drawdown.
 */
export async function runPaperEngine(user: User) {
  if (!user.satellite_opt_in) return { processed: 0, opened: 0, closed: 0 };
  const rules = rulesFor(user.jurisdiction).satellite;
  const states = all<{ symbol: string; timeframe: string; last_bar_t: number; halted_until: number | null }>(
    "SELECT * FROM paper_state WHERE user_id = ? AND enabled = 1",
    user.id,
  );
  let processed = 0;
  let opened = 0;
  let closed = 0;
  const now = Date.now();
  for (const st of states) {
    const series = await getSeries(st.symbol, st.timeframe as Interval);
    const c = series.candles.filter((x) => x.t + HOUR <= now); // completed bars only
    if (c.length < 200) continue;
    const params = { ...DEFAULT_PARAMS, costBps: costFor(st.symbol) };
    const a = analyze(c, params);
    const startIdx = c.findIndex((x) => x.t > st.last_bar_t);
    if (startIdx < 0) continue;
    for (let i = startIdx; i < c.length; i++) {
      processed++;
      const bar = c[i];
      // Manage the open position on this market.
      const pos = get<PaperRow>("SELECT * FROM paper_positions WHERE user_id = ? AND symbol = ? AND status = 'open'", user.id, st.symbol);
      if (pos && bar.t > pos.bar_time) {
        const long = pos.direction === "bull";
        const hitStop = long ? bar.l <= pos.stop : bar.h >= pos.stop;
        const hitTarget = long ? bar.h >= pos.target : bar.l <= pos.target;
        const age = Math.round((bar.t - pos.bar_time) / HOUR);
        let exit: number | null = null;
        if (hitStop) exit = long ? Math.min(pos.stop, bar.o) : Math.max(pos.stop, bar.o);
        else if (hitTarget) exit = pos.target;
        else if (age >= params.maxBarsInTrade) exit = bar.c;
        if (exit != null) {
          const riskPerUnit = Math.abs(pos.entry - pos.stop);
          const gross = (long ? exit - pos.entry : pos.entry - exit) / riskPerUnit;
          const r = gross - ((params.costBps / 10_000) * (pos.entry + exit)) / riskPerUnit;
          const pnl = Math.round(r * pos.risk_amount);
          run(
            "UPDATE paper_positions SET status = 'closed', exit = ?, r_multiple = ?, pnl = ?, closed_at = ? WHERE id = ?",
            exit,
            r,
            pnl,
            bar.t,
            pos.id,
          );
          closed++;
          audit({
            userId: user.id,
            actor: "satellite-engine",
            actorType: "system",
            action: "satellite.paper_closed",
            entityType: "paper_position",
            entityId: pos.id,
            details: { symbol: st.symbol, exit, r: Number(r.toFixed(3)), pnl, reason: hitStop ? "stop" : hitTarget ? "target" : "time" },
            ts: bar.t,
          });
          // Circuit breakers.
          const eq = paperEquity(user).equity;
          const dayStart = new Date(bar.t);
          dayStart.setUTCHours(0, 0, 0, 0);
          const dayPnl = get<{ s: number }>(
            "SELECT COALESCE(SUM(pnl), 0) AS s FROM paper_positions WHERE user_id = ? AND status = 'closed' AND closed_at >= ?",
            user.id,
            dayStart.getTime(),
          )!.s;
          const weekPnl = get<{ s: number }>(
            "SELECT COALESCE(SUM(pnl), 0) AS s FROM paper_positions WHERE user_id = ? AND status = 'closed' AND closed_at >= ?",
            user.id,
            bar.t - 7 * 24 * HOUR,
          )!.s;
          let haltUntil: number | null = null;
          if (-dayPnl > ((eq - dayPnl) * rules.dailyDrawdownHaltPct) / 100) haltUntil = dayStart.getTime() + 24 * HOUR;
          if (-weekPnl > ((eq - weekPnl) * rules.weeklyDrawdownHaltPct) / 100) haltUntil = bar.t + 7 * 24 * HOUR;
          if (haltUntil) {
            run("UPDATE paper_state SET halted_until = ? WHERE user_id = ?", haltUntil, user.id);
            audit({
              userId: user.id,
              actor: "satellite-engine",
              actorType: "system",
              action: "satellite.circuit_breaker",
              entityType: "satellite",
              details: { haltUntil, dayPnl, weekPnl },
              ts: bar.t,
            });
          }
        }
      }
      // New setups (one position per market).
      const halted = get<{ h: number | null }>("SELECT MAX(halted_until) AS h FROM paper_state WHERE user_id = ?", user.id)?.h;
      const stillOpen = get("SELECT 1 FROM paper_positions WHERE user_id = ? AND symbol = ? AND status = 'open'", user.id, st.symbol);
      const sig = a.signals[i];
      if (!stillOpen && sig.dir && sig.stop != null && (!halted || bar.t >= halted) && i < c.length) {
        const eq = paperEquity(user).equity;
        const riskAmount = Math.round((eq * rules.riskPerTradePct) / 100);
        const entry = bar.c;
        const riskPerUnit = Math.abs(entry - sig.stop);
        if (riskAmount > 0 && riskPerUnit > 0) {
          const target = sig.dir === "bull" ? entry + params.rr * riskPerUnit : entry - params.rr * riskPerUnit;
          const comps: Components = sig.dir === "bull" ? sig.longC : sig.shortC;
          const id = newId("ppos");
          run(
            `INSERT INTO paper_positions (id, user_id, strategy_id, symbol, timeframe, direction, entry, stop, target, risk_amount, confluence, components, bar_time, status, opened_at)
             VALUES (?, ?, 'smc-confluence-v1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
            id,
            user.id,
            st.symbol,
            st.timeframe,
            sig.dir,
            entry,
            sig.stop,
            target,
            riskAmount,
            sig.score,
            JSON.stringify(comps),
            bar.t,
            bar.t,
          );
          opened++;
          audit({
            userId: user.id,
            actor: "satellite-engine",
            actorType: "system",
            action: "satellite.paper_opened",
            entityType: "paper_position",
            entityId: id,
            details: { symbol: st.symbol, dir: sig.dir, entry, stop: sig.stop, target, confluence: sig.score, riskAmount },
            ts: bar.t,
          });
        }
      }
    }
    run("UPDATE paper_state SET last_bar_t = ? WHERE user_id = ? AND symbol = ? AND timeframe = ?", c.at(-1)!.t, user.id, st.symbol, st.timeframe);
  }
  return { processed, opened, closed };
}

export async function satelliteOverview(user: User) {
  const e = await eligibility(user);
  const eq = paperEquity(user);
  const positions = all<PaperRow>("SELECT * FROM paper_positions WHERE user_id = ? ORDER BY opened_at DESC LIMIT 100", user.id).map((p) => ({
    ...p,
    components: parseJson<Components | null>(p.components, null),
  }));
  const closedPos = positions.filter((p) => p.status === "closed");
  const rs = closedPos.map((p) => p.r_multiple ?? 0);
  const wins = rs.filter((r) => r > 0).length;
  const markets = universeFor(user).map((m) => {
    const st = get<{ enabled: number; last_bar_t: number; halted_until: number | null }>(
      "SELECT enabled, last_bar_t, halted_until FROM paper_state WHERE user_id = ? AND symbol = ? AND timeframe = ?",
      user.id,
      m.symbol,
      PAPER_TIMEFRAME,
    );
    const strat = get<{ last_backtest: string | null; stage: string }>(
      "SELECT last_backtest, stage FROM strategies WHERE id = ?",
      strategyId(m.symbol, PAPER_TIMEFRAME),
    );
    const bt = parseJson<{
      gate: { passed: boolean };
      full: { trades: number; expectancyR: number };
      oos: { expectancyR: number; profitFactor: number };
      ranAt: number;
    } | null>(strat?.last_backtest, null);
    return {
      ...m,
      enabled: !!st?.enabled,
      lastBarT: st?.last_bar_t ?? null,
      haltedUntil: st?.halted_until ?? null,
      gate: bt
        ? { passed: bt.gate.passed, ranAt: bt.ranAt, oosExpectancy: bt.oos.expectancyR, oosPf: bt.oos.profitFactor, trades: bt.full.trades }
        : null,
    };
  });
  const firstOpen = positions.at(-1)?.opened_at;
  const paperDays = user.satellite_opted_at ? Math.floor((Date.now() - Math.min(user.satellite_opted_at, firstOpen ?? Infinity)) / 86_400_000) : 0;
  const expectancy = rs.length ? rs.reduce((s, r) => s + r, 0) / rs.length : 0;
  const anyGate = markets.some((m) => m.gate?.passed);
  return {
    optedIn: !!user.satellite_opt_in,
    optedAt: user.satellite_opted_at,
    eligibility: e,
    disclosures: DISCLOSURES,
    rules: rulesFor(user.jurisdiction).satellite,
    equity: eq,
    positions,
    stats: {
      closed: closedPos.length,
      open: positions.filter((p) => p.status === "open").length,
      winRate: closedPos.length ? wins / closedPos.length : 0,
      expectancyR: expectancy,
      realized: eq.realized,
    },
    markets,
    governance: {
      stages: [
        {
          key: "backtest",
          label: "Backtest & walk-forward",
          passed: anyGate,
          detail: anyGate ? "At least one market cleared the gate" : "No market has cleared the out-of-sample gate yet",
        },
        {
          key: "paper",
          label: "Paper-trading period",
          passed: paperDays >= 30 && closedPos.length >= 20 && expectancy > 0,
          detail: `${paperDays} of 30 days · ${closedPos.length} of 20 trades · expectancy ${expectancy.toFixed(2)}R`,
        },
        { key: "live", label: "Live capital", passed: false, detail: "Requires a licensed brokerage partner — disabled in this prototype" },
      ],
    },
  };
}

export function strategyId(symbol: string, tf: string) {
  return `smc:${symbol}:${tf}`;
}

export async function backtestMarket(user: User, symbol: string, tf: Interval): Promise<BacktestResult & { ranAt: number; source: string }> {
  if (!SATELLITE_UNIVERSE.some((m) => m.symbol === symbol)) throw new HttpError(404, "Unknown market");
  const rules = rulesFor(user.jurisdiction).satellite;
  const range = tf === "1h" || tf === "4h" ? "730d" : "5y";
  const series = await getSeries(symbol, tf, range);
  const result = runBacktest(
    series.candles,
    { costBps: costFor(symbol) },
    {
      riskPct: rules.riskPerTradePct,
      dailyHaltPct: rules.dailyDrawdownHaltPct,
      weeklyHaltPct: rules.weeklyDrawdownHaltPct,
    },
  );
  const out = { ...result, ranAt: Date.now(), source: series.source };
  const id = strategyId(symbol, tf);
  run(
    `INSERT INTO strategies (id, name, params, stage, last_backtest, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET last_backtest = excluded.last_backtest, stage = excluded.stage, params = excluded.params`,
    id,
    `SMC confluence v1 · ${symbol} ${tf}`,
    JSON.stringify(result.params),
    result.gate.passed ? "paper-eligible" : "research",
    JSON.stringify({ gate: result.gate, full: result.full, oos: result.oos, ranAt: out.ranAt }),
    Date.now(),
  );
  audit({
    userId: user.id,
    actor: "strategy-governance",
    actorType: "system",
    action: result.gate.passed ? "strategy.gate_passed" : "strategy.gate_failed",
    entityType: "strategy",
    entityId: id,
    details: {
      trades: result.full.trades,
      oosExpectancyR: Number(result.oos.expectancyR.toFixed(3)),
      oosPf: Number(result.oos.profitFactor.toFixed(2)),
      maxDd: Number(result.full.maxDrawdownPct.toFixed(1)),
    },
  });
  return out;
}

export async function marketAnalysis(symbol: string, tf: Interval, bars = 180) {
  if (!SATELLITE_UNIVERSE.some((m) => m.symbol === symbol)) throw new HttpError(404, "Unknown market");
  const series = await getSeries(symbol, tf);
  const m = SATELLITE_UNIVERSE.find((x) => x.symbol === symbol)!;
  const a = analyze(series.candles, { ...DEFAULT_PARAMS, costBps: COST_BPS[m.assetClass] });
  const n = series.candles.length;
  const from = Math.max(0, n - bars);
  const shift = (i: number) => i - from;
  const inWin = (i: number) => i >= from;
  const last = a.signals.at(-1)!;
  return {
    symbol,
    name: m.name,
    assetClass: m.assetClass,
    interval: tf,
    source: series.source,
    currency: series.currency,
    candles: series.candles.slice(from),
    swings: a.swings.filter((s) => inWin(s.i)).map((s) => ({ ...s, i: shift(s.i) })),
    structure: a.structure.filter((s) => inWin(s.i)).map((s) => ({ ...s, i: shift(s.i), fromI: shift(s.fromI) })),
    orderBlocks: a.orderBlocks
      .filter((o) => inWin(o.createdAt) || (o.invalidatedAt == null && inWin(o.createdAt + 60)))
      .slice(-12)
      .map((o) => ({
        ...o,
        i: shift(o.i),
        createdAt: shift(o.createdAt),
        touchedAt: o.touchedAt != null ? shift(o.touchedAt) : undefined,
        invalidatedAt: o.invalidatedAt != null ? shift(o.invalidatedAt) : undefined,
      })),
    fvgs: a.fvgs
      .filter((g) => inWin(g.createdAt))
      .map((g) => ({
        ...g,
        i: shift(g.i),
        createdAt: shift(g.createdAt),
        touchedAt: g.touchedAt != null ? shift(g.touchedAt) : undefined,
        filledAt: g.filledAt != null ? shift(g.filledAt) : undefined,
      })),
    sweeps: a.sweeps.filter((s) => inWin(s.i)).map((s) => ({ ...s, i: shift(s.i), swingI: shift(s.swingI) })),
    profile: a.profile,
    latest: {
      bias: last.bias,
      trend: a.trend.at(-1),
      long: last.long,
      short: last.short,
      longC: last.longC,
      shortC: last.shortC,
      dir: last.dir,
      stop: last.stop,
      atr: last.atr,
      price: series.candles.at(-1)!.c,
      threshold: DEFAULT_PARAMS.threshold,
    },
    weights: WEIGHTS,
    signals: a.signals
      .slice(from)
      .map((s, k) => ({ i: k, dir: s.dir, score: s.score }))
      .filter((s) => s.dir),
  };
}
