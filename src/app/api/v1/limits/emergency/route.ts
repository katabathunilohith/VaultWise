import { customer, handle, json } from "@/lib/api";
import { limitsOverview, requestEmergencyLimitChange, type Limits } from "@/lib/limits";
import { HttpError } from "@/lib/users";
import { validateUpload } from "@/lib/verification/pipeline";
import { mpinField, requireMpin } from "@/lib/mpin"; // mpin
import { limitUploads } from "@/lib/rate-limit"; // rate-limit

export const maxDuration = 90;

/**
 * Emergency exception to the once-a-month rule: the request is assessed by an
 * AI model, decided by a deterministic policy, and routed to a person when unsure.
 * Multipart form: limit fields (major units), reasonCode, explanation, optional file, and `pin` (the MPIN).
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "limits_loosen" });
  const form = await req.formData();
  // mpin: asking to raise a limit is a money action; checked before the upload and the AI assessment.
  requireMpin(user, mpinField.parse(form.get("pin") ?? undefined), "limits_loosen");
  const limits: Partial<Limits> = {};
  for (const k of ["singleWithdrawal", "dailyWithdrawal", "monthlyEmergency"] as const) {
    const raw = form.get(k);
    if (raw === null || raw === "") continue;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `Invalid ${k}`);
    limits[k] = Math.round(n * 100);
  }
  const file = form.get("file");
  let document: { buffer: Buffer; mime: string } | null = null;
  if (file instanceof File && file.size > 0) {
    limitUploads(user.id); // rate-limit: only a request that carries a file counts as an upload
    const buffer = Buffer.from(await file.arrayBuffer());
    await validateUpload(buffer, file.type || "image/jpeg");
    document = { buffer, mime: file.type };
  }
  const result = await requestEmergencyLimitChange(user, {
    limits,
    reasonCode: String(form.get("reasonCode") ?? ""),
    explanation: String(form.get("explanation") ?? ""),
    document,
  });
  return json({ ...result, overview: limitsOverview(user) }, { status: 201 });
});
