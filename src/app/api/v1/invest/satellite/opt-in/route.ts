import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { optIn } from "@/lib/invest/satellite";

/** Opt in to the Satellite systematic trading sleeve (risk-capped, disclosed). */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ amount: z.number().positive(), acknowledged: z.number().int().min(0) }));
  await optIn(user, minor(b.amount), b.acknowledged);
  return json({ ok: true }, { status: 201 });
});
