import { after } from "next/server";
import { customer, handle, json } from "@/lib/api";
import { get } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { getVaultRow } from "@/lib/vaults";
import { createProof, runPipeline, validateUpload } from "@/lib/verification/pipeline";

type Ctx = { params: Promise<{ id: string }> };

export const maxDuration = 90;

/** Upload proof-of-purpose for a pending withdrawal; verification runs in the background. */
export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const user = await customer({ tick: false });
  const vault = getVaultRow(user, id);
  const form = await req.formData();
  const file = form.get("file");
  const withdrawalId = String(form.get("withdrawalId") ?? "");
  if (!(file instanceof File)) throw new HttpError(400, "Attach a file");
  const w = get<{ id: string; status: string }>(
    "SELECT id, status FROM withdrawals WHERE id = ? AND vault_id = ? AND user_id = ?",
    withdrawalId,
    id,
    user.id,
  );
  if (!w) throw new HttpError(404, "Withdrawal not found");
  if (w.status !== "awaiting_proof") throw new HttpError(409, "This withdrawal already has a proof");
  const buffer = Buffer.from(await file.arrayBuffer());
  await validateUpload(buffer, file.type || "image/jpeg");
  const proofId = createProof(user, {
    buffer,
    fileName: file.name || "upload",
    mime: file.type || "image/jpeg",
    purpose: "withdrawal",
    category: vault.template,
    vaultId: id,
    withdrawalId,
  });
  after(() => runPipeline(proofId));
  return json({ id: proofId, status: "processing" }, { status: 202 });
});
