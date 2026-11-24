import { HttpError } from "../users";

export type OtpErrorCode =
  | "otp_unavailable"
  | "otp_send_failed"
  | "otp_rate_limited"
  | "otp_not_found"
  | "otp_expired"
  | "otp_used"
  | "otp_wrong"
  | "otp_exhausted"
  | "verification_invalid"
  | "phone_invalid"
  | "phone_required"
  | "phone_recently_changed";

/**
 * An OTP error. `extra` holds the extra fields errorResponse() in lib/api.ts spreads into the JSON:
 * `triesLeft` on `otp_wrong`, `retryAt` (ms since epoch) on `otp_rate_limited`, `allowedAt` (ms since epoch)
 * on `phone_recently_changed`.
 */
export class OtpError extends HttpError {
  constructor(
    status: number,
    message: string,
    code: OtpErrorCode,
    public extra: { triesLeft?: number; retryAt?: number; allowedAt?: number } = {},
  ) {
    super(status, message, code);
  }
}

export function otpUnavailable() {
  return new OtpError(503, "Texted codes aren't available on this server right now. Try again later.", "otp_unavailable");
}
