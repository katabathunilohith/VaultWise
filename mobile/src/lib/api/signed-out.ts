/**
 * identity, devices: the one place that hears "this sign-in no longer works" (401 `signed_out`) on any
 * request, not only GET /me. http.ts reports it with when the request went out; features/auth signs
 * out of Vaultwise with the server's words, unless the request was older than the current sign-in.
 *
 * The server says `signed_out` when there's no usable sign-in, and (firebase mode) when the sign-in is
 * older than the account's last device sign-out and the request isn't from a trusted device: "A device
 * was signed out of your account since you signed in here. Sign in again to continue." Refreshing the
 * token doesn't help then; only signing in again does.
 */
export interface SignedOutNote {
  /** The server's message, safe to show; null when it sent none. */
  message: string | null;
  /** When the refused request was sent (ms), so an answer to a request from before a new sign-in is ignored. */
  sentAt: number;
}

let last: SignedOutNote | null = null;
const listeners = new Set<(note: SignedOutNote) => void>();

/** http.ts calls this on 401 `signed_out`. */
export function noteSignedOut(note: SignedOutNote) {
  last = note;
  for (const fn of [...listeners]) fn(note);
}

/** Hears every 401 `signed_out` (the latest one at once, if it came before anyone listened). Returns the unsubscribe. */
export function onSignedOut(fn: (note: SignedOutNote) => void): () => void {
  listeners.add(fn);
  if (last) fn(last);
  return () => {
    listeners.delete(fn);
  };
}
