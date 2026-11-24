import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { optIn } from "@/lib/invest";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin

/** Opt in to the Satellite systematic trading sleeve (risk-capped, disclosed), or add to the allocation. Moves money from the bank, so it needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "satellite_opt_in" });
  const b = await body(req, z.object({ amount: z.number().positive(), acknowledged: z.number().int().min(0), pin: mpinField }));
  requireMpin(user, b.pin, "satellite_opt_in"); // mpin
  await optIn(user, minor(b.amount), b.acknowledged);
  return json({ ok: true }, { status: 201 });
});
