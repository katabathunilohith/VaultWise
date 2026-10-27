import { handle, json } from "@/lib/api";
import { assertRecoveryEnabled } from "@/lib/recovery/config";
import { authMode } from "@/lib/auth/config";
import { clientKeys, requestHeaders } from "@/lib/auth/context";
import { signedIn } from "@/lib/auth/session";
import { HttpError } from "@/lib/users";
import { readIdForm } from "@/lib/kyc/form";
import { cancelClaim, claimStatus, createClaim } from "@/lib/recovery/service";

export const maxDuration = 90;

const notAvailable = () => new HttpError(400, "Account recovery needs sign-in, which isn't turned on here.", "not_available");

/** identity: the caller's latest recovery claim → { claim: ClaimView | null }. */
export const GET = handle(async () => {
  assertRecoveryEnabled();
  if (authMode() !== "firebase") return json({ claim: null });
  const token = await signedIn();
  return json({ claim: claimStatus(token.uid) });
});

/**
 * A new sign-in with no wallet proves the ID of an existing, verified wallet. Multipart { docType, file, idNumber? }.
 * On a match: claim pending, read-only access, the account's email is told, a person decides. → 201 { claim }.
 */
export const POST = handle(async (req: Request) => {
  assertRecoveryEnabled();
  if (authMode() !== "firebase") throw notAvailable();
  const token = await signedIn();
  const keys = clientKeys(await requestHeaders());
  const form = await readIdForm(req, { fileRequired: true });
  return json({ claim: await createClaim(token, form, keys) }, { status: 201 });
});

/** Cancels the caller's pending claim; the sign-in goes back to having no wallet. */
export const DELETE = handle(async () => {
  assertRecoveryEnabled();
  if (authMode() !== "firebase") throw notAvailable();
  const token = await signedIn();
  return json({ claim: await cancelClaim(token.uid) });
});
