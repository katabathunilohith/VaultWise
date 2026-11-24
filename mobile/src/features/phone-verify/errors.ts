import { ApiError } from "@/lib/api/errors";

/**
 * The one place that reads the server's (or Practice's) answers about codes, by `code` (never by
 * status). Anything unknown falls back to the server's own message (errorMessage) in the screen.
 * Codes: docs/plans/contracts.md, OTP, and the server's plan 06 routes.
 */
export type OtpProblem =
  /** A wrong code: try again (tries left when the server says). */
  | { kind: "wrong"; triesLeft: number | null; message: string }
  /** This code can't be used any more (expired, used, too many tries, unknown): send a new one. */
  | { kind: "spent"; message: string }
  /** Too many codes asked for: wait until `retryAt`. */
  | { kind: "rate_limited"; retryAt: number | null; message: string }
  /** device_trust / mpin_reset with no verified number: add one first. */
  | { kind: "phone_required"; message: string }
  /** The number typed for phone_verify isn't one. */
  | { kind: "phone_invalid"; message: string }
  /** mpin_reset within 72 hours of the verified number being added or changed: wait until `allowedAt`. */
  | { kind: "recently_changed"; allowedAt: number | null; message: string };

/** Which server code means what. Change a code here and every OTP screen follows. */
const CODES: Record<string, OtpProblem["kind"]> = {
  otp_wrong: "wrong",
  otp_expired: "spent",
  otp_exhausted: "spent",
  otp_used: "spent",
  otp_not_found: "spent",
  otp_locked: "spent",
  otp_too_many_tries: "spent",
  verification_invalid: "spent",
  otp_rate_limited: "rate_limited",
  rate_limited: "rate_limited",
  phone_required: "phone_required",
  phone_invalid: "phone_invalid",
  phone_recently_changed: "recently_changed",
};

const SPENT: Record<string, string> = {
  otp_expired: "That code has expired. Send a new one.",
  otp_used: "That code was already used. Send a new one.",
  otp_not_found: "That code isn't valid any more. Send a new one.",
  verification_invalid: "That code has expired or was already used. Send a new one.",
};

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "4:10 pm", "4:10 pm tomorrow" or "24 Nov, 4:10 pm". */
export function clockText(at: number, now = Date.now()) {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((day(d) - day(new Date(now))) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `${time} tomorrow`;
  return `${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

export function readOtpError(e: unknown, now = Date.now()): OtpProblem | null {
  if (!(e instanceof ApiError) || !e.code) return null;
  const kind = CODES[e.code];
  switch (kind) {
    case "wrong": {
      const triesLeft = num(e.data?.triesLeft);
      const left = triesLeft === null ? "Check it and try again." : triesLeft === 1 ? "1 try left." : `${triesLeft} tries left.`;
      return { kind, triesLeft, message: `That code isn't right. ${left}` };
    }
    case "spent":
      return { kind, message: SPENT[e.code] ?? "That's too many wrong tries for this code. Send a new one." };
    case "rate_limited": {
      const retryAt = num(e.data?.retryAt);
      return {
        kind,
        retryAt,
        message:
          retryAt && retryAt > now
            ? `That's the most codes for now. You can ask for another at ${clockText(retryAt, now)}.`
            : "That's the most codes for now. Try again a little later.",
      };
    }
    case "phone_required":
      return { kind, message: "Add and verify your phone number first, so the code has somewhere to go." };
    case "phone_invalid":
      return { kind, message: "That isn't a phone number Vaultwise can text. Use the whole number with the country code, like +91." };
    case "recently_changed": {
      const allowedAt = num(e.data?.allowedAt);
      return {
        kind,
        allowedAt,
        message:
          allowedAt && allowedAt > now
            ? `Your phone number was added or changed recently, so for your safety it can't reset your MPIN until ${clockText(allowedAt, now)}. If you didn't change it, talk to a person now.`
            : "Your phone number was added or changed recently, so for your safety it can't reset your MPIN yet. If you didn't change it, talk to a person now.",
      };
    }
    default:
      return null;
  }
}
