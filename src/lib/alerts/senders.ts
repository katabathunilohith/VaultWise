import { EXPO_PUSH_URL, expoAccessToken, pushEnabled, PUSH_TIMEOUT_MS } from "./config";
import { hasPushTokens, insertAlert, pushTokensFor, removePushToken, type Alert } from "./store";

/**
 * A channel an alert goes out on. Open/closed: a new channel (email, SMS) is a new sender added to
 * the list below; `raiseAlert()` never changes.
 *
 * - `when: "now"` senders run inside `raiseAlert()`, synchronously, so their write commits or rolls
 *   back with the caller's transaction (the in-app table).
 * - `when: "later"` senders run after the caller's work has finished, and only if the alert row
 *   still exists (a money move that rolled back sends nothing). `accepts()` is asked first, inside
 *   `raiseAlert()`, so no work is scheduled for people the channel can't reach.
 *
 * A sender must never throw: a failure is logged and the alert stays in the app.
 */
export interface AlertSender {
  readonly name: string;
  readonly when: "now" | "later";
  accepts?(alert: Alert): boolean;
  send(alert: Alert): void | Promise<void>;
}

/** The in-app inbox: the `alerts` table. Always on. */
export const inAppSender: AlertSender = {
  name: "in_app",
  when: "now",
  send: (alert) => insertAlert(alert),
};

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

/**
 * Expo push: one POST to Expo's push API with a message per registered token
 * (https://docs.expo.dev/push-notifications/sending-notifications/). Tokens Expo reports as
 * `DeviceNotRegistered` (the app was uninstalled) are removed. Never throws.
 */
export const expoPushSender: AlertSender = {
  name: "expo_push",
  when: "later",
  accepts: (alert) => pushEnabled() && hasPushTokens(alert.userId),
  async send(alert) {
    const tokens = pushTokensFor(alert.userId);
    if (!tokens.length) return;
    const messages = tokens.map((t) => ({
      to: t.token,
      title: alert.title,
      body: alert.body,
      sound: "default",
      data: { alertId: alert.id, kind: alert.kind },
    }));
    try {
      const access = expoAccessToken();
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
          "content-type": "application/json",
          ...(access ? { authorization: `Bearer ${access}` } : {}),
        },
        body: JSON.stringify(messages),
        signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[alerts] Expo push refused (${res.status}) for alert ${alert.id}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
        return;
      }
      const out = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
      (out?.data ?? []).forEach((ticket, i) => {
        if (ticket?.status !== "error") return;
        console.warn(`[alerts] Expo push ticket error for alert ${alert.id}: ${ticket.details?.error ?? ""} ${ticket.message ?? ""}`.trim());
        if (ticket.details?.error === "DeviceNotRegistered" && tokens[i]) removePushToken(tokens[i].token, alert.userId);
      });
    } catch (e) {
      console.warn(`[alerts] Expo push failed for alert ${alert.id}: ${(e as Error)?.message ?? e}`);
    }
  },
};

const DEFAULT_SENDERS: readonly AlertSender[] = [inAppSender, expoPushSender];
let senders: readonly AlertSender[] = DEFAULT_SENDERS;

export function alertSenders(): readonly AlertSender[] {
  return senders;
}

/** Replaces the channels (tests, or a server adding email). `null` restores the default: in-app and Expo push. */
export function setAlertSenders(next: readonly AlertSender[] | null) {
  senders = next ?? DEFAULT_SENDERS;
}
