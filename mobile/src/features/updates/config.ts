import { isRunningInExpoGo } from "expo";
import * as Updates from "expo-updates";
import { Platform } from "react-native";

/**
 * The switch for the "A new version is ready" banner and the foreground update checks. Off, the app
 * still checks once at launch and applies a downloaded update on the next cold start (expo-updates'
 * own behaviour); it just never offers a restart.
 */
export const UPDATES_PROMPT_ENABLED = true;

/** Checks on returning to the app happen at most this often. Expo rate-limits checks, and each one uses data. */
export const CHECK_EVERY_MS = 30 * 60 * 1000;

function updatesUsable(): boolean {
  // The web has no over-the-air updates, and development builds load code from the dev server.
  if (!UPDATES_PROMPT_ENABLED || Platform.OS === "web" || __DEV__) return false;
  try {
    // Expo Go runs any project's code, so it has no updates of its own.
    return !isRunningInExpoGo() && Updates.isEnabled;
  } catch {
    return false;
  }
}

/** True only in a release build with updates set up (the APK and store builds). Fixed for the session. */
export const UPDATES_ACTIVE = updatesUsable();
