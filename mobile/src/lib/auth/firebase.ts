import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import type { Auth, Persistence, User as FirebaseUser } from "firebase/auth";
import { getItem, onDeviceReset, removeItem, setItem } from "../storage";

/**
 * identity: Firebase Auth (email and password), the sign-in session the API sends with every
 * request. Configured with EXPO_PUBLIC_FIREBASE_API_KEY, _AUTH_DOMAIN, _PROJECT_ID and _APP_ID.
 * Without them (or with sign-in switched off in features/auth/config.ts) Firebase is never loaded,
 * nobody signs in, and the app runs as the single-account prototype exactly as before.
 *
 * The session survives restarts: AsyncStorage on phones, the browser's local storage on the web.
 * The SDK refreshes the ID token by itself; getIdToken() always returns a current one.
 *
 * A login is tied to the Vaultwise server it was made or used on (the Data source address). Its
 * token only ever goes to that address, never to another one typed in later.
 */

type FirebaseAppSdk = typeof import("firebase/app");
type FirebaseAuthSdk = typeof import("firebase/auth");

/* ---------- config ---------- */

// Read one by one: Expo only inlines EXPO_PUBLIC_* variables written out in full.
const CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY?.trim() || "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN?.trim() || "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim() || "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID?.trim() || "",
};

/** True when the Firebase web config is in the environment. The auth domain defaults to the project's. */
export const firebaseConfigured = !!(CONFIG.apiKey && CONFIG.projectId && CONFIG.appId);

/* ---------- session store ---------- */

export interface AuthUser {
  uid: string;
  email: string | null;
  emailVerified: boolean;
}

export interface AuthState {
  /** Sign-in is on: switched on in features/auth/config.ts and Firebase is configured. */
  enabled: boolean;
  /** The saved session has been read (always true when sign-in is off). */
  ready: boolean;
  user: AuthUser | null;
  /** When this user signed in or was restored, so older 401s can be told apart from new ones. */
  since: number;
  /** Shown once on the sign-in screen, e.g. why the app signed out by itself. */
  notice: string | null;
}

let state: AuthState = { enabled: false, ready: true, user: null, since: 0, notice: null };
let started = false;
let auth: Auth | null = null;

/* ---------- the server a login belongs to ---------- */

const SERVER_KEY = "vw.authServer";
/** The API address the signed-in login was made or used on; the token goes nowhere else. */
let boundServer: string | null = null;

export const normaliseServer = (url: string) => url.trim().replace(/\/+$/, "");

function bindServer(server: string | null) {
  boundServer = server;
  if (server) void setItem(SERVER_KEY, server);
  else void removeItem(SERVER_KEY);
}

// Clearing the phone (Delete account in Practice, say) keeps a login that is still signed in tied
// to its server; signing out unties it (see onAuthStateChanged below).
onDeviceReset(() => {
  if (boundServer && auth?.currentUser) void setItem(SERVER_KEY, boundServer);
  else boundServer = null;
});

const listeners = new Set<() => void>();
const userChangeListeners = new Set<(user: AuthUser | null) => void>();
let readyWaiters: (() => void)[] = [];

function update(next: Partial<AuthState>) {
  state = { ...state, ...next };
  if (state.ready) {
    const waiters = readyWaiters;
    readyWaiters = [];
    waiters.forEach((fn) => fn());
  }
  listeners.forEach((fn) => fn());
}

export const getAuthState = () => state;

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useAuthState() {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState);
}

/**
 * Runs fn when the signed-in person changes (sign-in, sign-out, a different account), never for
 * the first restore at start-up. It runs before screens hear about the change, so cached data of
 * the last person can be dropped first. Returns the unsubscribe.
 */
export function onUserChange(fn: (user: AuthUser | null) => void) {
  userChangeListeners.add(fn);
  return () => {
    userChangeListeners.delete(fn);
  };
}

const toUser = (u: FirebaseUser): AuthUser => ({ uid: u.uid, email: u.email, emailVerified: u.emailVerified });

