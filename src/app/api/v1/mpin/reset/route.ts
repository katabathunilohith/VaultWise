import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { tx } from "@/lib/db";
import { assertNewMpin, setMpin } from "@/lib/mpin";
import { assertPhoneSettled, consumeVerification } from "@/lib/otp"; // otp
import { assertTrustedDevice, currentDevice } from "@/lib/devices"; // devices

/**
 * Resets a forgotten MPIN: `{ verificationToken, newPin }`, where the token comes from a texted code
 * (POST /otp/send with purpose `mpin_reset`, then POST /otp/verify).
 *
 * The new MPIN must pass the policy (400 `mpin_weak` with `reason`), the calling device must be
 * trusted (403 `device_untrusted` with `trustableAt`), and the verified number must have been on the
 * account for 72 hours (403 `phone_recently_changed` with `allowedAt`), so neither a texted code from a
 * new phone nor a number someone just put on the account can take it over. Then the token is used, the
 * MPIN stored, wrong tries and any lock cleared, and it is audited (`mpin.changed` with `by: "reset"`)
 * with an `mpin_changed` alert, in one transaction. Errors: 400 `verification_invalid`. Answers `{ ok: true }`.
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ verificationToken: z.string().min(1).max(200), newPin: z.string().max(12) }));
  assertNewMpin(b.newPin, user);
  assertTrustedDevice(await currentDevice(user), "mpin_reset"); // devices
  assertPhoneSettled(user.id); // otp
  tx(() => {
    consumeVerification(user, b.verificationToken, "mpin_reset"); // otp
    setMpin(user, b.newPin, "reset");
  });
  return json({ ok: true });
});
