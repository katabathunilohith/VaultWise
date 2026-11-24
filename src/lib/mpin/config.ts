/**
 * The MPIN module's switch and fixed numbers. The switch is read on every call, so a test (or a
 * restart with new env) can flip it.
 *
 *   MPIN_ENFORCED  unset or anything but "false" → on (the default): every money action needs the
 *                  right MPIN, wrong tries lock money moves, and a new PIN must pass the 6-digit policy.
 *                  "false" → rollback mode: checks are skipped (wrong tries are still counted and
 *                  audited), Tier 2 emergency keeps its old PIN check, and a new PIN only has to be
 *                  4 to 6 digits, so older phone builds keep working.
 */
export function mpinEnforced(): boolean {
  return process.env.MPIN_ENFORCED?.trim().toLowerCase() !== "false";
}

/** Digits in an MPIN chosen under the policy. */
export const MPIN_LENGTH = 6;

/** Wrong tries allowed between locks. */
export const TRIES_PER_LOCK = 5;

/** Lock lengths after the 1st, 2nd, 3rd and every later run of wrong tries. */
export const LOCK_STEPS_MS = [60_000, 5 * 60_000, 30 * 60_000, 24 * 3_600_000] as const;

/** Longest PIN the routes accept in a body (anything longer is refused by validation, not hashed). */
export const MAX_PIN_INPUT = 12;
