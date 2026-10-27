import { onDeviceReset } from "@/lib/storage";

/**
 * Where to go next across a change of screen group, kept in memory only:
 * - "Recover with an ID" creates a new login first. Once that login exists the app shows the
 *   set-up screen, which sends the person on to the ID step instead of a fresh account.
 * - After a recovery request is sent, the app opens read-only; the status screen opens once it has.
 */
let recoverAfterSignUp = false;
let statusAfterClaim = false;

export function setRecoverAfterSignUp(on: boolean) {
  recoverAfterSignUp = on;
}

/** True once, right after "Recover with an ID" created the login. */
export function takeRecoverAfterSignUp() {
  const v = recoverAfterSignUp;
  recoverAfterSignUp = false;
  return v;
}

export function setStatusAfterClaim(on: boolean) {
  statusAfterClaim = on;
}

/** True once, right after a recovery request was sent. */
export function takeStatusAfterClaim() {
  const v = statusAfterClaim;
  statusAfterClaim = false;
  return v;
}

/** Whether a status screen is waiting to open (read without using it up). */
export function statusAfterClaimPending() {
  return statusAfterClaim;
}

// Sign-out and Delete account: nothing carries over to the next person.
onDeviceReset(() => {
  recoverAfterSignUp = false;
  statusAfterClaim = false;
});
