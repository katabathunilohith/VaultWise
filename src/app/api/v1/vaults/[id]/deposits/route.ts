import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { deposit } from "@/lib/vaults";

type Ctx = { params: Promise<{ id: string }> };

/** Bank → vault. Money in: the ID gate from the money map (`vault_deposit`), no MPIN. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false, money: "vault_deposit" }); // mpin: money in
  const b = await body(req, z.object({ amount: z.number().positive(), memo: z.string().max(80).optional() }));
  const journalId = deposit(user, id, minor(b.amount), { memo: b.memo });
  return json({ journalId }, { status: 201 });
});
