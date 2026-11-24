import { otpMode, otpTestAllowed, type OtpPurpose } from "./config";
import { otpUnavailable } from "./errors";
import { twilioConfig, twilioSender } from "./twilio";

/**
 * Where a one-time code goes. Dependency inversion: the OTP service only knows this interface; the
 * provider is picked by OTP_MODE. A new provider (MSG91, Firebase) is a new sender plus a line in
 * `otpSender()`.
 */
export interface OtpSender {
  readonly name: string;
  /**
   * Delivers `text` (which contains `code`) to `phone` (E.164). Returns `testCode` only for the test
   * sender. Throws an OtpError (`otp_send_failed`) when the provider refuses.
   */
  send(input: { phone: string; code: string; purpose: OtpPurpose; text: string }): Promise<{ testCode?: string }>;
}

/** No SMS: the code is handed back so a tester (or the Practice simulator's twin) can type it. */
export const testOtpSender: OtpSender = {
  name: "test",
  send: async ({ code }) => ({ testCode: code }),
};

/** The sender for this server, or 503 `otp_unavailable` when none is set up (the details go to the log). */
export function otpSender(): OtpSender {
  const mode = otpMode();
  if (mode === "test") {
    if (otpTestAllowed()) return testOtpSender;
    console.error("[otp] OTP_MODE=test is refused when NODE_ENV=production. Set OTP_MODE=twilio, or OTP_TEST_ALLOWED=true for a demo server.");
    throw otpUnavailable();
  }
  if (mode === "twilio") {
    const cfg = twilioConfig();
    if (cfg) return twilioSender(cfg);
    console.error("[otp] OTP_MODE=twilio needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.");
    throw otpUnavailable();
  }
  throw otpUnavailable();
}
