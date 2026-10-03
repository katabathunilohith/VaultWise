import { customer, handle, json } from "@/lib/api";
import { badges } from "@/lib/engagement";

export const GET = handle(async () => {
  const user = await customer({ tick: false });
  return json(badges(user));
});
