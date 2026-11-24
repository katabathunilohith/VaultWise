import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { subscribeConnection } from "@/lib/api/connection";
import { isPracticeMode } from "@/lib/api/practice";
import { withSystemUi } from "@/lib/auth/app-lock";
import { authenticateBiometric } from "@/lib/auth/biometrics";
import { getItem, onDeviceReset, removeItem, setItem } from "@/lib/storage";

/**
 * "Use Face ID / fingerprint for payments". The MPIN itself is kept in the Keychain (iOS) or
 * Keystore (Android) with `requireAuthentication: true`, so the phone hands it back only after a
 * biometric check, and the server still checks it like a typed one. A biometric never stands in
 * for the MPIN on its own.
 *
 * Enrolling a new fingerprint or face invalidates the stored copy (iOS `biometryCurrentSet`,
 * Android key invalidation); reading it then gives null, the shortcut turns off and the person
 * types the MPIN.
 *
 * Live only. The copy holds the live MPIN, so Practice never offers it, saves it or reads it: the
 * simulator would refuse it as a wrong MPIN (and the live copy would be dropped), and a copy saved
 * in Practice would cost a real wrong try live. In Practice the shortcut reads as off and the
 * saved copy stays for live.
 */

/** "1" while the shortcut is on. Not secret: it only says whether to offer the biometric key. */
const FLAG_KEY = "vw.mpin.biometric";
/** The MPIN's own entry, in its own keychain service so it never mixes with the plain `vw.*` keys. */
const ITEM = "mpin";
const SERVICE = "vw.mpin.biometric";

let on = false;
let loaded: Promise<boolean> | null = null;
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (on === next) return;
  on = next;
  for (const l of listeners) l();
}

function load() {
  loaded ??= getItem(FLAG_KEY).then((v) => {
    set(v === "1" && Platform.OS !== "web");
    return on;
  });
  return loaded;
}

function subscribe(l: () => void) {
  listeners.add(l);
  const stopWatchingMode = subscribeConnection(l);
  void load();
  return () => {
    listeners.delete(l);
    stopWatchingMode();
  };
}

/** On, and the app is on live data (never in Practice). */
const usable = () => on && !isPracticeMode();

/** Whether payments can be approved with Face ID / fingerprint on this phone (always false in Practice). */
export function useMpinShortcut() {
  return useSyncExternalStore(subscribe, usable, usable);
}

/** The same, outside React. */
export async function mpinShortcutOn() {
  return (await load()) && !isPracticeMode();
}

/** Turns the shortcut on with an MPIN the caller has just checked. False if the phone refused or the person cancelled. */
export async function turnOnMpinShortcut(pin: string, prompt: string): Promise<boolean> {
  if (Platform.OS === "web" || isPracticeMode() || !SecureStore.canUseBiometricAuthentication()) return false;
  // iOS doesn't prompt when a protected value is first written, so confirm it's them first.
  // Android prompts for the write itself.
  if (Platform.OS === "ios" && !(await authenticateBiometric(prompt))) return false;
  try {
    // A fresh entry: updating an existing protected one would prompt again on iOS.
    await SecureStore.deleteItemAsync(ITEM, { keychainService: SERVICE }).catch(() => undefined);
    await withSystemUi(() => SecureStore.setItemAsync(ITEM, pin, { requireAuthentication: true, authenticationPrompt: prompt, keychainService: SERVICE }));
  } catch {
    return false;
  }
  await setItem(FLAG_KEY, "1");
  set(true);
  return true;
}

export async function turnOffMpinShortcut() {
  set(false);
  await removeItem(FLAG_KEY);
  if (Platform.OS !== "web") await SecureStore.deleteItemAsync(ITEM, { keychainService: SERVICE }).catch(() => undefined);
}

export type BiometricMpin = { kind: "pin"; pin: string } | { kind: "invalidated" } | { kind: "cancelled" };

/**
 * Asks for Face ID / fingerprint and hands back the stored MPIN. `invalidated` when the phone's
 * biometrics changed (or the copy is gone): the shortcut is off from then on.
 */
export async function mpinFromBiometric(prompt: string): Promise<BiometricMpin> {
  // Practice never reads the live copy (nothing offers it there).
  if (isPracticeMode()) return { kind: "cancelled" };
  if (!(await load())) return { kind: "invalidated" };
  try {
    const pin = await withSystemUi(() =>
      SecureStore.getItemAsync(ITEM, { requireAuthentication: true, authenticationPrompt: prompt, keychainService: SERVICE }),
    );
    if (pin) return { kind: "pin", pin };
    await turnOffMpinShortcut();
    return { kind: "invalidated" };
  } catch {
    // Cancelled, locked out or timed out: the pad is still there.
    return { kind: "cancelled" };
  }
}

/**
 * After the MPIN changes: keeps the shortcut with the new MPIN (Android asks for the fingerprint
 * to save it). Returns false when it had to be turned off.
 */
export async function refreshMpinShortcut(pin: string, prompt: string): Promise<boolean> {
  // A Practice MPIN change leaves the live MPIN, and so the live copy, as they are.
  if (isPracticeMode() || !(await load())) return true;
  if (await turnOnMpinShortcut(pin, prompt)) return true;
  await turnOffMpinShortcut();
  return false;
}

// Delete account and sign-out: the stored MPIN goes with the rest of the account's data.
onDeviceReset(() => {
  set(false);
  loaded = Promise.resolve(false);
  if (Platform.OS !== "web") void SecureStore.deleteItemAsync(ITEM, { keychainService: SERVICE }).catch(() => undefined);
});
