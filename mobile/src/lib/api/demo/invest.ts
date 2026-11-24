/**
 * Core investing and the Satellite sleeve, simulated: the snapshot's portfolio with this session's
 * plan changes, buys and Satellite allocations laid over it, each buy priced the way the server
 * prices one. mpin: a buy, a plan that moves more money (sipNeedsMpin) and every Satellite allocation
 * need the MPIN, after a verified ID, as on the server (`invest_buy`, `invest_sip`, `satellite_opt_in`).
 */
import { assertPracticeIdVerified } from "./identity"; // identity
import coreFx from "@/data/fixtures/invest-core.json";
import portfolioFx from "@/data/fixtures/portfolio.json";
import satelliteFx from "@/data/fixtures/invest-satellite.json";
import { nextRunFrom, sipNeedsMpin, splitByWeight, type PlanFrequency } from "../../invest";
import { ApiError } from "../errors";
import type { Holding, InvestCore, Minor, Portfolio } from "../types";
import { clone, journal, newId, S, toMinor, wait, type InvestState } from "./state";
import { requirePracticeMpin } from "./mpin"; // mpin

type Sip = InvestCore["sips"][number];

function applyPlan(sips: Sip[], plan: InvestState["plan"]): Sip[] {
  if (!plan) return sips;
  const stopped = sips.map((s) => (s.active === 1 ? { ...s, active: 0 } : s));
  if (plan === "stopped") return stopped;
  const current = sips.find((s) => s.active === 1);
  const next: Sip = { id: current?.id ?? "sip_demo", amount: plan.amount, frequency: plan.frequency, next_run_at: plan.nextRunAt, active: 1 };
  return [next, ...stopped.filter((s) => s.id !== next.id)];
}

function applyBuys(core: InvestCore, buys: Minor[]): InvestCore["holdings"] {
  const base = core.holdings;
  if (!buys.length || !core.allocations?.length) return base;
  const bySymbol = new Map<string, Holding>(base.holdings.map((h) => [h.symbol, { ...h }]));
  // Holdings are priced in the wallet currency (as the server buys); a raw quote only counts when
  // it's already in that currency.
  const priceOf = (symbol: string) =>
    bySymbol.get(symbol)?.price ?? core.quotes?.find((q) => q.symbol === symbol && q.currency === core.currency)?.price ?? 0;
  for (const amount of buys) {
    for (const slot of splitByWeight(amount, core.allocations)) {
      const price = priceOf(slot.symbol);
      if (slot.amount <= 0 || !(price > 0)) continue;
      const units = slot.amount / 100 / price;
      const h: Holding = bySymbol.get(slot.symbol) ?? {
        symbol: slot.symbol,
        name: slot.name,
        label: slot.label,
        targetWeight: slot.weight,
        units: 0,
        cost: 0,
        price,
        dayChange: 0,
        value: 0,
        pnl: 0,
        weight: 0,
      };
      h.units += units;
      h.cost += slot.amount;
      h.value = Math.round(h.units * price * 100);
      h.pnl = h.value - h.cost;
      bySymbol.set(slot.symbol, h);
    }
  }
  const holdings = [...bySymbol.values()];
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const cost = holdings.reduce((s, h) => s + h.cost, 0);
  return {
    ...base,
    holdings: holdings.map((h) => ({ ...h, weight: total ? h.value / total : 0 })),
    total,
    cost,
    pnl: total - cost,
  };
}

/** The snapshot's Core with this session's plan and buys applied. */
function coreView(): InvestCore {
  const core = clone(coreFx) as unknown as InvestCore;
  const { plan, buys } = S.invest;
  if ((!plan && !buys.length) || !core.holdings) return core;
  return { ...core, sips: applyPlan(core.sips ?? [], plan), holdings: applyBuys(core, buys) };
}

/* ---------- Satellite (the Practice sleeve on the Invest tab) ---------- */

type Obj = Record<string, unknown>;
const satelliteAdded = () => (S.invest.satellite ?? []).reduce((s, a) => s + a, 0);

/**
 * The server's eligibility() figures with this session's buys and allocations: the cap is a share
 * of the Core holdings (capPct of Core + Satellite, so `core × pct / (100 − pct)`), the headroom what's
 * left of it. Null when the snapshot has no eligibility to build on.
 */
function satelliteEligibility(): (Obj & { eligible: boolean; capPct: number; capAmount: Minor; allocated: Minor; headroom: Minor }) | null {
  const e = (satelliteFx as Obj).eligibility as Obj | undefined;
  if (!e || typeof e.capPct !== "number" || typeof e.allocated !== "number") return null;
  const coreTotal = coreView().holdings?.total ?? 0;
  const capAmount = Math.floor((coreTotal * e.capPct) / (100 - e.capPct));
  const allocated = e.allocated + satelliteAdded();
  return { ...clone(e), eligible: e.eligible === true, capPct: e.capPct, capAmount, allocated, headroom: Math.max(0, capAmount - allocated) };
}

