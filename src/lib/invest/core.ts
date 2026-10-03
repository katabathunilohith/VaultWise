import { all, get, newId, parseJson, run, tx } from "../db";
import { audit } from "../audit";
import { balanceOf, transfer, userAccount, LedgerError } from "../ledger";
import { HttpError, type User } from "../users";
import { getSeries, latestPrice, rng, type Candle } from "./market";
import { bandInfo, modelPortfolio, type RiskProfile } from "./profile";

export function riskProfile(user: User): RiskProfile | null {
  return parseJson<RiskProfile | null>(user.risk_profile, null);
}

export function requireProfile(user: User) {
  const p = riskProfile(user);
  if (!p) throw new HttpError(400, "Complete the risk profile first");
  return p;
}

/** Converts a price quoted in `from` into the wallet currency `to`. */
export async function fxRate(from: string, to: string) {
  if (from === to) return 1;
  const s = await latestPrice(`${from}${to}=X`);
  return s.price;
}

async function priceInWallet(symbol: string, walletCurrency: string) {
  const p = await latestPrice(symbol);
  const rate = await fxRate(p.currency, walletCurrency);
  return { price: p.price * rate, change: p.change, source: p.source, quoteCurrency: p.currency, rate };
}

export async function executeSip(user: User, amount: number, opts: { source?: string; ts?: number; priceOverride?: Record<string, number> } = {}) {
  const profile = requireProfile(user);
  if (amount <= 0) throw new HttpError(400, "Amount must be positive");
  const allocations = modelPortfolio(user.jurisdiction, profile.band);
  const prices = await Promise.all(
    allocations.map((a) =>
      opts.priceOverride?.[a.symbol] != null ? { price: opts.priceOverride[a.symbol], source: "historical" } : priceInWallet(a.symbol, user.currency),
    ),
  );
  return tx(() => {
    const bank = userAccount(user.id, "bank", user.currency);
    const cash = userAccount(user.id, "core_cash", user.currency);
    const sec = userAccount(user.id, "core_securities", user.currency);
    const ts = opts.ts ?? Date.now();
    transfer({
      userId: user.id,
      from: bank.id,
      to: cash.id,
      amount,
      kind: "invest_fund",
      memo: opts.source === "sip" ? "Recurring SIP debit" : "Add money to Core sleeve",
      ts,
      actor: opts.source === "sip" ? "sip-scheduler" : user.id,
      actorType: opts.source === "sip" ? "system" : "user",
    });
    let remaining = amount;
    const fills: { symbol: string; units: number; price: number; amount: number }[] = [];
    allocations.forEach((a, i) => {
      const slice = i === allocations.length - 1 ? remaining : Math.round(amount * a.weight);
      remaining -= slice;
      if (slice <= 0) return;
      const price = prices[i].price;
      const units = slice / 100 / price;
      const orderId = newId("ord");
      transfer({
        userId: user.id,
        from: cash.id,
        to: sec.id,
        amount: slice,
        kind: "invest_buy",
        memo: `Buy ${units.toFixed(4)} ${a.symbol} @ ${price.toFixed(2)}`,
        refType: "order",
        refId: orderId,
        ts,
        actor: "core-engine",
        actorType: "system",
      });
      run(
        `INSERT INTO orders (id, user_id, sleeve, symbol, side, units, price, amount, status, source, created_at)
         VALUES (?, ?, 'core', ?, 'buy', ?, ?, ?, 'filled', ?, ?)`,
        orderId,
        user.id,
        a.symbol,
        units,
        price,
        slice,
        opts.source ?? "manual",
        ts,
      );
      run(
        `INSERT INTO holdings (user_id, sleeve, symbol, units, cost) VALUES (?, 'core', ?, ?, ?)
         ON CONFLICT(user_id, sleeve, symbol) DO UPDATE SET units = units + excluded.units, cost = cost + excluded.cost`,
        user.id,
        a.symbol,
        units,
        slice,
      );
      fills.push({ symbol: a.symbol, units, price, amount: slice });
    });
    audit({
      userId: user.id,
      actor: "core-engine",
      actorType: "system",
      action: "invest.core_buy",
      entityType: "portfolio",
      entityId: user.id,
      details: { amount, band: profile.band, fills, priceSources: [...new Set(prices.map((p) => p.source))] },
      ts,
    });
    return fills;
  });
}

