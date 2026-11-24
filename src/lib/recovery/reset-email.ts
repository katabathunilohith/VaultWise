/**
 * The password-reset email sender: Firebase Identity Toolkit `accounts:sendOobCode` (PASSWORD_RESET),
 * keyed by FIREBASE_WEB_API_KEY. It never throws and never reports whether the address exists, so the
 * answer to the client is the same either way. Unset key: nothing is sent and a warning is logged once.
 */

let warnedNoKey = false;

export async function sendPasswordReset(email: string) {
  const key = process.env.FIREBASE_WEB_API_KEY?.trim();
  if (!key) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("[recovery] FIREBASE_WEB_API_KEY is not set: password-reset emails are not sent by the server.");
    }
    return;
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
      signal: AbortSignal.timeout(8000),
    });
    // EMAIL_NOT_FOUND and similar are expected; the answer to the client is the same either way.
    if (!res.ok && res.status >= 500) console.warn(`[recovery] password reset request failed (${res.status})`);
  } catch {
    console.warn("[recovery] password reset request did not complete");
  }
}
