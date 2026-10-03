import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { cancelSip, upsertSip } from "@/lib/invest/core";

/** Configure or modify a recurring Core SIP. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ amount: z.number().positive(), frequency: z.enum(["weekly", "monthly"]), startDate: z.string().optional() }));
  upsertSip(user, minor(b.amount), b.frequency, b.startDate ? new Date(b.startDate).getTime() : undefined);
  return json({ ok: true });
});

export const DELETE = handle(async () => {
  const user = await customer({ tick: false });
  cancelSip(user);
  return json({ ok: true });
});
