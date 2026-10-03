import { customer, handle, json } from "@/lib/api";
import { optOut } from "@/lib/invest/satellite";

export const POST = handle(async () => {
  const user = await customer({ tick: false });
  optOut(user);
  return json({ ok: true });
});