/* ---------- start-up ---------- */

/** Loaded only when sign-in is on, so the prototype never loads Firebase at all. */
function loadSdk() {
  const app = require("firebase/app") as FirebaseAppSdk;
  const fa = require("firebase/auth") as FirebaseAuthSdk;
  return { app, fa };
}

function createAuth(): Auth {
  const { app: appSdk, fa } = loadSdk();
  const app = appSdk.getApps().length
    ? appSdk.getApp()
    : appSdk.initializeApp({
        apiKey: CONFIG.apiKey,
        authDomain: CONFIG.authDomain || `${CONFIG.projectId}.firebaseapp.com`,
        projectId: CONFIG.projectId,
        appId: CONFIG.appId,
      });
  let persistence: Persistence;
  if (Platform.OS === "web") persistence = fa.browserLocalPersistence;
  else {
    // The React Native build of firebase/auth has getReactNativePersistence; its published types
    // (the web ones) don't list it, so it's looked up rather than imported.
    const rn = (fa as unknown as { getReactNativePersistence?: (storage: unknown) => Persistence }).getReactNativePersistence;
    if (rn) persistence = rn(require("@react-native-async-storage/async-storage").default);
    else {
      console.warn("[auth] getReactNativePersistence is missing: the sign-in won't survive a restart.");
      persistence = fa.inMemoryPersistence;
    }
  }
  try {
    return fa.initializeAuth(app, { persistence });
  } catch {
    // Already initialised (fast refresh).
    return fa.getAuth(app);
  }
}

/** How long the saved session may take to load before the app carries on with what it has. */
const RESTORE_TIMEOUT_MS = 5000;

/**
 * Starts the session once, at launch (root layout). With `enabled` false, or no Firebase config,
 * sign-in stays off for the life of the app.
 */
export function initAuth({ enabled }: { enabled: boolean }) {
  if (started) return;
  started = true;
  if (!enabled || !firebaseConfigured) {
    update({ enabled: false, ready: true, user: null });
    return;
  }
  let instance: Auth;
  try {
    instance = createAuth();
  } catch (e) {
    console.warn("[auth] Firebase didn't start; sign-in is off.", e);
    update({ enabled: false, ready: true, user: null });
    return;
  }
  auth = instance;
  update({ enabled: true, ready: false });
  const { fa } = loadSdk();

  // Ready once both the saved login and the server it belongs to have been read.
  let restored: { user: AuthUser | null } | null = null;
  let serverRead = false;
  const settle = () => {
    if (state.ready || !restored || !serverRead) return;
    update({ ready: true, user: restored.user, since: Date.now(), notice: restored.user ? null : state.notice });
  };
  void getItem(SERVER_KEY).then((saved) => {
    // A login restored without its server stays signed in but sends no token (the server then
    // says signed_out and the app asks to sign in again).
    if (boundServer === null) boundServer = saved;
    serverRead = true;
    settle();
  });
  // A storage that never answers mustn't leave the app on a spinner: carry on with what Firebase has.
  setTimeout(() => {
    if (state.ready) return;
    const u = instance.currentUser;
    restored ??= { user: u ? toUser(u) : null };
    serverRead = true;
    settle();
  }, RESTORE_TIMEOUT_MS);

  fa.onAuthStateChanged(instance, (u) => {
    const user = u ? toUser(u) : null;
    if (!state.ready) {
      restored = { user };
      settle();
      return;
    }
    if ((user?.uid ?? null) === (state.user?.uid ?? null)) return;
    if (!user) bindServer(null);
    userChangeListeners.forEach((fn) => fn(user));
    update({ user, since: Date.now(), notice: user ? null : state.notice });
  });
}

const READY_TIMEOUT_MS = 8000;

/**
 * Resolves once the saved session has been read, so no request goes out unsigned just because
 * the app is still starting. Straight away when sign-in is off or hasn't been started.
 */
