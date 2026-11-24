import { ApiError } from "@/lib/api/errors";
import { weakMpinMessage } from "./policy";

/**
 * The one place that reads the server's (or Practice's) MPIN answers and says them in plain words.
 * Every flow goes through here: the MPIN sheet, the embedded MPIN step and Change MPIN.
 *
 * The contract puts `triesLeft` and `lockedUntil` in the error body; until the server sends them,
 * they're read from its message ("3 tries left", "locked for 5 minutes").
 */
export type MpinProblem =
  | { kind: "wrong"; triesLeft: number | null; message: string }
  | { kind: "locked"; lockedUntil: number; message: string }
  | { kind: "required"; message: string }
  | { kind: "weak"; reason: string | undefined; message: string };

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** "3 tries left" / "1 try left" in the server's message. */
function triesFromMessage(message: string): number | null {
  const m = /(\d+)\s+tr(?:y|ies)\s+left/i.exec(message);
  return m ? Number(m[1]) : null;
}

const UNIT_MS: Record<string, number> = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/** "locked for 5 minutes" / "Try again in 24 hours" in the server's message, counted from now. */
function untilFromMessage(message: string, now: number): number | null {
  const m = /(\d+)\s+(second|minute|hour|day)s?/i.exec(message);
  return m ? now + Number(m[1]) * UNIT_MS[m[2].toLowerCase()] : null;
}

/** "3:40 pm", "3:40 pm tomorrow" or "24 Nov, 3:40 pm": when a lock ends. */
export function unlockTimeText(until: number, now = Date.now()) {
  const at = new Date(until);
  const time = at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(at) - day(new Date(now))) / 86_400_000);
  if (days <= 0) return time;
  if (days === 1) return `${time} tomorrow`;
  return `${at.toLocaleDateString(undefined, { day: "numeric", month: "short" })}, ${time}`;
}

export function wrongMpinText(triesLeft: number | null) {
  if (triesLeft === null) return "Wrong MPIN. Try again.";
  if (triesLeft <= 0) return "Wrong MPIN.";
  return `Wrong MPIN. ${triesLeft === 1 ? "1 try" : `${triesLeft} tries`} left.`;
}

export function lockedMpinText(lockedUntil: number, now = Date.now()) {
  return `Too many wrong tries. Money moves are locked until ${unlockTimeText(lockedUntil, now)}.`;
}

export const MPIN_REQUIRED_TEXT = "Enter your MPIN to approve this.";

/** Reads an MPIN answer (wrong, locked, required, weak). Null for any other error: the flow shows those itself. */
export function readMpinError(e: unknown, now = Date.now()): MpinProblem | null {
  if (!(e instanceof ApiError)) return null;
  const code = e.code ?? (e.status === 423 ? "mpin_locked" : undefined);
  switch (code) {
    case "mpin_wrong": {
      const triesLeft = num(e.data?.triesLeft) ?? triesFromMessage(e.message);
      return { kind: "wrong", triesLeft, message: wrongMpinText(triesLeft) };
    }
    case "mpin_locked": {
      const lockedUntil = num(e.data?.lockedUntil) ?? untilFromMessage(e.message, now) ?? now + 60_000;
      return { kind: "locked", lockedUntil, message: lockedMpinText(lockedUntil, now) };
    }
    case "mpin_required":
      return { kind: "required", message: MPIN_REQUIRED_TEXT };
    case "mpin_weak": {
      const reason = typeof e.data?.reason === "string" ? e.data.reason : undefined;
      return { kind: "weak", reason, message: reason ? weakMpinMessage(reason) : e.message || weakMpinMessage(undefined) };
    }
    default:
      return null;
  }
}

/** True for any MPIN answer. */
export const isMpinError = (e: unknown) => readMpinError(e) !== null;

// devices (plan 06): a phone that isn't trusted yet. Money moves over the cap answer 403
// `device_untrusted` with `trustableAt` (ms; null = not automatically, it has to be trusted).
export interface UntrustedProblem {
  trustableAt: number | null;
  title: string;
  message: string;
  /** The account couldn't add this phone (too many new devices): no Trust button, it would be refused. */
  unrecognised?: boolean;
}

/**
 * Where this phone stands, from /me's `device` (undefined from a server without plan 06):
 * - "trusted";
 * - "cooling": untrusted, and trusts itself at `trustableAt` (or sooner with a code and the MPIN);
 * - "needs_code": untrusted and won't trust itself with time (`trustableAt` null: first seen after a
 *   device was signed out of the account), so only a code and the MPIN do;
 * - "unrecognised": the account couldn't add it (`registered: false`: 5 new devices this hour or 20
 *   signed in), so it can't be trusted at all for now. Pure.
 */
export type PhoneTrust = "trusted" | "cooling" | "needs_code" | "unrecognised";

export function phoneTrust(d: { registered?: boolean; trusted: boolean; trustableAt: number | null } | undefined, now = Date.now()): PhoneTrust | null {
  if (!d) return null;
  if (d.trusted) return "trusted";
  if (d.registered === false) return "unrecognised";
  return d.trustableAt !== null && d.trustableAt > now ? "cooling" : "needs_code";
}

/** "Large amounts can move from it from 3:40 pm tomorrow, or trust it now." With no time: only a code and the MPIN trust it. */
export function untrustedText(trustableAt: number | null, now = Date.now()) {
  if (trustableAt !== null && trustableAt > now)
    return `Large amounts can move from it from ${unlockTimeText(trustableAt, now)}, or trust it now with a code to your phone and your MPIN.`;
  if (trustableAt !== null) return "Trust it with a code to your phone and your MPIN, and large amounts can move from it.";
  return "It was first used after a device was signed out of your account, so waiting won't trust it. Trust it with a code to your phone and your MPIN, and large amounts can move from it.";
}

export const UNRECOGNISED_TITLE = "This phone isn't on your account's list";

/** The account couldn't add this phone (/me `registered: false`, or `device_unknown`): calm, and no Trust button. */
export const UNRECOGNISED_TEXT =
  "Vaultwise couldn't add this phone to your account: lots of new devices signed in lately, or 20 are signed in already (or this phone couldn't keep its id). It can still move small amounts. Try again in an hour, or sign out devices you no longer use from a phone you trust.";

/** Reads a `device_untrusted` answer; null for anything else. */
export function readDeviceError(e: unknown, now = Date.now()): UntrustedProblem | null {
  if (!(e instanceof ApiError) || e.code !== "device_untrusted") return null;
  const trustableAt = num(e.data?.trustableAt);
  return { trustableAt, title: "This phone isn't trusted yet", message: untrustedText(trustableAt, now) };
}

/** The same answer as this phone should show it, given what /me says about it (an unrecognised phone gets no Trust button). Pure. */
export function deviceProblemFor(p: UntrustedProblem, device: Parameters<typeof phoneTrust>[0], now = Date.now()): UntrustedProblem {
  return phoneTrust(device, now) === "unrecognised" ? { ...p, unrecognised: true, title: UNRECOGNISED_TITLE, message: UNRECOGNISED_TEXT } : p;
}

/** `device_unknown`: trusting (or a `device_trust` code) refused because the account couldn't add this phone. */
export const isDeviceUnknown = (e: unknown) => e instanceof ApiError && e.code === "device_unknown";
