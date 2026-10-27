import { z } from "zod";
import { admin, body, handle, json } from "@/lib/api";
import { decideKyc } from "@/lib/kyc/service";

type Ctx = { params: Promise<{ id: string }> };

/** identity: a person decides an ID check. A rejection's note is shown to the customer. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const reviewer = await admin();
  const { id } = await ctx.params;
  const b = await body(req, z.object({ decision: z.enum(["verified", "rejected"]), note: z.string().trim().min(3).max(500) }));
  const r = decideKyc(id, b.decision, reviewer, b.note);
  return json({ ok: true, status: r.status });
});
