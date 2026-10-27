import { body, customer, handle, json, minor } from "@/lib/api";
import { cashOut, walletView } from "@/lib/wallet";
import { CashOutBody } from "../schemas";

/** Wallet → bank. Counts toward the daily limit. Still works with the wallet switched off. */
export const POST = handle(async (req: Request) => {
  const user = await customer({ tick: false, kyc: true });
  const b = await body(req, CashOutBody);
  const journalId = cashOut(user, minor(b.amount));
  return json({ journalId, wallet: walletView(user) }, { status: 201 });
});
