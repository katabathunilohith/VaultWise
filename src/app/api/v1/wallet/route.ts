import { customer, handle, json } from "@/lib/api";
import { walletView } from "@/lib/wallet";

/** The wallet: balance, safe to spend today, payday estimate, daily limit, auto-save source and recent moves. */
export const GET = handle(async () => {
  const user = await customer({ access: "read" });
  return json(walletView(user));
});
