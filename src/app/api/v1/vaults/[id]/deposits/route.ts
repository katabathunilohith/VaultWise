import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { deposit } from "@/lib/vaults";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ amount: z.number().positive(), memo: z.string().max(80).optional() }));
  const journalId = deposit(user, id, minor(b.amount), { memo: b.memo });
  return json({ journalId }, { status: 201 });
});
