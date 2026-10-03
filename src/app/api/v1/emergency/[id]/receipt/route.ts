import { after } from "next/server";
import { customer, handle, json } from "@/lib/api";
import { get } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { createProof, runPipeline } from "@/lib/verification/pipeline";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 90;

/** Post-hoc accountability: a receipt after the release, without having blocked it. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const r = get<{ id: string; receipt_status: string; plan: string }>("SELECT * FROM emergency_requests WHERE id = ? AND user_id = ?", id, user.id);
  if (!r) throw new HttpError(404, "Emergency request not found");
  if (!["requested", "optional", "overdue", "rejected"].includes(r.receipt_status)) throw new HttpError(409, "A receipt is already being processed");
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  const proofId = createProof(user, {
    buffer: Buffer.from(await file.arrayBuffer()),
    fileName: file.name || "receipt",
    mime: file.type || "image/jpeg",
    purpose: "emergency_receipt",
    category: "emergency",
    emergencyId: id,
  });
  after(() => runPipeline(proofId));
  return json({ id: proofId, status: "processing" }, { status: 202 });
});
