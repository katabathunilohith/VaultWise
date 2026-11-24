import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { executeSip } from "@/lib/invest";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin

/** A one-off buy of the Core model portfolio from the linked bank. Needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "invest_buy" });
  const b = await body(req, z.object({ amount: z.number().positive(), pin: mpinField }));
  requireMpin(user, b.pin, "invest_buy"); // mpin
  const fills = await executeSip(user, minor(b.amount), { source: "manual" });
  return json({ fills }, { status: 201 });
});
