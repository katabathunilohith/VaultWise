import { useEffect } from "react";
import { signOutOfVaultwise } from "@/features/auth";
import { clearDeviceRevoked, forgetInstallId, onDeviceRevoked } from "@/lib/api/device";
import { queryClient } from "@/lib/api/hooks";
import { getAuthState } from "@/lib/auth/firebase";
import { DEVICES_ENABLED } from "./config";

let signingOut = false;
/** When the install id was last dropped for a server without sign-in, so a server that keeps refusing can't churn ids. */
let forgotAt = 0;
const FORGET_AGAIN_MS = 60_000;

/**
 * When the server answers 401 `device_revoked` (another device signed this one out), sign out of
 * Vaultwise on this phone, with a note on the sign-in screen. Mounted on Home's header, which stays
 * mounted while the app is open; a revocation seen before it mounts (say behind the unlock screen)
 * is handled as soon as it does.
 *
 * A server without sign-in has nobody to sign out, and its refusal of this install's id is for good,
 * so only the id goes (forgetInstallId): the next request comes from a new device and the app works
 * again. Without that, the phone could never recover (even Delete account is refused).
 */
export function useDeviceWatch() {
  useEffect(() => {
    if (!DEVICES_ENABLED) return undefined;
    return onDeviceRevoked(() => {
      const auth = getAuthState();
      if (!auth.enabled) {
        clearDeviceRevoked();
        if (Date.now() - forgotAt < FORGET_AGAIN_MS) return;
        forgotAt = Date.now();
        void forgetInstallId().then(() => queryClient.invalidateQueries());
        return;
      }
      if (!auth.user || signingOut) return;
      signingOut = true;
      // Its id stays refused on the server, so the next sign-in needs a new one (forgetDevice).
      void signOutOfVaultwise("This phone was signed out of Vaultwise from another device. Sign in again to use it here.", {
        forgetDevice: true,
      }).finally(() => {
        signingOut = false;
        clearDeviceRevoked();
      });
    });
  }, []);
}
