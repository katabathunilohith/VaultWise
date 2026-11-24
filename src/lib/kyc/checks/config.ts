import { HttpError } from "../../users";

/**
 * Switches for the onboarding checks, read on every call so tests and a restart-free env change work.
 *
 * - KYC_FLOW: `photo` (default, today's ID photo check) or `steps` (PAN, DigiLocker, bank).
 * - KYC_CHECKS_PROVIDER: `test` (default, deterministic, no network) or `setu` (Setu's APIs).
 * - KYC_CHECKS_TEST_ALLOWED: the test provider verifies anyone who types its sample PAN, and Setu's sandbox
 *   answers with sample data, so with NODE_ENV=production both are refused unless this is "true" (a test-mode
 *   deployment). A production server using Setu must also set SETU_BASE_URL explicitly (providers/setu.ts).
 * - KYC_DIGILOCKER_REDIRECT_URL: where DigiLocker sends the person back. Default: this server's `/verify`.
 */

export type KycFlow = "photo" | "steps";
export type ChecksProviderName = "test" | "setu";

export function kycFlow(): KycFlow {
  return process.env.KYC_FLOW?.trim().toLowerCase() === "steps" ? "steps" : "photo";
}

/** The steps are Indian checks (PAN, Aadhaar, UPI), so only India accounts get them; others keep the photo check. */
export function flowFor(user: { jurisdiction: string }): KycFlow {
  return kycFlow() === "steps" && user.jurisdiction === "IN" ? "steps" : "photo";
}

export function checksProviderName(): ChecksProviderName {
  return process.env.KYC_CHECKS_PROVIDER?.trim().toLowerCase() === "setu" ? "setu" : "test";
}

/**
 * Test data (the test provider, a provider's sandbox) may run: always outside production, and on a
 * production build only with KYC_CHECKS_TEST_ALLOWED=true (a test-mode deployment).
 */
export function checksTestAllowed(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.NODE_ENV !== "production" || env.KYC_CHECKS_TEST_ALLOWED?.trim().toLowerCase() === "true";
}

/** The answer when the checks are set up wrongly for this server (the reason goes to the log). */
export function checksConfigError(logLine: string) {
  console.error(`[kyc-checks] ${logLine}`);
  return new HttpError(500, "ID checks aren't set up on this server yet.", "server_config");
}

/** Throws the setup error when the test provider would run on a production server without being allowed. */
export function assertTestChecksAllowed() {
  if (checksTestAllowed()) return;
  throw checksConfigError("KYC_CHECKS_PROVIDER=test on a production server. Set KYC_CHECKS_PROVIDER=setu, or KYC_CHECKS_TEST_ALLOWED=true for a test-mode deployment.");
}

/** Where DigiLocker returns the person. `origin` is the calling request's origin (the web app's /verify page). */
export function digilockerRedirectUrl(origin: string): string {
  const set = process.env.KYC_DIGILOCKER_REDIRECT_URL?.trim();
  return set || `${origin.replace(/\/+$/, "")}/verify`;
}

/** How many times a day each step may be tried (provider calls cost money and hit rate limits). */
export const TRIES_PER_DAY = 5;
