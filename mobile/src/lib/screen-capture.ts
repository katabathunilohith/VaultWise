import { useEffect } from "react";
import { Platform } from "react-native";
import type * as ScreenCaptureModule from "expo-screen-capture";

/**
 * Screenshot and screen-recording blocking for sensitive screens (plan 04). Features use this file,
 * never expo-screen-capture itself, so the package can be swapped.
 *
 * - Android: sets FLAG_SECURE, which also blanks the app's preview in the recent-apps switcher.
 * - iOS: blocks screenshots and recordings, and blurs the app-switcher preview.
 * - Web, or a development build made before the package was added: does nothing.
 *
 * Each caller holds a key; capture comes back only when every key is released.
 */
type ScreenCapture = typeof ScreenCaptureModule;

let mod: ScreenCapture | null | undefined;
function screenCapture(): ScreenCapture | null {
  if (mod !== undefined) return mod;
  mod = null;
  if (Platform.OS === "web") return mod;
  try {
    // Loaded on first use: the import throws when the native module isn't in the build.
    mod = require("expo-screen-capture") as ScreenCapture;
  } catch {
    mod = null;
  }
  return mod;
}

const held = new Set<string>();
/** protection: the iOS app-switcher blur stays on all the time (features/protection PrivacyCover). */
let coverAlways = false;

/** Blocks screenshots and recordings until `allowScreenCapture(key)` (or the app restarts). */
export async function preventScreenCapture(key = "default"): Promise<void> {
  const sc = screenCapture();
  if (!sc) return;
  const first = held.size === 0;
  held.add(key);
  try {
    await sc.preventScreenCaptureAsync(key);
    // Android needs nothing more: FLAG_SECURE already hides the switcher preview.
    if (first && !coverAlways && Platform.OS === "ios") await sc.enableAppSwitcherProtectionAsync();
  } catch {
    // Not supported on this device or OS version.
  }
}

/** Releases `key`. Capture is allowed again once no key is held. */
export async function allowScreenCapture(key = "default"): Promise<void> {
  const sc = screenCapture();
  if (!sc || !held.delete(key)) return;
  try {
    await sc.allowScreenCaptureAsync(key);
    if (held.size === 0 && !coverAlways && Platform.OS === "ios") await sc.disableAppSwitcherProtectionAsync();
  } catch {
    // Not supported on this device or OS version.
  }
}

/**
 * protection: keeps the iOS app-switcher blur on whenever the app isn't active, on every screen,
 * not only while a sensitive screen holds a key. Resolves false where it can't (Android, the web,
 * or a build without the package), so the caller can cover the app itself.
 */
export async function coverAppSwitcher(on: boolean, blurIntensity?: number): Promise<boolean> {
  const sc = screenCapture();
  if (!sc || Platform.OS !== "ios") return false;
  coverAlways = on;
  try {
    if (on) await sc.enableAppSwitcherProtectionAsync(blurIntensity);
    else if (held.size === 0) await sc.disableAppSwitcherProtectionAsync();
    return true;
  } catch {
    coverAlways = false;
    return false;
  }
}

let nextKey = 0;

/** Blocks screenshots and recordings while the calling screen is mounted and `active` is true. */
export function useSensitiveScreen(active = true): void {
  useEffect(() => {
    if (!active) return;
    const key = `screen-${++nextKey}`;
    void preventScreenCapture(key);
    return () => void allowScreenCapture(key);
  }, [active]);
}
