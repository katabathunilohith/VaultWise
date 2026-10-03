import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { planEmergency } from "@/lib/emergency";

export const POST = handle(async (req: Request) => {
  const user = await customer();
  const b = await body(req, z.object({ amount: z.number().positive() }));
  return json(planEmergency(user, minor(b.amount)));
});
