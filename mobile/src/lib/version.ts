import Constants from "expo-constants";
import { Platform } from "react-native";
import * as Updates from "expo-updates";

/** What's running, for bug reports: the version, the build's update channel, and the over-the-air update if any. */
export interface AppVersion {
  version: string;
  channel: string | null;
  /** First 8 characters of the running update's ID; null when the build's own code is running. */
  update: string | null;
  updatedAt: Date | null;
}

export function appVersion(): AppVersion {
  const version = Constants.expoConfig?.version ?? "unknown";
  if (Platform.OS === "web") return { version, channel: "web", update: null, updatedAt: null };
  try {
    const embedded = Updates.isEmbeddedLaunch;
    return {
      version,
      channel: Updates.channel ?? null,
      update: !embedded && Updates.updateId ? Updates.updateId.slice(0, 8) : null,
      updatedAt: !embedded ? (Updates.createdAt ?? null) : null,
    };
  } catch {
    // Expo Go and development builds have no update information.
    return { version, channel: null, update: null, updatedAt: null };
  }
}

/** One line, like "0.2.0 · apk · update 3f2a9c1b (22 Nov)". */
export function versionLine(v: AppVersion = appVersion()) {
  const parts = [v.version];
  if (v.channel) parts.push(v.channel);
  if (v.update) {
    const when = v.updatedAt ? ` (${v.updatedAt.toLocaleDateString(undefined, { day: "numeric", month: "short" })})` : "";
    parts.push(`update ${v.update}${when}`);
  }
  return parts.join(" · ");
}
