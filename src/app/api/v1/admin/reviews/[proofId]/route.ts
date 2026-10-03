import { z } from "zod";
import { body, handle, json, REVIEWER } from "@/lib/api";
import { all, get } from "@/lib/db";
import { HttpError } from "@/lib/users";
import { proofView, reviewDecision } from "@/lib/verification/pipeline";

type Ctx = { params: Promise<{ proofId: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { proofId } = await ctx.params;
  const view = proofView(proofId);
  const owner = get<{ user_id: string }>("SELECT user_id FROM proofs WHERE id = ?", proofId);
  if (!owner) throw new HttpError(404, "Not found");
  const user = get<{ id: string; name: string; jurisdiction: string; currency: string; created_at: number; kyc_status: string }>(
    "SELECT id, name, jurisdiction, currency, created_at, kyc_status FROM users WHERE id = ?",
    owner.user_id,
  );
  const history = all<{ decision: string; final_decision: string | null; n: number }>(
    `SELECT v.decision, v.final_decision, COUNT(*) AS n FROM verifications v JOIN proofs p ON p.id = v.proof_id
     WHERE p.user_id = ? GROUP BY v.decision, v.final_decision`,
    owner.user_id,
  );
  const flags = all("SELECT * FROM fraud_flags WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", owner.user_id);
  return json({ ...view, user, history, flags });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { proofId } = await ctx.params;
  const b = await body(req, z.object({ decision: z.enum(["approved", "denied"]), note: z.string().trim().min(3).max(500) }));
  reviewDecision(proofId, b.decision, REVIEWER, b.note);
  return json({ ok: true });
});
