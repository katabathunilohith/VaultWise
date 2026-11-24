import { audit } from "../audit";
import type { HttpError } from "../users";
import { last4, maskEmail } from "../kyc/ids";
import { assertIdentitySecret, idHash } from "../kyc/secret";
import { verifiedHolder } from "../kyc/store";
import { numberFrom, userById, type IdForm } from "./id-form";
import { clientTag, spendTry } from "./limits";
import { makeFindToken } from "./tokens";

/* ---------- Find (no sign-in) ---------- */

export interface FindAnswer {
  found: boolean;
  maskedEmail?: string;
  canReset: boolean;
  findToken?: string;
}

export async function findAccount(form: IdForm, clientKeys: string[]): Promise<FindAnswer> {
  assertIdentitySecret();
  spendTry("find", clientKeys);
  const tag = clientTag(clientKeys);
  let number: string | null = null;
  try {
    ({ number } = await numberFrom(form));
  } catch (e) {
    audit({ actor: "recovery", actorType: "system", action: "recovery.find_attempt", entityType: "recovery", details: { docType: form.docType, matched: false, client: tag, error: (e as HttpError).code ?? "error" } });
    throw e;
  }
  const holder = number ? verifiedHolder(idHash(form.docType, number)) : undefined;
  const user = holder ? userById(holder.user_id) : undefined;
  audit({
    userId: user?.id ?? null,
    actor: "recovery",
    actorType: "system",
    action: "recovery.find_attempt",
    entityType: "recovery",
    details: { docType: form.docType, matched: !!user, client: tag, idLast4: number && user ? last4(number) : undefined },
  });
  if (!user) return { found: false, canReset: false };
  const masked = maskEmail(user.email);
  return masked ? { found: true, maskedEmail: masked, canReset: true, findToken: makeFindToken(user.id) } : { found: true, canReset: false };
}
