/**
 * protection (plan 04, baseline finding 3): how the phone's wrong-PIN guard (features/account/
 * pin-guard.ts) slows guessing. Pure functions with no imports, ready for a test runner.
 *
 * Like a phone's own passcode: 4 free wrong tries, then a wait after each wrong try in a row, 1, 5,
 * 30 and 60 minutes (and 60 after that), and the 10th in a row ends it: live, the app signs out of
 * Vaultwise; Practice needs Start Practice over. A right PIN starts the count again.
 *
 * The server's MPIN lock for money moves (features/mpin/policy.ts) counts its own tries and uses
 * its own steps; the words on screen match it ("Wrong MPIN. 3 tries left.").
 */

/** Wrong tries in a row before the first wait. */
export const PIN_TRIES_BEFORE_WAIT = 5;

/** The wrong try in a row that ends it (sign-out live, Start Practice over in Practice). */
export const PIN_TRIES_FINAL = 10;

/** The waits after the 5th, 6th, 7th and 8th wrong try in a row; later ones wait as long as the last. */
export const PIN_WAIT_STEPS_MS: readonly number[] = [60_000, 5 * 60_000, 30 * 60_000, 60 * 60_000];

/** How long to wait after `fails` wrong tries in a row; null when this try doesn't start a wait. */
export function pinWaitAfter(fails: number): number | null {
  if (fails < PIN_TRIES_BEFORE_WAIT) return null;
  return PIN_WAIT_STEPS_MS[Math.min(fails - PIN_TRIES_BEFORE_WAIT, PIN_WAIT_STEPS_MS.length - 1)];
}

/** Whether `fails` wrong tries in a row end it (when the build has an ending: sign-out or Start over). */
export const pinTriesExhausted = (fails: number) => fails >= PIN_TRIES_FINAL;

/** Wrong tries left before the first wait, then before the end. */
export function pinTriesLeft(fails: number): number {
  return fails < PIN_TRIES_BEFORE_WAIT ? PIN_TRIES_BEFORE_WAIT - fails : Math.max(0, PIN_TRIES_FINAL - fails);
}
