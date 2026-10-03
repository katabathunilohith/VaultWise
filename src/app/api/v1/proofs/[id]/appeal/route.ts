import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { appeal } from "@/lib/verification/pipeline";

type Ctx = { params: Promise<{ id: string }> };

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ note: z.string().trim().min(5).max(500) }));
  appeal(user, id, b.note);
  return json({ ok: true });
});
