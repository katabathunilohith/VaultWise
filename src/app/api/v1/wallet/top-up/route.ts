import { body, customer, handle, json, minor } from "@/lib/api";
import { topUp, walletView } from "@/lib/wallet";
import { TopUpBody } from "../schemas";

/** Bank → wallet. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, kyc: true });
  const b = await body(req, TopUpBody);
  const journalId = topUp(user, minor(b.amount));
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
