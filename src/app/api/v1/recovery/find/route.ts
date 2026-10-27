import { handle, json } from "@/lib/api";
import { assertRecoveryEnabled } from "@/lib/recovery/config";
import { clientKeys, requestHeaders } from "@/lib/auth/context";
import { readIdForm } from "@/lib/kyc/form";
import { findAccount } from "@/lib/recovery/service";

export const maxDuration = 90;

/**
 * identity: "I forgot which email I used" (no sign-in). Multipart { docType, file?, idNumber? } (or JSON without a file).
 * → { found, maskedEmail?, canReset, findToken? }. 5 tries per hour per client; every try is audited.
 */
export const POST = handle(async (req: Request) => {
  assertRecoveryEnabled();
  const keys = clientKeys(await requestHeaders());
  const form = await readIdForm(req, { fileRequired: false });
  return json(await findAccount(form, keys));
});
