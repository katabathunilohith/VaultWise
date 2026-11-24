import { Platform } from "react-native";
import type * as DeviceModule from "expo-device";

/**
 * Root and jailbreak check (plan 04). Features use this file, never expo-device itself, so a stronger
 * check (for example Play Integrity) can replace it later.
 *
 * It uses expo-device's `isRootedExperimentalAsync()`: on Android it looks for an `su` binary, on iOS
 * for common jailbreak files. It's a hint, not proof: rooting tools can hide from it, a few unrooted
 * phones carry `su`, and Android emulators usually report rooted.
 */
export interface DeviceIntegrity {
  /** null when it can't be told: the web, or the check failed. */
  rooted: boolean | null;
}

type Device = typeof DeviceModule;

function device(): Device | null {
  if (Platform.OS === "web") return null; // expo-device always says "not rooted" on the web.
  try {
    return require("expo-device") as Device;
  } catch {
    return null;
  }
}

let result: Promise<DeviceIntegrity> | null = null;

/** Checked once per launch; later calls reuse the answer. */
export function checkDeviceIntegrity(): Promise<DeviceIntegrity> {
  result ??= (async () => {
    const d = device();
    if (!d) return { rooted: null };
    try {
      return { rooted: await d.isRootedExperimentalAsync() };
    } catch {
      // ERR_DEVICE_ROOT_DETECTION: some system files couldn't be read.
      return { rooted: null };
    }
  })();
  return result;
}