function satelliteView(): Record<string, unknown> {
  const sat = clone(satelliteFx) as Obj;
  const added = satelliteAdded();
  const eligibility = satelliteEligibility();
  const equity = sat.equity as Obj | undefined;
  return {
    ...sat,
    optedIn: sat.optedIn === true || added > 0,
    ...(eligibility ? { eligibility } : {}),
    ...(equity && typeof equity.allocated === "number" && typeof equity.equity === "number"
      ? { equity: { ...equity, allocated: equity.allocated + added, equity: equity.equity + added } }
      : {}),
  };
}

function portfolioView(): Portfolio {
  const pf = clone(portfolioFx) as unknown as Portfolio;
  const added = satelliteAdded();
  if (!added) return pf;
  const satellite = { ...pf.satellite, optedIn: true, allocated: pf.satellite.allocated + added, equity: pf.satellite.equity + added };
  const total = pf.total + added;
  return { ...pf, satellite, total, split: { core: total ? (total - satellite.equity) / total : 0, satellite: total ? satellite.equity / total : 0 } };
}

const DISCLOSURE_COUNT = Array.isArray((satelliteFx as Obj).disclosures) ? ((satelliteFx as Obj).disclosures as unknown[]).length : 4;

export const investApi = {
  portfolio: async () => portfolioView(),
  investCore: async () => coreView(),
  investSatellite: async () => satelliteView(),
  // Like the server, a buy is paid from the bank, and refused when the bank is short.
  buyCore: async (amountMajor: number, pin?: string) => {
    assertPracticeIdVerified(); // identity: a verified ID first (and read-only while a recovery request waits)
    await wait(600);
    requirePracticeMpin(pin); // mpin
    const amount = toMinor(amountMajor);
    if (!(amount > 0)) throw new ApiError("Amount must be positive", 400);
    if (amount > S.totals.bank) throw new ApiError("Insufficient funds in Linked bank account", 400);
    S.totals.bank -= amount;
    S.totals.invested += amount;
    S.invest.buys.push(amount);
    journal(newId("jnl"), "invest_fund", "Add money to Core sleeve", Date.now(), [
      { account: "Linked bank account", kind: "bank", amount: -amount },
      { account: "Core sleeve cash", kind: "core_cash", amount },
    ]);
    return { fills: [] };
  },
  /**
   * POST /invest/core/sip. mpin (`invest_sip`): starting a plan, or a change that moves more money,
   * needs the MPIN (sipNeedsMpin, the server's rule); lowering it doesn't. `pin` is ignored then.
   */
  setSip: async (amountMajor: number, frequency: PlanFrequency, pin?: string) => {
    assertPracticeIdVerified(); // identity: a verified ID first (and read-only while a recovery request waits)
    await wait(400);
    const amount = toMinor(amountMajor);
    if (!(amount > 0)) throw new ApiError("Amount must be positive", 400); // the server's schema, before the MPIN
    const current = coreView().sips?.find((x) => x.active === 1);
    const now = current ? { amount: current.amount, frequency: current.frequency === "weekly" ? ("weekly" as const) : ("monthly" as const), next_run_at: current.next_run_at } : null;
    if (sipNeedsMpin(now, { amount, frequency })) requirePracticeMpin(pin); // mpin
    S.invest.plan = { amount, frequency, nextRunAt: nextRunFrom(frequency) };
    return { ok: true as const };
  },
  // Stopping a plan moves no money: no MPIN, as on the server.
  cancelSip: async () => {
    await wait(300);
    S.invest.plan = "stopped";
    return { ok: true as const };
  },
  /**
   * POST /invest/satellite/opt-in: set money aside for the Satellite sleeve from the bank, turning it
   * on the first time. mpin (`satellite_opt_in`): every allocation needs the MPIN, checked before the
   * server's own checks (every disclosure acknowledged, eligible, within the cap, the bank has it).
   */
  satelliteOptIn: async (amountMajor: number, acknowledged: number, pin?: string) => {
    assertPracticeIdVerified(); // identity
    await wait(500);
    const amount = toMinor(amountMajor);
    if (!(amount > 0)) throw new ApiError("Choose an amount to allocate", 400);
    requirePracticeMpin(pin); // mpin
    if (acknowledged < DISCLOSURE_COUNT) throw new ApiError("Please acknowledge every risk disclosure", 400);
    const e = satelliteEligibility();
    if (!e?.eligible) throw new ApiError("Not eligible for the Satellite sleeve yet", 403);
    if (amount > e.headroom) throw new ApiError(`Allocation is capped at ${e.capPct}% of your investments`, 400);
    if (amount > S.totals.bank) throw new ApiError("Insufficient funds in Linked bank account", 400);
    S.totals.bank -= amount;
    S.totals.invested += amount;
    S.invest.satellite = [...(S.invest.satellite ?? []), amount];
    journal(newId("jnl"), "satellite_allocate", "Allocate to Satellite sleeve", Date.now(), [
      { account: "Linked bank account", kind: "bank", amount: -amount },
      { account: "Satellite sleeve cash", kind: "satellite_cash", amount },
    ]);
    return { ok: true as const };
  },
};
