/**
 * The alerts module's switches, read on every call so a test (or a restart with new env) can flip them.
 *
 *   ALERTS_PUSH        unset or anything but "false" → alerts also go out as Expo push notifications to
 *                      the person's registered push tokens. "false" → in-app alerts only.
 *   EXPO_ACCESS_TOKEN  optional: sent as a Bearer token when the Expo project has "enhanced push security" on.
 *
 * In-app alerts (the `alerts` table) are always on: they are the record the phone's inbox reads.
 */
export function pushEnabled(): boolean {
  return process.env.ALERTS_PUSH?.trim().toLowerCase() !== "false";
}

export function expoAccessToken(): string | null {
  const t = process.env.EXPO_ACCESS_TOKEN?.trim();
  return t ? t : null;
}

/** Expo's push API (https://docs.expo.dev/push-notifications/sending-notifications/). */
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** At most this many push tokens are kept per person (the newest win). */
export const MAX_PUSH_TOKENS_PER_USER = 10;

/** How long a push request may take before it is given up (the alert stays in the app). */
export const PUSH_TIMEOUT_MS = 10_000;
