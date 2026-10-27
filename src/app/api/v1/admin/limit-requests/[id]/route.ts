import { z } from "zod";
import { admin, body, handle, json } from "@/lib/api";
import { reviewLimitChange } from "@/lib/limits";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const reviewer = await admin(); // identity: ops team only when sign-in is on
  const { id } = await ctx.params;
  const b = await body(req, z.object({ decision: z.enum(["approved", "denied"]), note: z.string().trim().min(3).max(500) }));
  reviewLimitChange(id, b.decision, reviewer, b.note);
  return json({ ok: true });
});
