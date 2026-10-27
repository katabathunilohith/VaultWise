/**
 * Core investing, simulated: the snapshot's portfolio with this session's plan changes and buys
 * laid over it, each buy priced the way the server prices one.
 */
import { assertPracticeCanMove } from "./identity"; // identity
import coreFx from "@/data/fixtures/invest-core.json";
import portfolioFx from "@/data/fixtures/portfolio.json";
import satelliteFx from "@/data/fixtures/invest-satellite.json";
import { nextRunFrom, splitByWeight, type PlanFrequency } from "../../invest";
import { ApiError } from "../errors";
import type { Holding, InvestCore, Minor, Portfolio } from "../types";
import { clone, journal, newId, S, toMinor, wait, type InvestState } from "./state";

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

export const investApi = {
  portfolio: async () => clone(portfolioFx) as unknown as Portfolio,
  investCore: async () => coreView(),
  investSatellite: async () => clone(satelliteFx) as Record<string, unknown>,
  // Like the server, a buy is paid from the bank, and refused when the bank is short.
  buyCore: async (amountMajor: number) => {
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
    await wait(600);
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
  setSip: async (amountMajor: number, frequency: PlanFrequency) => {
    assertPracticeCanMove(); // identity: read-only while a Practice recovery request waits
    await wait(400);
    S.invest.plan = { amount: toMinor(amountMajor), frequency, nextRunAt: nextRunFrom(frequency) };
    return { ok: true as const };
  },
  cancelSip: async () => {
    await wait(300);
    S.invest.plan = "stopped";
    return { ok: true as const };
  },
};
