/**
 * protection (plan 04): one switch per phone-side protection, so any one of them can be turned off
 * by an update if it misbehaves. No imports here: lib/ files read these switches too.
 * See README.md in this folder for what each one does and how to remove it.
 */
export const PROTECTION = {
  /** App lock turns on by itself once an MPIN is on this phone, unless the person chose before. */
  lockByDefault: true,
  /** Lock after IDLE_LOCK_MS without a touch while the app is open (lock must be on). */
  idleLock: true,
  /** iOS: a blurred cover whenever the app isn't active (app switcher, Control Center, calls). */
  appSwitcherCover: true,
  /** Screenshots and recordings blocked on SENSITIVE_ROUTES (Android also blanks the app switcher there). */
  screenshotBlocking: true,
  /** "Hide balances" on Home. Off: amounts always show and the eye button is gone. */
  hideBalances: true,
  /** A warning on Home when the phone looks rooted or jailbroken. */
  integrityWarning: true,
  /** The Firebase sign-in session in the Keychain / Keystore instead of AsyncStorage (phones only). */
  secureSession: true,
  /** Onboarding turns on Face ID / fingerprint unlock only after a check that passes. */
  biometricRules: true,
  /** Wrong-PIN guard: 1, 5, 30, 60 minute waits, then sign-out (a login on the phone) or Start Practice over (Practice, nobody signed in). */
  escalatingPinGuard: true,
  /** The Data source screen refuses http:// addresses outside development builds. */
  httpsOnly: true,
} as const;

/** How long the app may sit open without a touch before it locks. */
export const IDLE_LOCK_MS = 5 * 60_000;

/** How long a tap on a hidden amount shows the balances for. */
export const PEEK_MS = 30_000;

/** iOS app-switcher blur strength, 0 to 1 (expo-screen-capture). */
export const APP_SWITCHER_BLUR = 0.9;

/**
 * Routes where screenshots and recordings are blocked: money-out flows and every screen with a PIN
 * pad or an ID. Matched against the route path without groups, e.g. "wallet/[action]" or
 * "settings/security"; a prefix also covers the routes under it. A PIN pad inside a tab (Invest's
 * Core buy, a React Native Modal) holds useSensitiveScreen itself.
 */
export const SENSITIVE_ROUTES: readonly string[] = [
  "withdraw",
  "emergency-request",
  "wallet/[action]",
  "checkout",
  "mpin",
  "verify-id",
  "recovery/claim",
  "settings/security",
  // PIN pads
  "unlock",
  "onboarding/pin",
  "settings/reset-mpin",
  "settings/trust-device",
  "settings/limits",
  "settings/delete-account",
];
