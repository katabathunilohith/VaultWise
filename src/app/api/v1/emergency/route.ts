import { customer, handle, json } from "@/lib/api";
import { emergencyStatus } from "@/lib/emergency";

export const GET = handle(async () => {
  const user = await customer();
  return json({ ...emergencyStatus(user), currency: user.currency, hasPin: !!user.pin_hash });
});
