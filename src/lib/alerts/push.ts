import { HttpError } from "../users";
import { removePushToken, savePushToken, type PushPlatform } from "./store";

/** Expo push tokens look like `ExponentPushToken[xxxxxxxx]` (older SDKs) or `ExpoPushToken[xxxxxxxx]`. */
const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export function isExpoPushToken(token: string): boolean {
  return EXPO_TOKEN.test(token);
}

/**
 * Registers the calling phone's Expo push token for this person. `deviceId` is the calling device's
 * row id (from lib/devices) so signing that device out also stops its notifications.
 */
export function registerPushToken(userId: string, input: { token: string; platform: PushPlatform; deviceId: string | null }, now = Date.now()) {
  const token = input.token.trim();
  if (!isExpoPushToken(token)) throw new HttpError(400, "That isn't an Expo push token.", "push_token_invalid");
  savePushToken({ token, userId, platform: input.platform, deviceId: input.deviceId }, now);
}

/** The phone signed out: stop sending this person's notifications to it. */
export function unregisterPushToken(userId: string, token: string) {
  removePushToken(token.trim(), userId);
}
