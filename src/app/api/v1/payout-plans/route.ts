import { body, customer, handle, json } from "@/lib/api";
import { checkInPayout, listPayoutPlans, recentPayoutHistory, savePayoutPlan } from "@/lib/payout-plan-store";
import { payoutCheckInSchema, payoutDateSchema, savePayoutPlanSchema, type PayoutPlansResponse } from "@/lib/payout-planner";

export const GET = handle(async (req: Request) => {
  const user = await customer({ tick: false, access: "read" });
  const asOfDate = new URL(req.url).searchParams.get("asOfDate");
  return json({
    plans: listPayoutPlans(user.id),
    history: recentPayoutHistory(user, asOfDate === null ? undefined : payoutDateSchema.parse(asOfDate)),
  } satisfies PayoutPlansResponse);
});

export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const { id, input, isExample } = await body(req, savePayoutPlanSchema);
  return json({ plan: savePayoutPlan(user, id, input, isExample) });
});

export const PATCH = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const { id, actualDate, actualAmount } = await body(req, payoutCheckInSchema);
  return json({ plan: checkInPayout(user, id, actualDate, actualAmount) });
});
