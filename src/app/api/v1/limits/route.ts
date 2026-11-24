import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { changeLimits, getLimits, limitsOverview, type Limits } from "@/lib/limits";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin

export const GET = handle(async () => {
  const user = await customer({ access: "read" });
  return json(limitsOverview(user));
});

const Amount = z.number().min(0).max(1e9);

/** Standard change: tightening any time; loosening once per calendar month, with the MPIN. */
export const PUT = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(
    req,
    z.object({ singleWithdrawal: Amount.optional(), dailyWithdrawal: Amount.optional(), monthlyEmergency: Amount.optional(), pin: mpinField }),
  );
  const toMinor = (v?: number) => (v === undefined ? undefined : Math.round(v * 100));
  const next: Partial<Limits> = {
    ...(b.singleWithdrawal !== undefined && { singleWithdrawal: toMinor(b.singleWithdrawal) }),
    ...(b.dailyWithdrawal !== undefined && { dailyWithdrawal: toMinor(b.dailyWithdrawal) }),
    ...(b.monthlyEmergency !== undefined && { monthlyEmergency: toMinor(b.monthlyEmergency) }),
  };
  // mpin: any limit going up is a money action.
  const current = getLimits(user);
  if ((Object.keys(next) as (keyof Limits)[]).some((k) => next[k]! > current[k])) requireMpin(user, b.pin, "limits_loosen");
  const result = changeLimits(user, next);
  return json({ ...result, overview: limitsOverview(user) });
});
