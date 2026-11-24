import { useEffect } from "react";
import { api } from "@/lib/api/client";
import { installId } from "@/lib/api/device";
import { useConnection, useMe } from "@/lib/api/hooks";
import { isPracticeMode } from "@/lib/api/practice";
import { registerForPushNotifications } from "@/lib/notify";
import { onDeviceReset } from "@/lib/storage";
import { onBeforeSignOut } from "@/features/auth";
import { ALERTS_ENABLED } from "./config";

/** This phone's token and who it was registered for (server address + user), for this run of the app. */
let registered: { key: string; token: string; deviceId: string } | null = null;
let trying: string | null = null;

/**
 * Push (plan 06): once someone is in the app on live data, ask for notification permission (if it
 * hasn't been refused for good), get this phone's Expo push token (lib/notify.ts) and send it to
 * POST /push/register. Never blocks anything and never throws: no permission, no FCM credentials,
 * Expo Go or the web just mean no token, and it's tried again next time the app starts.
 * Practice never asks and never registers.
 */
export function usePushRegistration() {
  const { mode, baseUrl } = useConnection();
  const me = useMe();
  const userId = me.data?.onboarded ? me.data.user.id : null;
  const key = ALERTS_ENABLED && mode === "live" && userId ? `${baseUrl}|${userId}` : null;
  useEffect(() => {
    if (!key || registered?.key === key || trying === key) return;
    trying = key;
    void (async () => {
      try {
        const token = await registerForPushNotifications();
        if (!token) return;
        const deviceId = await installId();
        await api.registerPush(token);
        registered = { key, token, deviceId };
      } catch {
        // A refused token or no network: next launch tries again.
      } finally {
        if (trying === key) trying = null;
      }
    })();
  }, [key]);
}

/**
 * Sign-out (and Delete account, which signs out): stop pushes to this phone with DELETE /push/register,
 * while the login still works. signOutOfVaultwise() waits for it (capped at a few seconds). Best effort;
 * the server also drops tokens Expo reports as gone, and a remote sign-out has already removed them.
 */
onBeforeSignOut(async () => {
  const r = registered;
  registered = null;
  if (r && !isPracticeMode()) await api.unregisterPush(r.token, r.deviceId);
});

/** Any other wipe (Firebase ending the session by itself, Practice resets): forget the registration. */
onDeviceReset(() => {
  registered = null;
});
