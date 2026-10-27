"use client";

/**
 * identity: the signed-in session (Firebase, loaded lazily) and the hooks src/lib/client.ts calls.
 * This file must not import src/lib/client.ts, because client.ts imports it.
 */
import { useSyncExternalStore } from "react";
import type { Auth } from "firebase/auth";
import { FIREBASE_CONFIG, SIGN_IN_ON } from "./config";

export type Session =
  | { status: "off" }
  | { status: "loading" }
  | { status: "signed_out" }
  | { status: "signed_in"; uid: string; email: string | null; emailVerified: boolean }
  | { status: "unavailable"; message: string };

const OFF: Session = { status: "off" };
const LOADING: Session = { status: "loading" };
const SIGNED_OUT: Session = { status: "signed_out" };

let current: Session = SIGN_IN_ON ? LOADING : OFF;
const sessionListeners = new Set<() => void>();

function setSession(next: Session) {
  const same =
    next.status === current.status &&
    (next.status !== "signed_in" ||
      (current.status === "signed_in" && current.uid === next.uid && current.email === next.email && current.emailVerified === next.emailVerified));
  if (same) return;
  current = next;
  for (const l of sessionListeners) l();
}

let authPromise: Promise<Auth> | null = null;

/** Loads Firebase only when sign-in is on, and only once. */
function loadAuth(): Promise<Auth> {
  if (!SIGN_IN_ON) return Promise.reject(new Error("Sign-in is off"));
  authPromise ??= (async () => {
    const [{ getApps, initializeApp }, { getAuth, onAuthStateChanged }] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
    const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
    const auth = getAuth(app);
    onAuthStateChanged(auth, (u) => setSession(u ? { status: "signed_in", uid: u.uid, email: u.email, emailVerified: u.emailVerified } : SIGNED_OUT));
    return auth;
  })().catch((e: unknown) => {
    authPromise = null;
    setSession({ status: "unavailable", message: e instanceof Error ? e.message : "Sign-in couldn't start" });
    throw e;
  });
  return authPromise;
}

function subscribeSession(cb: () => void) {
  sessionListeners.add(cb);
  if (SIGN_IN_ON) loadAuth().catch(() => {});
  return () => {
    sessionListeners.delete(cb);
  };
}

/** Who is signed in. Always `{ status: "off" }` when sign-in isn't configured. */
export function useSession(): Session {
  return useSyncExternalStore(
    subscribeSession,
    () => current,
    () => (SIGN_IN_ON ? LOADING : OFF),
  );
}

/**
 * Adds `Authorization: Bearer <idToken>` when someone is signed in. Returns `init` untouched when sign-in is off,
 * when Firebase couldn't load (the gate shows that), or when nobody is signed in.
 * If someone IS signed in but the token can't be had (offline, a refresh blip), this throws, so the request
 * fails like a network error instead of going out unsigned and looking like a sign-out.
 */
export async function withIdentity(init: RequestInit): Promise<RequestInit> {
  if (!SIGN_IN_ON) return init;
  let user: Auth["currentUser"] = null;
  try {
    const auth = await loadAuth();
    await auth.authStateReady();
    user = auth.currentUser;
  } catch {
    return init;
  }
  if (!user) return init;
  let token: string;
  try {
    token = await user.getIdToken();
  } catch {
    throw new Error("We couldn't confirm your sign-in. Check your connection and try again.");
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return { ...init, headers };
}

/* ---------- Sign-in actions ---------- */

export async function signIn(email: string, password: string) {
  const auth = await loadAuth();
  const { signInWithEmailAndPassword } = await import("firebase/auth");
  await signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createLogin(email: string, password: string) {
  const auth = await loadAuth();
  const { createUserWithEmailAndPassword, sendEmailVerification } = await import("firebase/auth");
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  // Best effort: a confirmed email is needed for the ops console and helps a reviewer trust a recovery.
  sendEmailVerification(cred.user).catch(() => {});
}

/** Sends the "confirm your email" link again. */
export async function sendEmailCheck() {
  const auth = await loadAuth();
  const { sendEmailVerification } = await import("firebase/auth");
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

/** Re-reads the login after the person confirms their email, and gets a token that says so. */
export async function refreshSignIn() {
  const auth = await loadAuth();
  const u = auth.currentUser;
  if (!u) return;
  await u.reload();
  await u.getIdToken(true);
  const fresh = auth.currentUser;
  if (fresh) setSession({ status: "signed_in", uid: fresh.uid, email: fresh.email, emailVerified: fresh.emailVerified });
}

export async function signOutNow() {
  if (!SIGN_IN_ON) return;
  const auth = await loadAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

const AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "That email and password don't match. Try again, or reset your password.",
  "auth/wrong-password": "That email and password don't match. Try again, or reset your password.",
  "auth/user-not-found": "That email and password don't match. Try again, or reset your password.",
  "auth/invalid-email": "That email doesn't look right. Check it and try again.",
  "auth/missing-password": "Type your password.",
  "auth/email-already-in-use": "There's already a login with this email. Sign in instead.",
  "auth/weak-password": "Choose a stronger password: at least 8 characters, with a letter and a number.",
  "auth/password-does-not-meet-requirements": "Choose a stronger password: at least 8 characters, with a letter and a number.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes, then try again.",
  "auth/network-request-failed": "We couldn't reach the sign-in service. Check your connection and try again.",
  "auth/user-disabled": "This login has been turned off.",
  "auth/operation-not-allowed": "Email sign-in isn't turned on for this app yet.",
};

/** Turns a Firebase error into a short sentence a person can act on. */
export function friendlyAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  return "Something went wrong. Try again.";
}

/* ---------- API error codes (reported by src/lib/client.ts) ---------- */

export type ApiNotice = "kyc_required" | "recovery_restricted" | "signed_out";

let notice: ApiNotice | null = null;
const codes = new Map<string, string | null>();
const noticeListeners = new Set<() => void>();

/**
 * Called by src/lib/client.ts for every failed request. During a recovery check most reads answer
 * recovery_restricted; the shell already shows calm placeholders for those, so only a blocked change
 * (not a GET) opens the dialog.
 */
export function reportApiError(url: string, status: number, code: string | undefined, method = "GET") {
  codes.set(url, code ?? null);
  const write = method.toUpperCase() !== "GET";
  const next =
    code === "kyc_required" || (code === "recovery_restricted" && write)
      ? code
      : code === "signed_out" && SIGN_IN_ON && status === 401
        ? code
        : null;
  if (!next || next === notice) return;
  notice = next;
  for (const l of noticeListeners) l();
}

/** The `code` of the last failed response for a URL, if it had one. */
export function errorCodeFor(url: string) {
  return codes.get(url) ?? null;
}

export function dismissApiNotice() {
  if (!notice) return;
  notice = null;
  for (const l of noticeListeners) l();
}

function subscribeNotice(cb: () => void) {
  noticeListeners.add(cb);
  return () => {
    noticeListeners.delete(cb);
  };
}

export function useApiNotice(): ApiNotice | null {
  return useSyncExternalStore(
    subscribeNotice,
    () => notice,
    () => null,
  );
}
