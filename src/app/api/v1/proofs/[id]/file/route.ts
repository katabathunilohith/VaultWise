import fs from "node:fs";
import { customer, handle } from "@/lib/api";
import { get } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { authMode } from "@/lib/auth/config"; // identity
import { isAdminRequest } from "@/lib/auth/session"; // identity

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  // identity: prototype → any proof once a wallet exists (as before); firebase → the owner or an admin.
  let ownerId: string | null = null;
  if (authMode() === "prototype" || !(await isAdminRequest())) ownerId = (await customer({ tick: false, access: "read" })).id;
  const kind = new URL(req.url).searchParams.get("kind") === "ela" ? "ela" : "original";
  const p = get<{ stored_path: string; ela_path: string | null; mime: string; user_id: string }>(
    "SELECT stored_path, ela_path, mime, user_id FROM proofs WHERE id = ?",
    id,
  );
  if (!p || (authMode() === "firebase" && ownerId && p.user_id !== ownerId)) throw new HttpError(404, "Not found");
  const file = kind === "ela" ? p.ela_path : p.stored_path;
  if (!file || !fs.existsSync(file)) throw new HttpError(404, "Not available");
  return new Response(new Uint8Array(fs.readFileSync(file)), {
    headers: { "Content-Type": kind === "ela" ? "image/png" : p.mime, "Cache-Control": "private, max-age=3600" },
  });
});
