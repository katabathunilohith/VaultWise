import { z } from "zod";
import { body, customer, handle, json, minor } from "@/lib/api";
import { executeEmergency } from "@/lib/emergency";
import { mpinField } from "@/lib/mpin"; // mpin
import { assertDeviceMayMove } from "@/lib/devices"; // devices

/** Triggers the emergency cascade (Tier 1 → Tier 2) with guardrails. Every tier needs the MPIN. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ money: "emergency" });
  const b = await body(
    req,
    z.object({
      amount: z.number().positive(),
      reasonCode: z.string(),
      note: z.string().max(300).optional(),
      attest: z.boolean(),
      pin: mpinField,
    }),
  );
  await assertDeviceMayMove(user, minor(b.amount), "emergency"); // devices: a new device may only move a little
  // mpin: executeEmergency checks the MPIN itself, before its transaction (so a wrong try's audit row is kept).
  const r = executeEmergency(user, {
    amount: minor(b.amount),
    reasonCode: b.reasonCode,
    note: b.note,
    attest: b.attest,
    pin: b.pin,
    mpinEveryTier: true,
  });
  return json(r, { status: r.status === "blocked" ? 422 : 201 });
});
