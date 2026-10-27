import { useQueryClient } from "@tanstack/react-query";
import { invalidate, MONEY_QUERIES } from "@/lib/api/keys";
import type { InvestCore } from "@/lib/api/types";

/**
 * The live server answers `{ profile: null }` (and nothing else) until the risk profile is done,
 * so every other field has to be treated as optional.
 */
export function hasPortfolio(core: InvestCore | undefined): core is InvestCore & { band: NonNullable<InvestCore["band"]> } {
  return !!core?.profile && !!core.band && Array.isArray(core.allocations) && !!core.holdings;
}

/** The active plan, if any. */
export function activePlan(core: InvestCore | undefined) {
  return core?.sips?.find((s) => s.active === 1) ?? null;
}

/** After a plan change or a buy: balances, the invest screens and the portfolio summary. */
export function useInvalidateInvest() {
  const qc = useQueryClient();
  return () => invalidate(qc, ...MONEY_QUERIES, "invest-core", "invest-satellite");
}
