/**
 * OTP: 6-digit codes texted to the person's phone, for verifying the number, trusting a new device
 * and resetting a forgotten MPIN. See README.md for the switches (OTP_MODE, OTP_TEST_ALLOWED,
 * TWILIO_*) and every touch point outside this folder.
 */
export {
  otpMode,
  otpTestAllowed,
  OTP_PURPOSES,
  OTP_DIGITS,
  OTP_TTL_MS,
  OTP_MAX_TRIES,
  OTP_SENDS_PER_HOUR,
  OTP_NEW_NUMBER_SENDS_PER_HOUR,
  VERIFICATION_TTL_MS,
  PHONE_RESET_HOLD_MS,
  type OtpMode,
  type OtpPurpose,
} from "./config";
export { OtpError, type OtpErrorCode } from "./errors";
export { type OtpSender, testOtpSender, otpSender } from "./senders";
export { twilioConfig, twilioSender, TWILIO_API, type TwilioConfig } from "./twilio";
export { normalisePhone, maskPhone, verifiedPhone, phoneStatus, phoneChangedAt, assertPhoneSettled, setVerifiedPhone } from "./phone";
export { newCode, smsText, sendOtp, verifyOtp, consumeVerification, type SentOtp, type Verification } from "./service";