export async function coreHoldings(user: User) {
  const rows = all<{ symbol: string; units: number; cost: number }>(
    "SELECT symbol, units, cost FROM holdings WHERE user_id = ? AND sleeve = 'core' AND units > 0",
    user.id,
  );
  const profile = riskProfile(user);
  const allocs = profile ? modelPortfolio(user.jurisdiction, profile.band) : [];
  const priced = await Promise.all(
    rows.map(async (r) => {
      const p = await priceInWallet(r.symbol, user.currency);
      const value = Math.round(r.units * p.price * 100);
      const a = allocs.find((x) => x.symbol === r.symbol);
      return {
        symbol: r.symbol,
        name: a?.name ?? r.symbol,
        label: a?.label ?? "Other",
        targetWeight: a?.weight ?? 0,
        units: r.units,
        cost: r.cost,
        price: p.price,
        dayChange: p.change,
        value,
        pnl: value - r.cost,
        source: p.source,
      };
    }),
  );
  const total = priced.reduce((s, h) => s + h.value, 0);
  const cost = priced.reduce((s, h) => s + h.cost, 0);
  return {
    holdings: priced.map((h) => ({ ...h, weight: total ? h.value / total : 0 })),
    total,
    cost,
    pnl: total - cost,
    cash: balanceOf(userAccount(user.id, "core_cash", user.currency).id),
  };
}

export function sipPlans(user: User) {
  return all<{ id: string; amount: number; frequency: string; next_run_at: number; active: number; created_at: number }>(
    "SELECT * FROM sip_plans WHERE user_id = ? ORDER BY created_at DESC",
    user.id,
  );
}

export function upsertSip(user: User, amount: number, frequency: "weekly" | "monthly", startAt?: number) {
  requireProfile(user);
  if (amount <= 0) throw new HttpError(400, "Amount must be positive");
  const existing = get<{ id: string }>("SELECT id FROM sip_plans WHERE user_id = ? AND active = 1", user.id);
  const next = startAt ?? Date.now() + (frequency === "weekly" ? 7 : 30) * 86_400_000;
  if (existing) {
    run("UPDATE sip_plans SET amount = ?, frequency = ?, next_run_at = ? WHERE id = ?", amount, frequency, next, existing.id);
  } else {
    run(
      "INSERT INTO sip_plans (id, user_id, amount, frequency, next_run_at, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)",
      newId("sip"),
      user.id,
      amount,
      frequency,
      next,
      Date.now(),
    );
  }
  audit({
    userId: user.id,
    actor: user.id,
    actorType: "user",
    action: "invest.sip_configured",
    entityType: "sip",
    details: { amount, frequency, nextRunAt: next },
  });
}

export function cancelSip(user: User) {
  run("UPDATE sip_plans SET active = 0 WHERE user_id = ? AND active = 1", user.id);
  audit({ userId: user.id, actor: user.id, actorType: "user", action: "invest.sip_paused", entityType: "sip" });
}

export async function runDueSips(user: User, now = Date.now()) {
  const due = all<{ id: string; amount: number; frequency: string; next_run_at: number }>(
    "SELECT * FROM sip_plans WHERE user_id = ? AND active = 1 AND next_run_at <= ?",
    user.id,
    now,
  );
  const results: { status: string; amount: number }[] = [];
  for (const p of due) {
    let at = p.next_run_at;
    let guard = 0;
    while (at <= now && guard++ < 6) {
      try {
        await executeSip(user, p.amount, { source: "sip", ts: at });
        results.push({ status: "filled", amount: p.amount });
      } catch (e) {
        if (!(e instanceof LedgerError)) throw e;
        audit({
          userId: user.id,
          actor: "sip-scheduler",
          actorType: "system",
          action: "invest.sip_missed",
          entityType: "sip",
          entityId: p.id,
          details: { reason: e.message },
          ts: at,
        });
        results.push({ status: "missed", amount: p.amount });
      }
      const d = new Date(at);
      if (p.frequency === "weekly") d.setDate(d.getDate() + 7);
      else d.setMonth(d.getMonth() + 1);
      at = d.getTime();
    }
    run("UPDATE sip_plans SET next_run_at = ? WHERE id = ?", at, p.id);
  }
  return results;
}

