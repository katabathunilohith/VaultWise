import fs from "node:fs";
import { admin, handle } from "@/lib/api";
import { HttpError } from "@/lib/users";
import { kycRecord } from "@/lib/kyc/store";

type Ctx = { params: Promise<{ id: string }> };

/** identity: the ID photo behind a check, for the reviewer only. */
export const GET = handle(async (_req: Request, ctx: Ctx) => {
  await admin();
  const { id } = await ctx.params;
  const r = kycRecord(id);
  if (!r?.file_path || !fs.existsSync(r.file_path)) throw new HttpError(404, "Not available");
  const ext = r.file_path.split(".").pop();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return new Response(new Uint8Array(fs.readFileSync(r.file_path)), { headers: { "Content-Type": mime, "Cache-Control": "private, no-store" } });
});
