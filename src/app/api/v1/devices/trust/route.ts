import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { assertRegisteredDevice, currentDevice, trustDevice } from "@/lib/devices";
import { mpinField, requireMpin } from "@/lib/mpin";

/**
 * Trusts the calling device: `{ verificationToken, pin }`, where the token comes from a texted code
 * (POST /otp/send with purpose `device_trust`, then POST /otp/verify). The MPIN is always checked
 * (wrong tries count toward the lock), then the token is used. Answers `{ ok: true }`.
 * Errors: 400 `device_unknown` (no x-device-id), the MPIN errors, 400 `verification_invalid`.
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "device_trust" });
  const b = await body(req, z.object({ verificationToken: z.string().min(1).max(200), pin: mpinField }));
  const ctx = await currentDevice(user);
  assertRegisteredDevice(ctx);
  requireMpin(user, b.pin, "device_trust", { always: true });
  trustDevice(user, ctx, b.verificationToken);
  return json({ ok: true });
});
