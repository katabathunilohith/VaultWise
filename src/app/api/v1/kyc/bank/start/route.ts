import { customer, handle, json } from "@/lib/api";
import { startBank } from "@/lib/kyc/checks";

export const maxDuration = 30;

/** kyc-checks: step 3 begins. No body → { upiLink, requestId, expiresAt }: a ₹1 UPI payment from the account to check. */
export const POST = handle(async () => {
  const user = await customer({ tick: false });
  return json(await startBank(user));
});
