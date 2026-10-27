import { PRACTICE_ONLY } from "@/lib/build";

/**
 * The one switch for signing in on the phone (identity). On, and with the Firebase web config in
 * the environment (EXPO_PUBLIC_FIREBASE_*), the live app asks people to sign in and sends their
 * sign-in with every request. Off, or without that config, the app is the single-account prototype
 * exactly as before: no sign-in screens, no tokens, Firebase never loads.
 * Always off in the Practice-only store build (lib/build.ts).
 */
export const SIGN_IN_ENABLED = !PRACTICE_ONLY;
