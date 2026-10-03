import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { executeEmergency } from "@/lib/emergency";

/** Triggers the emergency cascade (Tier 1 → Tier 2) with guardrails. */
export const POST = handle(async (req: Request) => {
  const user = await customer();
  const b = await body(
    req,
    z.object({
      amount: z.number().positive(),
      reasonCode: z.string(),
      note: z.string().max(300).optional(),
      attest: z.boolean(),
      pin: z.string().optional(),
    }),
  );
  const r = executeEmergency(user, { amount: minor(b.amount), reasonCode: b.reasonCode, note: b.note, attest: b.attest, pin: b.pin });
  return json(r, { status: r.status === "blocked" ? 422 : 201 });
});
