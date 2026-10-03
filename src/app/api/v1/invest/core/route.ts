import { customer, handle, json } from "@/lib/api";
import { all } from "@/lib/db";
import { coreHoldings, riskProfile, sipPlans } from "@/lib/invest/core";
import { latestPrice } from "@/lib/invest/market";
import { bandInfo, modelPortfolio } from "@/lib/invest/profile";

export const GET = handle(async () => {
  const user = await customer();
  const profile = riskProfile(user);
  if (!profile) return json({ profile: null });
  const allocations = modelPortfolio(user.jurisdiction, profile.band);
  const quotes = await Promise.all(
    allocations.map(async (a) => {
      try {
        const q = await latestPrice(a.symbol);
        return { symbol: a.symbol, price: q.price, change: q.change, currency: q.currency, source: q.source };
      } catch {
        return { symbol: a.symbol, price: null, change: null, currency: null, source: "unavailable" };
      }
    }),
  );
  const holdings = await coreHoldings(user);
  const orders = all("SELECT * FROM orders WHERE user_id = ? AND sleeve = 'core' ORDER BY created_at DESC LIMIT 40", user.id);
  return json({
    profile,
    band: bandInfo(profile.band),
    allocations,
    quotes,
    holdings,
    sips: sipPlans(user),
    orders,
    currency: user.currency,
  });
});
