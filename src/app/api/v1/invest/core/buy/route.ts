import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { executeSip } from "@/lib/invest/core";

export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ amount: z.number().positive() }));
  const fills = await executeSip(user, minor(b.amount), { source: "manual" });
  return json({ fills }, { status: 201 });
});
