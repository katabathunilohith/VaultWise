import { handle } from "@/lib/api";
import { currentUser, HttpError } from "@/lib/users";
import { renderSample, SAMPLES } from "@/lib/samples";

type Ctx = { params: Promise<{ key: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { key } = await ctx.params;
  if (!SAMPLES[key]) throw new HttpError(404, "Unknown sample");
  const user = currentUser() ?? { name: "Alex Morgan", currency: "USD" };
  const buf = await renderSample(key, user);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "image/jpeg", "Content-Disposition": `inline; filename="${key}.jpg"`, "Cache-Control": "no-store" },
  });
});
