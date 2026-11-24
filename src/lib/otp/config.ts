/**
 * The OTP module's switches and fixed numbers, read on every call so a test (or a restart with new
 * env) can flip them.
 *
 *   OTP_MODE          "test"   → no SMS: the code comes back in the API answer as `testCode`. Refused when
 *                               NODE_ENV=production unless OTP_TEST_ALLOWED=true.
 *                     "twilio" → SMS through Twilio's Messages API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,
 *                               TWILIO_FROM: a phone number in E.164 form or a Messaging Service SID "MG…").
 *                     unset    → off: sending a code answers 503 `otp_unavailable`.
 *   OTP_TEST_ALLOWED  "true" lets the test sender run on a production build (a capstone demo server).
 */

export type OtpMode = "test" | "twilio" | "off";

export function otpMode(): OtpMode {
  const m = process.env.OTP_MODE?.trim().toLowerCase();
  return m === "test" || m === "twilio" ? m : "off";
}

/** The test sender hands the code back in the answer, so a production server must opt in to it. */
export function otpTestAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.OTP_TEST_ALLOWED?.trim().toLowerCase() === "true";
}

export const OTP_PURPOSES = ["phone_verify", "device_trust", "mpin_reset"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

export const OTP_DIGITS = 6;
/** A code is valid this long after it was sent. */
export const OTP_TTL_MS = 5 * 60_000;
/** Wrong tries allowed per code; the last wrong one uses the code up. */
export const OTP_MAX_TRIES = 3;
/** Codes sent per person, and per person to one number, in any hour. */
export const OTP_SENDS_PER_HOUR = 5;
/**
 * `phone_verify` codes sent to one number from every account together, in any hour, counting only sends to a
 * number the sending account hasn't verified. Only `phone_verify` is refused by it, so other accounts can never
 * block the owner's own codes (`device_trust`, `mpin_reset`) to their verified number.
 */
export const OTP_NEW_NUMBER_SENDS_PER_HOUR = 15;
export const HOUR_MS = 3_600_000;
/** A verification token (what a right code gives) is valid this long, once. */
export const VERIFICATION_TTL_MS = 10 * 60_000;
/** After the verified number is added or changed, it can't be used to reset the MPIN for this long. */
export const PHONE_RESET_HOLD_MS = 72 * HOUR_MS;
