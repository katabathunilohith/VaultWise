import { customer, handle, json } from "@/lib/api";
import { weeklyInsight } from "@/lib/engagement";

export const GET = handle(async () => {
  const user = await customer({ tick: false });
  return json(await weeklyInsight(user));
});
