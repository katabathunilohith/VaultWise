import { z } from "zod";
import { admin, body, handle, json } from "@/lib/api";
import { resolveFlag } from "@/lib/fraud";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const reviewer = await admin(); // identity: ops team only when sign-in is on
  const { id } = await ctx.params;
  const b = await body(req, z.object({ status: z.enum(["resolved", "dismissed"]), resolution: z.string().trim().min(3).max(300) }));
  resolveFlag(id, b.status, b.resolution, reviewer);
  return json({ ok: true });
});
