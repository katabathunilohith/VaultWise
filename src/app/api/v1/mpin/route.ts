import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { changeMpin, mpinField } from "@/lib/mpin";

/**
 * Changes the MPIN. Body `{ currentPin, newPin }`. The current MPIN is always needed (wrong tries
 * count toward the lock); the new one must pass the policy (400 `mpin_weak` with a `reason`).
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "mpin_change" });
  const b = await body(req, z.object({ currentPin: mpinField, newPin: z.string().max(12) }));
  changeMpin(user, b.currentPin, b.newPin);
  return json({ ok: true });
});
