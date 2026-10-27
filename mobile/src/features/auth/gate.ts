import { useEffect } from "react";
import { clearDraft } from "@/features/account/onboarding/draft";
import { ApiError } from "@/lib/api/errors";
import { queryClient, useConnection } from "@/lib/api/hooks";
import { initAuth, onUserChange, signOutNow, useAuthState } from "@/lib/auth/firebase";
import { resetDevice } from "@/lib/session";
import { SIGN_IN_ENABLED } from "./config";

/**
 * Starts the sign-in session (call once at launch, before the connection check, so a server that
 * wants sign-in counts as reachable). When the signed-in person changes, every cached answer of
 * the last person is dropped and what's on screen is fetched again. A sign-out from anywhere
 * (including Firebase ending the session by itself) also clears what this phone kept for the
 * account. Returns the cleanup.
 */
export function startAuth() {
  initAuth({ enabled: SIGN_IN_ENABLED });
  return onUserChange((user) => {
    clearDraft();
    if (!user) void resetDevice();
    void queryClient.resetQueries();
  });
}

/**
 * The root gate's view of sign-in. `required` only in live mode with sign-in on: Practice and the
 * prototype server never ask anyone to sign in.
 */
export function useSignInGate() {
  const a = useAuthState();
  const { mode } = useConnection();
  const required = a.enabled && mode === "live";
  return {
    required,
    /** The saved session is known (always, when sign-in isn't required). */
    ready: !required || a.ready,
    signedOut: required && a.ready && !a.user,
    user: a.user,
    since: a.since,
  };
}

export type SignInGate = ReturnType<typeof useSignInGate>;

/**
 * Signs out on this phone: everything the app keeps for the account goes (PIN, app lock, consents,
 * support cases), the device settings stay, then Firebase forgets the login.
 */
export async function signOutOfVaultwise(notice: string | null = null) {
  await resetDevice();
  await signOutNow(notice);
}

/**
 * The server stopped accepting this sign-in (it says "signed_out" to /me after the sign-in was
 * sent): the login was closed, turned off or belongs to another project. Signs out with a note,
 * rather than leaving an app where nothing loads.
 */
export function useServerSignOut(gate: SignInGate, me: { error: unknown; errorUpdatedAt: number }) {
  const rejected =
    gate.required && !!gate.user && me.error instanceof ApiError && me.error.code === "signed_out" && me.errorUpdatedAt >= gate.since;
  useEffect(() => {
    if (rejected) void signOutOfVaultwise("Your sign-in ended. Sign in again to carry on.");
  }, [rejected]);
}
