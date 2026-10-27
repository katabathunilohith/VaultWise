/**
 * identity: the one switch for web sign-in, ID checks (KYC) and account recovery.
 *
 * Sign-in turns on only when IDENTITY_ENABLED is true AND the NEXT_PUBLIC_FIREBASE_* settings are set.
 * Otherwise the app behaves exactly as the prototype always has: no sign-in, the first user is the customer.
 */
export const IDENTITY_ENABLED = true;

// Each variable is read by its full name so Next.js can inline it into the browser bundle at build time.
const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "";
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "";
const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "";
const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "";

export const FIREBASE_CONFIG = {
  apiKey,
  authDomain: authDomain || (projectId ? `${projectId}.firebaseapp.com` : ""),
  projectId,
  appId,
};

/** True when people must sign in to use the web app. */
export const SIGN_IN_ON = IDENTITY_ENABLED && apiKey !== "" && projectId !== "";

/** Recovery claims close after this long without a decision (matches the server). */
export const CLAIM_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const ME_URL = "/api/v1/me";

/**
 * Pages that stay open while a person checks an account recovery. The server only answers /me, the
 * dashboard, the vault list and the recovery routes then; every other page shows a calm placeholder.
 */
export const RECOVERY_PAGES = ["/", "/vaults", "/recover"];
