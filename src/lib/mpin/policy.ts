import { MPIN_LENGTH } from "./config";

/**
 * The MPIN policy, as pure functions (no database). The phone's Practice simulator mirrors this
 * file, so keep the rules and the list below in step with `mobile/src/features/mpin`.
 */

export type WeakReason = "length" | "repeated" | "sequence" | "common" | "birth_date";

/**
 * Well-known PINs refused on top of the rules (all one digit and straight runs are caught by the
 * rules, so they aren't listed). Six digits each.
 */
export const COMMON_MPINS: readonly string[] = [
  "121212",
  "112233",
  "111222",
  "123123",
  "123321",
  "112211",
  "101010",
  "010101",
  "202020",
  "131313",
  "000111",
  "111000",
  "102030",
  "123654",
  "147258",
  "258369",
  "147852",
  "159753",
  "159357",
  "696969",
];

const MESSAGES: Record<WeakReason, string> = {
  length: `Your MPIN must be exactly ${MPIN_LENGTH} digits.`,
  repeated: "Your MPIN can't be one digit repeated. Choose a mix of digits.",
  sequence: "Your MPIN can't be a straight run like 123456 or 654321.",
  common: "That MPIN is too easy to guess. Choose a less common one.",
  birth_date: "Your MPIN can't be your date of birth.",
};

export type MpinCheck = { ok: true } | { ok: false; reason: WeakReason; message: string };

/** Every digit one more (or one less) than the one before; 9 → 0 and 0 → 9 count too (e.g. 567890). */
function isStraightRun(pin: string) {
  const d = [...pin].map(Number);
  const steps = d.slice(1).map((n, i) => (n - d[i] + 10) % 10);
  return steps.every((s) => s === 1) || steps.every((s) => s === 9);
}

/** A "YYYY-MM-DD" date of birth as the DDMMYY a person might pick; null when it isn't a date. */
export function birthDateAsPin(dob: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dob ?? "");
  return m ? `${m[3]}${m[2]}${m[1].slice(2)}` : null;
}

/**
 * Checks an MPIN someone is choosing: exactly 6 digits, not one digit repeated, not a straight run
 * up or down, not on the common list, and not their date of birth (as DDMMYY) when it is known.
 */
export function checkNewMpin(pin: string, opts: { dob?: string | null } = {}): MpinCheck {
  const refuse = (reason: WeakReason): MpinCheck => ({ ok: false, reason, message: MESSAGES[reason] });
  if (!new RegExp(`^\\d{${MPIN_LENGTH}}$`).test(pin)) return refuse("length");
  if (/^(\d)\1+$/.test(pin)) return refuse("repeated");
  if (isStraightRun(pin)) return refuse("sequence");
  if (COMMON_MPINS.includes(pin)) return refuse("common");
  if (pin === birthDateAsPin(opts.dob)) return refuse("birth_date");
  return { ok: true };
}
