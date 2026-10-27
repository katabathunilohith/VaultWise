import fs from "node:fs";
import { admin, handle } from "@/lib/api";
import { HttpError } from "@/lib/users";
import { claimById } from "@/lib/recovery/claims";

type Ctx = { params: Promise<{ id: string }> };

/** identity: the ID photo sent with a recovery claim, for the reviewer only. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await admin();
  const { id } = await ctx.params;
  const c = claimById(id);
  if (!c?.file_path || !fs.existsSync(c.file_path)) throw new HttpError(404, "Not available");
  const ext = c.file_path.split(".").pop();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(fs.readFileSync(c.file_path)), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store" } });
});
