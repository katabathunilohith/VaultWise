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
 * Whether money-out routes check the ID (the `kyc: true` gate). Always on unless KYC_ENFORCED is
 * exactly "false", so switching KYC off also lets accounts that started "pending" move money again.
 */
export function kycGateOn(): boolean {
  return process.env.KYC_ENFORCED?.trim().toLowerCase() !== "false";
}
