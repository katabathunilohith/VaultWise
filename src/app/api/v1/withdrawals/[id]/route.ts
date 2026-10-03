import { customer, handle, json } from "@/lib/api";
import { cancelWithdrawal } from "@/lib/vaults";

type Ctx = { params: Promise<{ id: string }> };

/** Cancel a withdrawal that is still waiting for proof (releases the hold). */
export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  cancelWithdrawal(user, id);
  return json({ ok: true });
});
