import { Platform } from "react-native";
import * as Updates from "expo-updates";

/**
 * Which build this is. The store build (eas.json `production`) and the shareable APK (`apk`) are Practice only:
 * the app always runs on Practice data on the phone, with no server address to type, and sign-in,
 * "Verify your ID" and account recovery are off. Apple (5.1.1(ix), 3.2.1(viii)) and Google Play only
 * accept real-money finance apps, and apps that collect ID documents, from a licensed company.
 * Development and preview builds leave it off and work exactly as before.
 *
 * Two signals, so neither alone can switch it off: EXPO_PUBLIC_PRACTICE_ONLY=1 at bundle time, and the build's
 * update channel at run time. The channel matters because an over-the-air update is bundled on a computer,
 * where the build profile's env doesn't apply.
 *
 * Live (not Practice) profiles: `development`, `preview`, and `tester-live` (plan 05: an internal Android APK on
 * channel `tester-live` that talks to the online server at EXPO_PUBLIC_API_URL, with sign-in). Keep those
 * channels out of this list.
 */
const PRACTICE_CHANNELS = ["apk", "production"];

function updateChannel(): string | null {
  if (Platform.OS === "web") return null;
  try {
    return Updates.channel ?? null;
  } catch {
    return null;
  }
}

export const PRACTICE_ONLY = process.env.EXPO_PUBLIC_PRACTICE_ONLY === "1" || PRACTICE_CHANNELS.includes(updateChannel() ?? "");

/**
 * The online tester build (`tester-live`): live data and sign-in, but no ID check, so testers never upload
 * real IDs to a student project. Like PRACTICE_ONLY, it's read from the update channel at run time.
 */
export const TESTER_LIVE = updateChannel() === "tester-live";
