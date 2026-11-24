import { z } from "zod";
import { body, customer, handle, json } from "@/lib/api";
import { verifyOtp } from "@/lib/otp";

/**
 * Checks a texted code: `{ otpId, code }`. Answers `{ verificationToken, purpose, expiresAt }`; the
 * token is valid for 10 minutes, once, for this person and purpose.
 * Errors: 400 `otp_wrong` (with `triesLeft`), 410 `otp_exhausted` / `otp_expired` / `otp_used`, 404 `otp_not_found`.
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  const b = await body(req, z.object({ otpId: z.string().min(1).max(64), code: z.string().max(12) }));
  return json(verifyOtp(user, b));
});