export function authReady(): Promise<void> {
  if (!started || state.ready) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, READY_TIMEOUT_MS);
    readyWaiters.push(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * A current ID token for the signed-in person (refreshed by the SDK when needed), only for the
 * server their login belongs to. Null for any other address, or when nobody is signed in.
 */
export async function getIdToken(forServer: string): Promise<string | null> {
  const u = auth?.currentUser;
  if (!u || !boundServer || normaliseServer(forServer) !== boundServer) return null;
  return u.getIdToken();
}

/* ---------- actions ---------- */

function requireAuth(): Auth {
  if (!auth) throw Object.assign(new Error("Sign-in isn't turned on in this app."), { code: "auth/not-configured" });
  return auth;
}

/**
 * Runs a sign-in tied to `server`. The server is set before Firebase answers, because the app
 * starts fetching (with the token) the moment the login changes; a failed sign-in puts it back.
 */
async function signInOn(server: string, run: (a: Auth) => Promise<unknown>) {
  const a = requireAuth();
  const before = boundServer;
  boundServer = normaliseServer(server);
  try {
    await run(a);
    bindServer(boundServer);
  } catch (e) {
    boundServer = before;
    throw e;
  }
}

/** Signs in on `server`, the Vaultwise API address in use (its token goes nowhere else). */
export async function signInWithEmail(email: string, password: string, server: string) {
  const { fa } = loadSdk();
  await signInOn(server, (a) => fa.signInWithEmailAndPassword(a, email.trim(), password));
}

/** Creates a login on `server` and signs in with it. */
export async function createAccountWithEmail(email: string, password: string, server: string) {
  const { fa } = loadSdk();
  await signInOn(server, (a) => fa.createUserWithEmailAndPassword(a, email.trim(), password));
}

/**
 * Sends Firebase's password-reset email. Whether or not an account uses the address, it resolves
 * the same way, so nobody can find out which emails have accounts.
 */
export async function sendResetEmail(email: string) {
  const { fa } = loadSdk();
  try {
    await fa.sendPasswordResetEmail(requireAuth(), email.trim());
  } catch (e) {
    const code = (e as { code?: string })?.code;
    if (code === "auth/user-not-found" || code === "auth/invalid-email") return;
    throw e;
  }
}

/** Signs out on this phone. `notice` is shown once on the sign-in screen. */
export async function signOutNow(notice: string | null = null) {
  if (!auth) return;
  const { fa } = loadSdk();
  update({ notice });
  await fa.signOut(auth);
}

export function clearAuthNotice() {
  if (state.notice) update({ notice: null });
}

/* ---------- errors ---------- */

const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "This doesn't look like an email address.",
  "auth/missing-email": "Add your email address.",
  "auth/missing-password": "Add your password.",
  "auth/invalid-credential": "That email and password don't match. Try again, or reset your password.",
  "auth/invalid-login-credentials": "That email and password don't match. Try again, or reset your password.",
  "auth/wrong-password": "That email and password don't match. Try again, or reset your password.",
  "auth/user-not-found": "That email and password don't match. Try again, or reset your password.",
  "auth/email-already-in-use": "There's already an account with this email. Sign in instead.",
  "auth/weak-password": "Choose a stronger password: at least 8 characters, with a letter and a number.",
  "auth/password-does-not-meet-requirements": "Choose a stronger password: at least 8 characters, with a letter and a number.",
  "auth/too-many-requests": "Too many tries. Wait a few minutes, then try again.",
  "auth/network-request-failed": "Can't reach the sign-in service. Check your connection.",
  "auth/user-disabled": "This login is turned off. If you think that's a mistake, contact Vaultwise support.",
  "auth/operation-not-allowed": "Email sign-in isn't turned on for this app yet.",
  "auth/not-configured": "Sign-in isn't turned on in this app.",
};

/** Plain words for a Firebase Auth error. */
export function authErrorMessage(e: unknown, fallback = "Sign-in didn't work. Try again.") {
  const code = (e as { code?: string })?.code;
  return (code && MESSAGES[code]) || fallback;
}
