import { useEffect } from "react";
import { clearDraft } from "@/features/account/onboarding/draft";
import { getConnection } from "@/lib/api/connection";
import { ApiError } from "@/lib/api/errors";
import { queryClient, useConnection } from "@/lib/api/hooks";
import { onSignedOut } from "@/lib/api/signed-out";
import { getAuthState, initAuth, onUserChange, signOutNow, useAuthState } from "@/lib/auth/firebase";
import { resetDevice } from "@/lib/session";
import { SIGN_IN_ENABLED } from "./config";

/**
 * Starts the sign-in session (call once at launch, before the connection check, so a server that
 * wants sign-in counts as reachable). When the signed-in person changes, every cached answer of
 * the last person is dropped and what's on screen is fetched again. A sign-out from anywhere
 * (including Firebase ending the session by itself) also clears what this phone kept for the
 * account. A 401 `signed_out` on any request signs out with the server's words (see
 * endSignIn below). Returns the cleanup.
 */
export function startAuth() {
  initAuth({ enabled: SIGN_IN_ENABLED });
  const stopUserChange = onUserChange((user) => {
    clearDraft();
    // signOutOfVaultwise() clears the phone itself, with its own options (forgetDevice), right
    // after Firebase lets go; a second wipe here could interleave with it. This one covers the
    // other sign-outs (Firebase ending the session by itself).
    if (!user && ownWipes === 0) void resetDevice();
    void queryClient.resetQueries();
  });
  // identity, devices: any request, not only /me. Live with someone signed in, and only for a request
  // sent since this sign-in (an older one's answer says nothing about it).
  const stopSignedOut = onSignedOut((note) => {
    const a = getAuthState();
    if (!a.enabled || !a.user || getConnection().mode !== "live" || note.sentAt < a.since) return;
    void endSignIn(note.message);
  });
  return () => {
    stopUserChange();
    stopSignedOut();
  };
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

/* ---------- before sign-out ---------- */

const beforeSignOut = new Set<() => Promise<unknown>>();
/** The longest a sign-out waits for its before-sign-out steps (say, offline). */
const BEFORE_SIGN_OUT_MS = 3000;

/**
 * Runs `fn` at the start of every signOutOfVaultwise(), while the login still works (e.g. alerts
 * unregistering this phone's push token). Failures are ignored and the wait is capped, so a step can
 * never stop anyone signing out. Returns the unsubscribe.
 */
export function onBeforeSignOut(fn: () => Promise<unknown>): () => void {
  beforeSignOut.add(fn);
  return () => {
    beforeSignOut.delete(fn);
  };
}

async function runBeforeSignOut() {
  const steps = Promise.all([...beforeSignOut].map((fn) => fn().catch(() => undefined)));
  await Promise.race([steps, new Promise((resolve) => setTimeout(resolve, BEFORE_SIGN_OUT_MS))]);
}

/** Sign-outs under way that clear the phone themselves once Firebase has let go (see startAuth). */
let ownWipes = 0;

/**
 * Signs out on this phone: the before-sign-out steps run (while the login still works), Firebase
 * forgets the login, then everything the app keeps for the account goes (PIN, app lock, consents,
 * support cases) and the device settings stay. `forgetDevice` also drops this install's id (see
 * resetDevice in lib/session.ts).
 *
 * Firebase goes first: until the login is gone the phone keeps its PIN, lock and install id, so a
 * live account is never on screen unlocked, and no request goes out signed in with a new install id
 * (the server would register a phantom device and alert the owner). If Firebase can't sign out, the
 * phone isn't cleared and the error is thrown.
 */
export async function signOutOfVaultwise(notice: string | null = null, { forgetDevice = false }: { forgetDevice?: boolean } = {}) {
  await runBeforeSignOut();
  ownWipes++;
  try {
    await signOutNow(notice);
    await resetDevice({ forgetDevice });
  } finally {
    ownWipes--;
  }
}

const SIGN_IN_ENDED = "Your sign-in ended. Sign in again to carry on.";
let ending: Promise<void> | null = null;

/**
 * The server stopped accepting this sign-in (401 `signed_out`): the login was closed, turned off or
 * belongs to another project, or (devices) a device was signed out of the account since this sign-in
 * and this phone isn't trusted, which refreshing the token can't fix. Signs out once, with the
 * server's words on the sign-in screen ("A device was signed out of your account since you signed in
 * here. Sign in again to continue."), rather than leaving an app where nothing loads.
 */
function endSignIn(message: string | null) {
  ending ??= signOutOfVaultwise(message?.trim() || SIGN_IN_ENDED)
    .catch(() => undefined)
    .finally(() => {
      ending = null;
    });
  return ending;
}

/**
 * The same for /me as the root gate sees it (http.ts already reports every `signed_out`, /me's too;
 * this only backs it up). An answer to a request from before this sign-in is ignored.
 */
export function useServerSignOut(gate: SignInGate, me: { error: unknown; errorUpdatedAt: number }) {
  const rejected =
    gate.required && !!gate.user && me.error instanceof ApiError && me.error.code === "signed_out" && me.errorUpdatedAt >= gate.since;
  const message = rejected && me.error instanceof Error ? me.error.message : null;
  useEffect(() => {
    if (rejected) void endSignIn(message);
  }, [rejected, message]);
}
