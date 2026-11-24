import type { User } from "../users";
import type { VerifiedToken } from "../auth/verify";
import type { IdAnalysis } from "../kyc/analyse";
import { DOC_LABELS, last4, maskEmail, maskId, type DocType } from "../kyc/ids";
import { compareNames } from "../kyc/names";
import type { KycCheck } from "../kyc/types";

/**
 * What a claim shows the reviewer, and whether the claimant gets read-only access while it waits.
 * Pure: everything it needs is passed in.
 */
export function claimChecks(x: {
  analysis: IdAnalysis;
  /** The account the ID matched. */
  user: User;
  /** The new sign-in making the claim. */
  token: VerifiedToken;
  docType: DocType;
  /** The matched ID number. */
  number: string;
  /** Other pending claims for the same account. */
  otherPending: number;
}): { checks: KycCheck[]; reasons: string[]; provisional: boolean } {
  const { analysis, user, token } = x;
  const checks: KycCheck[] = [...analysis.checks];
  const reasons: string[] = [...analysis.reasons];
  const name = compareNames(analysis.nameOnDoc, user.name);
  checks.push({
    label: "Name on account",
    status: name.result === "match" ? "pass" : name.result === "mismatch" ? "fail" : "warn",
    detail: `Card name vs account name: ${name.result} (${(name.score * 100).toFixed(0)}%)`,
  });
  checks.push({ label: "Matched ID", status: "pass", detail: `${DOC_LABELS[x.docType]} ${maskId(x.docType, last4(x.number))} matches the account's verified ID` });
  checks.push({
    label: "New sign-in email",
    status: token.emailVerified ? "pass" : "warn",
    detail: token.email ? `${token.email} (${token.emailVerified ? "verified" : "not verified"}, ${token.provider})` : `No email (${token.provider})`,
  });
  checks.push({
    label: "Account email",
    status: user.email ? "info" : "warn",
    detail: user.email ? `Notice sent to ${maskEmail(user.email)}` : "The account has no email to notify",
  });
  const others = x.otherPending;
  if (others) checks.push({ label: "Other claims", status: "warn", detail: `${others} other pending claim(s) for this account` });

  // Provisional read-only access only when the card itself backs the claim: the model read it, it is the
  // chosen ID type, the number on the card is the matched one (and equals any typed number), the name fits,
  // and there is no sign of editing. Anything else waits for a person with no access at all.
  const sg = analysis.signals;
  const provisional =
    analysis.aiUsed &&
    sg.isIdDocument &&
    sg.docTypeMatches &&
    sg.legible &&
    !sg.expired &&
    !sg.editSignals &&
    !!sg.readNumber &&
    sg.readNumber === x.number &&
    sg.typedMatchesCard !== false &&
    (name.result === "match" || name.result === "partial");
  checks.push({
    label: "Access while waiting",
    status: provisional ? "pass" : "info",
    detail: provisional ? "Checks passed: read-only summary until a person decides" : "No access until a person approves",
  });
  if (!provisional) reasons.push("A person will check your ID before you can see the account.");
  return { checks, reasons, provisional };
}
