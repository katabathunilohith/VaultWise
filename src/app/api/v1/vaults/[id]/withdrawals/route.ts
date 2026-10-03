import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { createWithdrawal } from "@/lib/vaults";

type Ctx = { params: Promise<{ id: string }> };

/** Standard, proof-gated withdrawal. Funds are held until a proof is verified. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const b = await body(
    req,
    z.object({ amount: z.number().positive(), payee: z.string().trim().min(2).max(80), note: z.string().max(200).optional() }),
  );
  const withdrawalId = createWithdrawal(user, id, minor(b.amount), b.payee, b.note);
  return json({ id: withdrawalId, status: "awaiting_proof" }, { status: 201 });
});
