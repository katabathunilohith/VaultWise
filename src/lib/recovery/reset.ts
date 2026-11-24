import { audit } from "../audit";
import { authMode } from "../auth/config";
import { isClosed } from "../auth/identities";
import { assertIdentitySecret } from "../kyc/secret";
import { userById } from "./id-form";
import { clientTag, spendTry } from "./limits";
import { sendPasswordReset } from "./reset-email";
import { readFindToken } from "./tokens";

/* ---------- Password reset (no sign-in, never says whether the account exists) ---------- */

export async function requestReset(input: { email?: string | null; findToken?: string | null }, clientKeys: string[]) {
  if (input.findToken) assertIdentitySecret();
  spendTry("reset", clientKeys);
  let email: string | null = null;
  let userId: string | null = null;
  let via: "email" | "findToken" | "none" = "none";
  if (input.findToken) {
    via = "findToken";
    userId = readFindToken(input.findToken);
    const user = userId && !isClosed(userId) ? userById(userId) : undefined;
    email = user?.email ?? null;
    if (!user) userId = null;
  } else if (input.email) {
    via = "email";
    email = input.email.trim().toLowerCase();
  }
  audit({ userId, actor: "recovery", actorType: "system", action: "recovery.reset_requested", entityType: "recovery", details: { via, client: clientTag(clientKeys) } });
  if (authMode() === "prototype") return { ok: true as const, simulated: true as const };
  if (email) await sendPasswordReset(email);
  return { ok: true as const };
}
