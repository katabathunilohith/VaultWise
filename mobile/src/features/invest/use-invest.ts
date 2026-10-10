import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnection, useInvalidateMoney, useInvestCore } from "@/lib/api/hooks";
import type { InvestCore } from "@/lib/api/types";
import { useDemoOverlay, withDemoOverlay } from "./demo-overlay";

/** Core data with this session's demo plan/buys laid over it (demo mode only). */
export function useCoreData() {
  const q = useInvestCore();
  const { mode } = useConnection();
  const overlay = useDemoOverlay();
  const data = useMemo<InvestCore | undefined>(
    () => (q.data && mode === "demo" ? withDemoOverlay(q.data, overlay) : q.data),
    [q.data, mode, overlay],
  );
  return { ...q, data };
}

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
  const invalidateMoney = useInvalidateMoney();
  return () =>
    Promise.all([
      invalidateMoney(),
      qc.invalidateQueries({ predicate: (q) => q.queryKey[1] === "invest-core" || q.queryKey[1] === "invest-satellite" }),
    ]);
}
