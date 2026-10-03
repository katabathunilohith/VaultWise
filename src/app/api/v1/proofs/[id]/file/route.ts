import fs from "node:fs";
import { handle } from "@/lib/api";
import { get } from "@/lib/db";
import { HttpError, requireUser } from "@/lib/users";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  requireUser();
  const kind = new URL(req.url).searchParams.get("kind") === "ela" ? "ela" : "original";
  const p = get<{ stored_path: string; ela_path: string | null; mime: string }>("SELECT stored_path, ela_path, mime FROM proofs WHERE id = ?", id);
  if (!p) throw new HttpError(404, "Not found");
  const file = kind === "ela" ? p.ela_path : p.stored_path;
  if (!file || !fs.existsSync(file)) throw new HttpError(404, "Not available");
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": kind === "ela" ? "image/png" : p.mime, "Cache-Control": "private, max-age=3600" },
  });
});