function monthKey(t: number) {
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * What a monthly SIP into today's model portfolio would have done over the
 * available history, using real monthly closes (FX-converted to the wallet
 * currency month by month). Illustrative — not a forecast.
 */
export async function historicalIllustration(user: User, monthly: number, band?: number) {
  const b = band ?? requireProfile(user).band;
  const allocs = modelPortfolio(user.jurisdiction, b);
  const series = await Promise.all(allocs.map((a) => getSeries(a.symbol, "1mo", "10y")));
  const fxSeries = await Promise.all(
    series.map((s) => (s.currency === user.currency ? null : getSeries(`${s.currency}${user.currency}=X`, "1mo", "10y"))),
  );
  const maps = series.map((s, i) => {
    const fx = fxSeries[i] ? new Map(fxSeries[i]!.candles.map((c) => [monthKey(c.t), c.c])) : null;
    const m = new Map<string, number>();
    for (const c of s.candles) {
      const rate = fx ? fx.get(monthKey(c.t)) : 1;
      if (rate) m.set(monthKey(c.t), c.c * rate);
    }
    return m;
  });
  const months = [...maps[0].keys()].filter((k) => maps.every((m) => m.has(k))).sort();
  const units = allocs.map(() => 0);
  let contributed = 0;
  const points: { month: string; value: number; contributed: number }[] = [];
  for (const k of months) {
    allocs.forEach((a, i) => {
      units[i] += ((monthly / 100) * a.weight) / maps[i].get(k)!;
    });
    contributed += monthly;
    const value = Math.round(allocs.reduce((s, _a, i) => s + units[i] * maps[i].get(k)!, 0) * 100);
    points.push({ month: k, value, contributed });
  }
  const last = points.at(-1);
  return {
    band: b,
    allocations: allocs,
    points,
    sources: [...new Set(series.map((s) => s.source))],
    totalContributed: last?.contributed ?? 0,
    finalValue: last?.value ?? 0,
    startMonth: points[0]?.month,
  };
}

/** Monte Carlo projection of a regular contribution plan (percentile fan). */
export function projection(opts: { band: number; monthly: number; initial: number; years: number; paths?: number }) {
  const { expReturn, vol, name } = bandInfo(opts.band);
  const n = opts.paths ?? 2000;
  const months = opts.years * 12;
  const muM = Math.log(1 + expReturn) / 12 - (vol * vol) / 24;
  const sigM = vol / Math.sqrt(12);
  const rand = rng(1234 + opts.band);
  const gauss = () => {
    const u = Math.max(1e-12, rand());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const byYear: number[][] = Array.from({ length: opts.years + 1 }, () => []);
  for (let p = 0; p < n; p++) {
    let v = opts.initial;
    byYear[0].push(v);
    for (let m = 1; m <= months; m++) {
      v = v * Math.exp(muM + sigM * gauss()) + opts.monthly;
      if (m % 12 === 0) byYear[m / 12].push(v);
    }
  }
  const pct = (arr: number[], q: number) => {
    const s = [...arr].sort((a, b) => a - b);
    return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))]);
  };
  return {
    bandName: name,
    assumptions: { expReturn, vol, paths: n },
    years: byYear.map((arr, y) => ({
      year: y,
      contributed: opts.initial + opts.monthly * 12 * y,
      p10: pct(arr, 0.1),
      p25: pct(arr, 0.25),
      p50: pct(arr, 0.5),
      p75: pct(arr, 0.75),
      p90: pct(arr, 0.9),
    })),
  };
}

export type { Candle };
