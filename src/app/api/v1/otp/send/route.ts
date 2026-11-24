import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { assertPhoneSettled, OTP_PURPOSES, sendOtp, verifiedPhone } from "@/lib/otp";
import { assertRegisteredDevice, assertTrustedDevice, currentDevice } from "@/lib/devices";

/**
 * Texts a 6-digit code: `{ purpose, phone? }`. `phone` (with the country code) only for
 * `phone_verify`; `device_trust` and `mpin_reset` go to the verified number.
 * Answers `{ otpId, expiresAt, sentTo, testCode? }` (`testCode` only with OTP_MODE=test).
 *
 * Errors: 400 `phone_invalid`, 409 `phone_required`, 429 `otp_rate_limited` (with `retryAt`),
 * 503 `otp_unavailable`, 502 `otp_send_failed`; 403 `device_untrusted` when a new device tries to
 * replace a verified number or reset the MPIN; 400 `device_unknown` for `device_trust` without a device id;
 * 403 `phone_recently_changed` (with `allowedAt`) for `mpin_reset` within 72 hours of the number changing.
 * (Setting the number afterwards, POST /me/phone, needs the MPIN.)
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ purpose: z.enum(OTP_PURPOSES), phone: z.string().trim().max(32).optional() }));
  // devices, otp: checked before a code is sent, so no SMS is spent on a request that would be refused.
  const ctx = await currentDevice(user);
  if (b.purpose === "phone_verify" && verifiedPhone(user.id)) assertTrustedDevice(ctx, "phone_change");
  if (b.purpose === "mpin_reset") {
    assertTrustedDevice(ctx, "mpin_reset");
    assertPhoneSettled(user.id);
  }
  if (b.purpose === "device_trust") assertRegisteredDevice(ctx);
  return json(await sendOtp(user, { purpose: b.purpose, phone: b.phone }));
});
