import { z } from "zod";
import { admin, body, handle, json } from "@/lib/api";
import { decideClaim } from "@/lib/recovery/service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * identity: approve → the new sign-in gets full access and every older sign-in for the wallet is disabled;
 * reject → the new sign-in is unbound. The account's email is told either way.
 */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const reviewer = await admin();
  const { id } = await ctx.params;
  const b = await body(req, z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().trim().min(3).max(500) }));
  return json({ ok: true, claim: await decideClaim(id, b.decision, reviewer, b.note) });
});
