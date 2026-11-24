import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { tx } from "@/lib/db";
import { consumeVerification, setVerifiedPhone, verifiedPhone } from "@/lib/otp";
import { assertTrustedDevice, currentDevice } from "@/lib/devices";
import { mpinField, requireMpin } from "@/lib/mpin";

/**
 * Sets the verified phone number: `{ verificationToken, pin }`, the token from a `phone_verify` code and
 * the current MPIN. The number is the one the code went to.
 *
 * Adding a first number or replacing one needs the MPIN, always checked whatever MPIN_ENFORCED says
 * (wrong tries count toward the lock), because the number receives the codes that trust devices and
 * reset the MPIN. Replacing a verified number also needs a trusted device (403 `device_untrusted`),
 * checked first. Errors: the MPIN errors (401 `mpin_required`, 403 `mpin_wrong`, 423 `mpin_locked`),
 * 400 `verification_invalid`. Answers `{ ok: true }`; raises a `phone_verified` alert, and the number
 * can't reset the MPIN for 72 hours (POST /mpin/reset answers 403 `phone_recently_changed`).
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, money: "phone_change" });
  const b = await body(req, z.object({ verificationToken: z.string().min(1).max(200), pin: mpinField }));
  if (verifiedPhone(user.id)) assertTrustedDevice(await currentDevice(user), "phone_change"); // devices
  requireMpin(user, b.pin, "phone_change", { always: true }); // mpin
  tx(() => {
    const { phone } = consumeVerification(user, b.verificationToken, "phone_verify");
    setVerifiedPhone(user, phone);
  });
  return json({ ok: true });
});
