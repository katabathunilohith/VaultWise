import { customer, handle, json } from "@/lib/api";
import { startDigiLocker } from "@/lib/kyc/checks";

export const maxDuration = 30;

/**
 * kyc-checks: step 2 begins. No body → { url, requestId }. Open `url` (the provider's DigiLocker page);
 * DigiLocker sends the person back to KYC_DIGILOCKER_REDIRECT_URL (default this server's /verify).
 */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false });
  return json(await startDigiLocker(user, new URL(req.url).origin));
});
