import { customer, handle, json } from "@/lib/api";
import { coreHoldings, riskProfile } from "@/lib/invest/core";
import { paperEquity } from "@/lib/invest/satellite";

/** Combined Core + Satellite portfolio summary. */
export const GET = handle(async () => {
  const user = await customer();
  const core = await coreHoldings(user);
  const sat = paperEquity(user);
  const profile = riskProfile(user);
  const total = core.total + core.cash + sat.equity;
  return json({
    currency: user.currency,
    profile,
    core: { value: core.total, cash: core.cash, cost: core.cost, pnl: core.pnl, holdings: core.holdings },
    satellite: { optedIn: !!user.satellite_opt_in, ...sat, mode: "paper" },
    total,
    split: total ? { core: (core.total + core.cash) / total, satellite: sat.equity / total } : { core: 0, satellite: 0 },
  });
});
