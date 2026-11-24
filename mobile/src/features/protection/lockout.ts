import { router } from "expo-router";
import { api } from "@/lib/api/client";
import { queryClient } from "@/lib/api/hooks";
import { isPracticeMode } from "@/lib/api/practice";
import { authReady, getAuthState } from "@/lib/auth/firebase";
import { resetDevice } from "@/lib/session";
import { signOutOfVaultwise } from "@/features/auth";

/**
 * What ends the wrong-PIN guard after 10 wrong tries in a row (pin-policy.ts):
 * - "signOut": a Firebase login is on this phone, in live or Practice alike (Practice can be the
 *   fallback while the server is out of reach, with the live login still restored). The app signs
 *   out of Vaultwise; the password gets back in. Otherwise a Practice "start over" would clear the
 *   phone's PIN and lock and leave the login, so the live account would open unlocked once the
 *   server is back.
 * - "startOver": Practice with nobody signed in. Only Start Practice over carries on.
 * - null: live without sign-in (the prototype server), which has no sign-in to fall back on, so
 *   the guard keeps waiting 60 minutes after each wrong try instead.
 */
export type PinLockout = "signOut" | "startOver" | null;

export function pinLockoutKind(): PinLockout {
  if (getAuthState().user) return "signOut";
  return isPracticeMode() ? "startOver" : null;
}

const LOCKOUT_NOTICE = "Too many wrong MPIN tries on this phone. Sign in again to carry on.";

/** Practice data back to the sample account, only while the app is really in Practice (never the live account). */
async function resetPracticeData() {
  if (isPracticeMode()) await api.reset();
}

export async function signOutAfterWrongPins() {
  // In Practice the pretend data (with the name typed into it) goes too, as Start Practice over would.
  await resetPracticeData().catch(() => undefined);
  // devices: treated as a phone that may be in the wrong hands, so it signs in again as a new device.
  await signOutOfVaultwise(LOCKOUT_NOTICE, { forgetDevice: true });
}

/**
 * Practice, after 10 wrong PINs in a row: the sample account comes back and everything this phone
 * kept goes, the PIN included (the Practice MPIN is shown on screen again). Like Delete account in
 * Practice; the plain Start Practice over in Settings keeps the PIN. A Firebase login on the phone
 * (one restored after the button showed) is signed out too, never left behind an empty lock.
 */
export async function startPracticeOverAfterLockout() {
  await authReady();
  await resetPracticeData();
  if (getAuthState().user) await signOutOfVaultwise(LOCKOUT_NOTICE, { forgetDevice: true });
  else await resetDevice({ forgetDevice: true });
  await queryClient.resetQueries();
  if (router.canGoBack()) router.dismissTo("/");
}
