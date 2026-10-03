import { customer, handle, json } from "@/lib/api";
import { get } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { proofView } from "@/lib/verification/pipeline";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  if (!get("SELECT 1 FROM proofs WHERE id = ? AND user_id = ?", id, user.id)) throw new HttpError(404, "Proof not found");
  return json(proofView(id));
});
