import { resetPinAttempts } from "@/features/account/pin-guard";
import { api } from "@/lib/api/client";
import { queryClient, useMe } from "@/lib/api/hooks";
import { invalidate } from "@/lib/api/keys";
import { isPracticeMode } from "@/lib/api/practice";
import type { MeMpin } from "@/lib/api/types";
import { checkDevicePin, setDevicePin } from "@/lib/auth/device-pin";
import { refreshMpinShortcut } from "./biometric";
import { MPIN_LENGTH } from "./policy";

/**
 * One PIN: the app-unlock PIN on this phone is the MPIN. These keep the phone's copy (a salted
 * hash, lib/auth/device-pin.ts) in step with the MPIN the server knows.
 */

/** What /me says about the MPIN (undefined until it loads, or from a server without the MPIN). */
export function useMpinStatus(): MeMpin | undefined {
  const me = useMe();
  return me.data?.onboarded ? me.data.mpin : undefined;
}

/** Re-reads /me, so the lock time and the upgrade flag are current. */
export function refreshMpinStatus() {
  return invalidate(queryClient, "me");
}

/**
 * Whether a money move the server accepted proves the MPIN typed for it: only live, and only when
 * /me says the server enforces the MPIN (`mpin.enforced`). A server with MPIN_ENFORCED=false accepts
 * a wrong MPIN (and older servers ignore `pin`), and Practice checks its own MPIN (the printed
 * Practice one), never the live one. Read it before the call, so the mode it was sent in counts.
 */
export function mpinCheckedByServer(status: MeMpin | undefined): boolean {
  return !isPracticeMode() && status?.enforced === true;
}

/**
 * The server just accepted this MPIN (and mpinCheckedByServer() said that proves it): make it the
 * unlock PIN too, if it isn't already (an older 4-digit unlock PIN, none on this phone yet, or an
 * MPIN changed on another device).
 */
export async function rememberMpin(pin: string) {
  if (pin.length !== MPIN_LENGTH || (await checkDevicePin(pin))) return;
  await setDevicePin(pin);
  await resetPinAttempts();
}

/**
 * Changes the MPIN on the server (live POST /mpin, or the Practice simulator), then the unlock PIN
 * and the biometric copy. Throws the server's answer (readMpinError reads the MPIN ones).
 * Returns whether the Face ID / fingerprint shortcut is still on.
 */
export async function changeMpin(currentPin: string, newPin: string, biometricPrompt: string): Promise<{ shortcutKept: boolean }> {
  await api.changeMpin(currentPin, newPin);
  await setDevicePin(newPin);
  await resetPinAttempts();
  void refreshMpinStatus();
  const shortcutKept = await refreshMpinShortcut(newPin, biometricPrompt);
  return { shortcutKept };
}

// devices (plan 06)
/**
 * Forgot your MPIN: sets a new one with a `mpin_reset` code's token (POST /mpin/reset, or Practice),
 * which also ends any lock. Then the unlock PIN and the biometric copy follow, as for a change.
 * Throws the server's answer (readMpinError reads `mpin_weak`; readDeviceError `device_untrusted`).
 */
export async function resetMpin(verificationToken: string, newPin: string, biometricPrompt: string): Promise<{ shortcutKept: boolean }> {
  await api.resetMpin(verificationToken, newPin);
  await setDevicePin(newPin);
  await resetPinAttempts();
  void refreshMpinStatus();
  const shortcutKept = await refreshMpinShortcut(newPin, biometricPrompt);
  return { shortcutKept };
}
