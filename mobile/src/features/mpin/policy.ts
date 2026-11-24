/**
 * The MPIN rules from the contract (docs/plans/contracts.md, MPIN), as pure functions with no
 * imports, so screens and the Practice simulator (lib/api/demo/mpin.ts) can share them.
 *
 * The server's copy is src/lib/mpin/policy.ts and src/lib/mpin/attempts.ts: keep the list, the
 * messages and the lock steps in step with it. The server always has the final say.
 */

/** Digits in an MPIN chosen under the policy. */
export const MPIN_LENGTH = 6;

/** Digits in a PIN chosen before the MPIN (still accepted until it's changed). */
export const LEGACY_PIN_LENGTH = 4;

export type WeakReason = "length" | "repeated" | "sequence" | "common" | "birth_date";

/** Well-known PINs refused on top of the rules (one digit repeated and straight runs are caught by the rules). */
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

/** The plain message for a refusal reason, also used for the server's `mpin_weak` answer. */
export function weakMpinMessage(reason: string | undefined): string {
  return reason && reason in MESSAGES ? MESSAGES[reason as WeakReason] : "That MPIN is too easy to guess. Choose a less common one.";
}

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

/* ---------- wrong tries and the lock ---------- */

/** Wrong tries before each lock. */
export const MPIN_TRIES_PER_LOCK = 5;

/** 1 minute, then 5 minutes, then 30 minutes, then 24 hours (and it stays at 24 hours). */
export const MPIN_LOCK_STEPS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 24 * 3_600_000];

/** How long a lock lasts once `failures` wrong tries are counted; null when this try doesn't lock. */
export function lockMsAfter(failures: number): number | null {
  if (failures <= 0 || failures % MPIN_TRIES_PER_LOCK !== 0) return null;
  const step = failures / MPIN_TRIES_PER_LOCK - 1;
  return MPIN_LOCK_STEPS_MS[Math.min(step, MPIN_LOCK_STEPS_MS.length - 1)];
}

/** Wrong tries left before the next lock, with `failures` counted so far. */
export function triesLeftAfter(failures: number): number {
  return MPIN_TRIES_PER_LOCK - (failures % MPIN_TRIES_PER_LOCK);
}

/** "45 seconds", "5 minutes", "24 hours": how long until a lock ends, rounded up (as the server says it). */
export function waitText(ms: number): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const s = Math.max(1, Math.ceil(ms / 1000));
  if (s < 60) return plural(s, "second");
  const m = Math.ceil(ms / 60_000);
  if (m < 60) return plural(m, "minute");
  return plural(Math.ceil(ms / 3_600_000), "hour");
}
