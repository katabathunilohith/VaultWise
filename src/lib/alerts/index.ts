/**
 * Alerts: a record of every security-relevant event (new device, money out, limit raised, MPIN
 * locked or changed, phone verified), shown in the app and pushed to the person's phones.
 * See README.md for the switches (ALERTS_PUSH, EXPO_ACCESS_TOKEN) and every touch point outside this
 * folder (marked `// alerts`).
 */
export { pushEnabled, EXPO_PUSH_URL } from "./config";
export {
  ALERT_KINDS,
  type Alert,
  type AlertKind,
  type PushPlatform,
  type PushToken,
  listAlerts,
  unreadCount,
  markRead,
  alertView,
  pushTokensFor,
  removePushTokensForDevice,
} from "./store";
export { raiseAlert } from "./raise";
export { type AlertSender, inAppSender, expoPushSender, alertSenders, setAlertSenders } from "./senders";
export { isExpoPushToken, registerPushToken, unregisterPushToken } from "./push";
export {
  durationText,
  deviceLabel,
  alertMoneyOut,
  alertEmergency,
  alertLimitLoosened,
  alertMpinLocked,
  alertMpinChanged,
  alertPhoneVerified,
  alertNewDevice,
  alertDeviceTrusted,
  alertDeviceRevoked,
} from "./messages";
