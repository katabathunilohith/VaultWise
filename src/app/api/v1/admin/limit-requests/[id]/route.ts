import { z } from "zod";
import { body, handle, json, REVIEWER } from "@/lib/api";
import { reviewLimitChange } from "@/lib/limits";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req, z.object({ decision: z.enum(["approved", "denied"]), note: z.string().trim().min(3).max(500) }));
  reviewLimitChange(id, b.decision, REVIEWER, b.note);
  return json({ ok: true });
});
