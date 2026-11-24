/**
 * Identity switches, read on every call so a test (or a restart with new env) can flip them.
 *
 *   FIREBASE_PROJECT_ID  set   → "firebase" mode: every request carries a Firebase ID token.
 *                        unset → "prototype" mode: the first user is the customer, no sign-in (today's behaviour).
 *   ADMIN_EMAILS         comma list of signed-in emails allowed to use /api/v1/admin/* in firebase mode.
 *   KYC_ENFORCED         new sign-ups start KYC "pending": firebase mode unless "false"; prototype mode only if "true".
 *                        "false" also turns off the money-out ID gate.
 */

export type AuthMode = "prototype" | "firebase";

export function firebaseProjectId(): string | null {
  const id = process.env.FIREBASE_PROJECT_ID?.trim();
  return id ? id : null;
}

export function authMode(): AuthMode {
  return firebaseProjectId() ? "firebase" : "prototype";
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Whether new sign-ups must verify an ID before money can move out.
 * Prototype mode keeps today's simulated auto-verify unless KYC_ENFORCED is "true",
 * so an unconfigured server behaves exactly as before.
 */
export function kycEnforced(): boolean {
  const v = process.env.KYC_ENFORCED?.trim().toLowerCase();
  if (authMode() === "firebase") return v !== "false";
  return v === "true";
}

/**
 * Whether money routes check the ID (the `kyc: true` gate: money out, and money coming in from the bank; see src/lib/money-routes.ts). Always on unless KYC_ENFORCED is
 * exactly "false", so switching KYC off also lets accounts that started "pending" move money again.
 */
export function kycGateOn(): boolean {
  return process.env.KYC_ENFORCED?.trim().toLowerCase() !== "false";
}

/**
 * Plan 05 start-up guard. Without FIREBASE_PROJECT_ID the server is the open prototype: anyone with the
 * address is the customer, can open the admin console, and `POST /api/v1/reset` wipes the database.
 * So a production server must have sign-in configured, unless someone opts into the prototype on purpose
 * with ALLOW_PROTOTYPE_IN_PRODUCTION=true (for example a local `npm start` check).
 *
 * Returns the reason the server must not serve, or null when it may. Called once at start-up by
 * `register()` in src/instrumentation.ts; takes the environment as an argument so tests can pass their own.
 */
export function productionStartupProblem(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  if (env.NODE_ENV !== "production") return null;
  if (env.FIREBASE_PROJECT_ID?.trim()) return null;
  if (env.ALLOW_PROTOTYPE_IN_PRODUCTION?.trim().toLowerCase() === "true") return null;
  return (
    "Vaultwise won't start: NODE_ENV is production but FIREBASE_PROJECT_ID is not set, so there is no sign-in. " +
    "Without it anyone with the address is the customer, can open the admin console and can wipe the database. " +
    "Set FIREBASE_PROJECT_ID (see deploy/README.md), or set ALLOW_PROTOTYPE_IN_PRODUCTION=true to run the open prototype on purpose."
  );
}

/**
 * Settings a production server should have, as plain-English warnings. They don't stop the server:
 * each feature that needs one already refuses on its own (e.g. ID checks answer 500 `server_config`).
 */
export function productionStartupWarnings(env: Readonly<Record<string, string | undefined>> = process.env): string[] {
  if (env.NODE_ENV !== "production") return [];
  const set = (k: string) => !!env[k]?.trim();
  const out: string[] = [];
  if (!set("FIREBASE_PROJECT_ID")) out.push("ALLOW_PROTOTYPE_IN_PRODUCTION is on: this server has no sign-in. Don't put it on the internet.");
  else {
    if (!set("IDENTITY_SECRET")) out.push("IDENTITY_SECRET is not set: ID checks and account recovery will refuse until it is.");
    if (!set("ADMIN_EMAILS")) out.push("ADMIN_EMAILS is not set: nobody can open the reviewer console.");
    if (!set("FIREBASE_WEB_API_KEY")) out.push("FIREBASE_WEB_API_KEY is not set: password-reset emails can't be sent.");
  }
  if (!set("TRUST_PROXY_HOPS") && !set("TRUST_PROXY_HEADER")) out.push("TRUST_PROXY_HOPS is not set: behind Caddy set it to 1, so rate limits see each visitor's address.");
  // kyc-checks: the same rule as setuBaseUrl() in src/lib/kyc/checks/providers/setu.ts.
  const lower = (k: string) => env[k]?.trim().toLowerCase() ?? "";
  if (lower("KYC_FLOW") === "steps" && lower("KYC_CHECKS_PROVIDER") === "setu") {
    const testAllowed = lower("KYC_CHECKS_TEST_ALLOWED") === "true";
    if (!set("SETU_BASE_URL")) out.push("SETU_BASE_URL is not set: ID checks through Setu will refuse until it is (https://dg.setu.co for live checks).");
    else if (lower("SETU_BASE_URL").includes("//dg-sandbox.") && !testAllowed)
      out.push("SETU_BASE_URL is Setu's sandbox: ID checks will refuse unless KYC_CHECKS_TEST_ALLOWED=true (a test-mode deployment).");
  }
  return out;
}
