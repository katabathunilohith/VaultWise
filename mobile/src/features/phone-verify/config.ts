/**
 * phone-verify (plan 06): the switch for adding a phone number with a code, and the code entry the
 * devices and MPIN-reset flows share. Off, Settings has no Phone number row; the other flows still
 * work against a server whose account already has a verified number.
 */
export const PHONE_VERIFY_ENABLED = true;

/** A new code can be asked for this long after the last one (the server allows 5 an hour). */
export const RESEND_AFTER_MS = 30_000;

/** Codes are 6 digits (docs/plans/contracts.md, OTP). */
export const OTP_LENGTH = 6;

/** The route of Add your phone number (app/settings/verify-phone.tsx). */
export const VERIFY_PHONE_ROUTE = "/settings/verify-phone";
