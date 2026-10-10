import { useSyncExternalStore } from "react";
import { subscribeDemoReset } from "@/lib/api/demo";
import type { Holding, InvestCore, Minor } from "@/lib/api/types";
import { splitByWeight, type Frequency } from "./format";

/**
 * The demo simulator answers plan and buy calls with "ok" but serves the same fixture
 * afterwards, so the screen would look unchanged. In demo mode we remember what the person did
 * in this session and lay it over the fixture, priced the same way the server prices a buy.
 * Live mode never uses this: the server's answer is the truth there.
 */
interface PlanChange {
  amount: Minor;
  frequency: Frequency;
  nextRunAt: number;
  active: boolean;
}

interface OverlayState {
  plan: PlanChange | null;
  buys: Minor[];
}

let state: OverlayState = { plan: null, buys: [] };
const listeners = new Set<() => void>();

function set(next: OverlayState) {
  state = next;
  listeners.forEach((l) => l());
}

// Deleting the account in Practice wipes the demo data; the session's plan and buys go with it.
subscribeDemoReset(() => set({ plan: null, buys: [] }));

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

const getState = () => state;

export function useDemoOverlay() {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function recordDemoPlan(plan: PlanChange) {
  set({ ...state, plan });
}

export function recordDemoBuy(amount: Minor) {
  set({ ...state, buys: [...state.buys, amount] });
}

type Sip = InvestCore["sips"][number];

function applyPlan(sips: Sip[], plan: PlanChange | null): Sip[] {
  if (!plan) return sips;
  const stopped = sips.map((s) => (s.active === 1 ? { ...s, active: 0 } : s));
  if (!plan.active) return stopped;
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

export function withDemoOverlay(core: InvestCore, overlay: OverlayState): InvestCore {
  if ((!overlay.plan && !overlay.buys.length) || !core.holdings) return core;
  return { ...core, sips: applyPlan(core.sips ?? [], overlay.plan), holdings: applyBuys(core, overlay.buys) };
}
