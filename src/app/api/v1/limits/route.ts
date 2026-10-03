import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { changeLimits, limitsOverview } from "@/lib/limits";

export const GET = handle(async () => {
  const user = await customer();
  return json(limitsOverview(user));
});

const Amount = z.number().min(0).max(1e9);

/** Standard change: tightening any time; loosening once per calendar month. */
export const PUT = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(
    req,
    z.object({ singleWithdrawal: Amount.optional(), dailyWithdrawal: Amount.optional(), monthlyEmergency: Amount.optional() }),
  );
  const toMinor = (v?: number) => (v === undefined ? undefined : Math.round(v * 100));
  const result = changeLimits(user, {
    ...(b.singleWithdrawal !== undefined && { singleWithdrawal: toMinor(b.singleWithdrawal) }),
    ...(b.dailyWithdrawal !== undefined && { dailyWithdrawal: toMinor(b.dailyWithdrawal) }),
    ...(b.monthlyEmergency !== undefined && { monthlyEmergency: toMinor(b.monthlyEmergency) }),
  });
  return json({ ...result, overview: limitsOverview(user) });
});
