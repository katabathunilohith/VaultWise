import { z } from "zod";
import { body, handle, json, REVIEWER } from "@/lib/api";
import { resolveFlag } from "@/lib/fraud";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await body(req, z.object({ status: z.enum(["resolved", "dismissed"]), resolution: z.string().trim().min(3).max(300) }));
  resolveFlag(id, b.status, b.resolution, REVIEWER);
  return json({ ok: true });
});
