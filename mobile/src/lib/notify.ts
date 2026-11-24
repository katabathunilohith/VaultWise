import { Platform } from "react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import type * as NotificationsModule from "expo-notifications";

/**
 * Phone notifications (plan 06). Features use this file, never expo-notifications itself, so the
 * package can be swapped. Nothing here throws: a refused permission, no Firebase (FCM) credentials,
 * Expo Go, the web or a build without the package all come back as `null` or `false`.
 *
 * Remote push on Android needs FCM credentials, which plan 06 sets up. Until then
 * `registerForPushNotifications()` gets the permission but returns null.
 */
type Notifications = typeof NotificationsModule;

/** Must match `defaultChannel` of the expo-notifications plugin in app.json. */
const CHANNEL_ID = "default";

let mod: Notifications | null | undefined;
function notifications(): Notifications | null {
  if (mod !== undefined) return mod;
  mod = null;
  // Expo Go dropped expo-notifications' native side, and the web has no local notifications.
  if (Platform.OS === "web" || isRunningInExpoGo()) return mod;
  try {
    const n = require("expo-notifications") as Notifications;
    // Show notifications while the app is open too. Android only drops the banner down with sound on.
    n.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    mod = n;
  } catch {
    mod = null;
  }
  return mod;
}

/** Android 13+ shows the permission prompt only once a channel exists, and pushes without a channel land here. */
async function ensureChannel(n: Notifications) {
  if (Platform.OS !== "android") return;
  await n.setNotificationChannelAsync(CHANNEL_ID, { name: "Alerts", importance: n.AndroidImportance.HIGH });
}

function allowed(n: Notifications, p: NotificationsModule.NotificationPermissionsStatus) {
  return p.granted || p.ios?.status === n.IosAuthorizationStatus.PROVISIONAL;
}

/**
 * Asks for permission (if it hasn't been refused for good) and returns this phone's Expo push token,
 * or null when there's no permission, no push credentials or no network.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const n = notifications();
  if (!n) return null;
  try {
    await ensureChannel(n);
    let permission = await n.getPermissionsAsync();
    if (!allowed(n, permission) && permission.canAskAgain) permission = await n.requestPermissionsAsync();
    if (!allowed(n, permission)) return null;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    if (!projectId) return null;
    const token = await n.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch {
    // No FCM credentials yet, offline, or the OS refused.
    return null;
  }
}

/**
 * Shows a notification now, if notifications are allowed. It never asks for permission
 * (`registerForPushNotifications()` does). Returns whether it was shown.
 */
export async function showLocalNotification(title: string, body: string): Promise<boolean> {
  const n = notifications();
  if (!n) return false;
  try {
    await ensureChannel(n);
    if (!allowed(n, await n.getPermissionsAsync())) return false;
    await n.scheduleNotificationAsync({ content: { title, body }, trigger: Platform.OS === "android" ? { channelId: CHANNEL_ID } : null });
    return true;
  } catch {
    return false;
  }
}
