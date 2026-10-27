import { admin, handle, json } from "@/lib/api";
import { kycQueue } from "@/lib/kyc/service";

/** identity: ID checks waiting for a person, oldest first, plus the 20 most recent decisions. */
export const GET = handle(async () => {
  await admin();
  return json(kycQueue());
});
